import { Modal, Notice, Setting, debounce } from "obsidian"
import { IJiraIssue, IJiraUser } from "../interfaces/issueInterfaces"
import { IPeopleFieldMapping, IPredefinedAssignee } from "../interfaces/settingsInterfaces"
import { ObsidianApp } from "../main"
import JiraClient from "../client/jiraClient"
import ObjectsCache from "../objectsCache"
import { createAvatarPlaceholder } from "../rendering/renderingCommon"
import { SettingsData } from "../settings"

interface UserOption {
    accountId: string
    displayName: string
    avatarUrl?: string
    emailAddress?: string
    isFromSearch?: boolean
}

export class PeopleFieldsModal extends Modal {
    private _issue: IJiraIssue
    private _onComplete: (updatedIssue: IJiraIssue) => void
    private _fieldMappings: IPeopleFieldMapping[]
    private _predefinedAssignees: IPredefinedAssignee[]
    private _searchResults: UserOption[]
    private _selectedFields: Set<string>
    private _selectedAccountId: string | null
    private _isLoading: boolean
    private _resultsContainer: HTMLElement
    private _applyButton: HTMLButtonElement

    constructor(
        issue: IJiraIssue,
        onComplete: (updatedIssue: IJiraIssue) => void
    ) {
        super(ObsidianApp)
        this._issue = issue
        this._onComplete = onComplete
        this._fieldMappings = issue.account?.peopleFieldMappings || []
        this._predefinedAssignees = issue.account?.predefinedAssignees || []
        this._searchResults = []
        // Restore last selected fields
        this._selectedFields = new Set(issue.account?.lastSelectedPeopleFields || [])
        this._selectedAccountId = null
        this._isLoading = false
    }

    onOpen() {
        const { contentEl } = this
        contentEl.empty()
        contentEl.addClass('jira-people-fields-modal')

        contentEl.createEl('h2', { text: `Assign to Fields: ${this._issue.key}` })

        // Field selection section
        contentEl.createEl('div', { text: 'Select fields to update', cls: 'jira-people-fields-section-label' })

        const checkboxContainer = contentEl.createDiv({ cls: 'jira-people-fields-checkbox-list' })
        this.renderFieldCheckboxes(checkboxContainer)

        contentEl.createEl('div', { cls: 'jira-people-fields-separator' })

        // User selection section
        contentEl.createEl('div', { text: 'Select user', cls: 'jira-people-fields-section-label' })

        // Search input
        new Setting(contentEl)
            .setName('Search users')
            .addText(text => {
                text.setPlaceholder('Type to search...')
                text.inputEl.addEventListener('input', debounce((e: Event) => {
                    const query = (e.target as HTMLInputElement).value.trim()
                    if (query.length >= 2) {
                        this.searchUsers(query)
                    } else {
                        this._searchResults = []
                        this.renderUsers()
                    }
                }, 300, true))
            })

        this._resultsContainer = contentEl.createDiv({ cls: 'jira-people-fields-results' })
        this.renderUsers()

        // Buttons
        const buttonSetting = new Setting(contentEl)
            .addButton(btn => btn
                .setButtonText('Cancel')
                .onClick(() => this.close()))
            .addButton(btn => {
                this._applyButton = btn.buttonEl
                btn.setButtonText(this.getApplyButtonText())
                    .setCta()
                    .onClick(async () => {
                        await this.applyChanges()
                    })
                this.updateApplyButtonState()
            })
    }

    private renderFieldCheckboxes(container: HTMLElement): void {
        container.empty()

        for (const mapping of this._fieldMappings) {
            const item = container.createDiv({ cls: 'jira-people-fields-checkbox-item' })

            const checkbox = item.createEl('input', {
                type: 'checkbox',
                attr: { id: `field-${mapping.fieldId}` }
            })
            checkbox.checked = this._selectedFields.has(mapping.fieldId)
            checkbox.addEventListener('change', () => {
                if (checkbox.checked) {
                    this._selectedFields.add(mapping.fieldId)
                } else {
                    this._selectedFields.delete(mapping.fieldId)
                }
                this.updateApplyButtonState()
            })

            const label = item.createEl('label', {
                attr: { for: `field-${mapping.fieldId}` },
                cls: 'jira-people-fields-field-info'
            })
            label.createDiv({ cls: 'jira-people-fields-field-name', text: mapping.displayName })
            label.createDiv({ cls: 'jira-people-fields-field-id', text: mapping.fieldId })
        }
    }

    private async searchUsers(query: string): Promise<void> {
        this._isLoading = true
        this.renderUsers()

        try {
            const users = await JiraClient.searchAssignableUsers(this._issue.key, query, {
                account: this._issue.account
            })

            this._searchResults = users.map(user => ({
                accountId: user.accountId || user.key || user.name,
                displayName: user.displayName,
                avatarUrl: user.avatarUrls?.['24x24'],
                emailAddress: user.emailAddress,
                isFromSearch: true
            }))
        } catch (error) {
            console.error('Failed to search users:', error)
            new Notice(`Failed to search users: ${error.message}`)
            this._searchResults = []
        }

        this._isLoading = false
        this.renderUsers()
    }

    private renderUsers(): void {
        this._resultsContainer.empty()

        if (this._isLoading) {
            this._resultsContainer.createEl('p', { text: 'Searching...', cls: 'jira-people-fields-loading' })
            return
        }

        // Quick Access section - Unassigned option
        this._resultsContainer.createEl('div', { text: 'Quick Access', cls: 'jira-people-fields-section-label' })

        const unassignedItem = this._resultsContainer.createDiv({
            cls: `jira-people-fields-user-item${this._selectedAccountId === null ? ' is-selected' : ''}`,
            attr: { 'data-account-id': 'null' }
        })

        const unassignedAvatar = unassignedItem.createDiv({ cls: 'jira-people-fields-avatar jira-people-fields-avatar-empty' })
        unassignedAvatar.createSpan({ text: '?' })

        const unassignedInfo = unassignedItem.createDiv({ cls: 'jira-people-fields-user-info' })
        unassignedInfo.createDiv({ cls: 'jira-people-fields-user-name', text: 'Unassigned' })
        unassignedInfo.createDiv({ cls: 'jira-people-fields-user-email', text: 'Clear selected fields' })

        unassignedItem.addEventListener('click', () => {
            this._selectedAccountId = null
            this.updateUserSelection()
        })

        // Predefined assignees section
        if (this._predefinedAssignees.length > 0) {
            this._resultsContainer.createEl('div', { cls: 'jira-people-fields-separator' })
            this._resultsContainer.createEl('div', { text: 'Predefined Assignees', cls: 'jira-people-fields-section-label' })

            for (const assignee of this._predefinedAssignees) {
                this.renderUserOption(assignee)
            }
        }

        // Search results section
        if (this._searchResults.length > 0) {
            const filteredResults = this._searchResults.filter(
                result => !this._predefinedAssignees.some(p => p.accountId === result.accountId)
            )

            if (filteredResults.length > 0) {
                this._resultsContainer.createEl('div', { cls: 'jira-people-fields-separator' })
                this._resultsContainer.createEl('div', { text: 'Search Results', cls: 'jira-people-fields-section-label' })

                for (const result of filteredResults) {
                    this.renderUserOption(result)
                }
            }
        }
    }

    private renderUserOption(user: UserOption): void {
        const isSelected = this._selectedAccountId === user.accountId

        const item = this._resultsContainer.createDiv({
            cls: `jira-people-fields-user-item${isSelected ? ' is-selected' : ''}`,
            attr: { 'data-account-id': user.accountId }
        })

        // Avatar
        if (user.avatarUrl) {
            item.createEl('img', {
                cls: 'jira-people-fields-avatar',
                attr: { src: user.avatarUrl, alt: user.displayName }
            })
        } else {
            const placeholder = createAvatarPlaceholder(user.displayName, 32)
            placeholder.addClass('jira-people-fields-avatar')
            item.appendChild(placeholder)
        }

        // Info section
        const info = item.createDiv({ cls: 'jira-people-fields-user-info' })
        info.createDiv({ cls: 'jira-people-fields-user-name', text: user.displayName })
        if (user.emailAddress) {
            info.createDiv({ cls: 'jira-people-fields-user-email', text: user.emailAddress })
        }

        // Click handler
        item.addEventListener('click', () => {
            this._selectedAccountId = user.accountId
            this.updateUserSelection()
        })
    }

    private updateUserSelection(): void {
        const items = this._resultsContainer.querySelectorAll('.jira-people-fields-user-item')
        items.forEach(item => {
            const accountId = item.getAttribute('data-account-id')
            const isSelected = accountId === 'null'
                ? this._selectedAccountId === null
                : accountId === this._selectedAccountId

            if (isSelected) {
                item.addClass('is-selected')
            } else {
                item.removeClass('is-selected')
            }
        })
        this.updateApplyButtonState()
    }

    private getApplyButtonText(): string {
        const count = this._selectedFields.size
        if (count === 0) {
            return 'Apply'
        }
        return `Apply to ${count} field${count > 1 ? 's' : ''}`
    }

    private updateApplyButtonState(): void {
        if (this._applyButton) {
            this._applyButton.textContent = this.getApplyButtonText()
            // Disable if no fields selected
            this._applyButton.disabled = this._selectedFields.size === 0
        }
    }

    private async applyChanges(): Promise<void> {
        if (this._selectedFields.size === 0) {
            new Notice('No fields selected')
            return
        }

        try {
            // Build field updates
            const fieldUpdates: Record<string, string | null> = {}
            for (const fieldId of this._selectedFields) {
                fieldUpdates[fieldId] = this._selectedAccountId
            }

            await JiraClient.updateIssuePeopleFields(this._issue.key, fieldUpdates, {
                account: this._issue.account
            })

            // Update local issue object
            const selectedUser = this._selectedAccountId
                ? this._predefinedAssignees.find(a => a.accountId === this._selectedAccountId) ||
                  this._searchResults.find(a => a.accountId === this._selectedAccountId)
                : null

            for (const fieldId of this._selectedFields) {
                if (this._selectedAccountId === null) {
                    this._issue.fields[fieldId] = null
                } else {
                    this._issue.fields[fieldId] = {
                        accountId: this._selectedAccountId,
                        displayName: selectedUser?.displayName || 'Unknown',
                        active: true,
                        avatarUrls: {}
                    } as IJiraUser
                }
            }

            ObjectsCache.add(this._issue.key, this._issue, false)

            // Save last selected fields
            await this.saveLastSelectedFields()

            this._onComplete(this._issue)

            const fieldsCount = this._selectedFields.size
            const msg = this._selectedAccountId === null
                ? `Cleared ${fieldsCount} field${fieldsCount > 1 ? 's' : ''}`
                : `Assigned ${selectedUser?.displayName || 'user'} to ${fieldsCount} field${fieldsCount > 1 ? 's' : ''}`
            new Notice(msg)
            this.close()
        } catch (error) {
            console.error('Failed to update people fields:', error)
            new Notice(`Failed to update fields: ${error.message}`)
        }
    }

    private async saveLastSelectedFields(): Promise<void> {
        if (!this._issue.account) return

        // Find the account in settings and update lastSelectedPeopleFields
        const accountIndex = SettingsData.accounts.findIndex(
            a => a.alias === this._issue.account?.alias
        )
        if (accountIndex >= 0) {
            SettingsData.accounts[accountIndex].lastSelectedPeopleFields = Array.from(this._selectedFields)
            // Note: The actual saving is handled by the settings tab
            // We update the in-memory settings, which will be persisted on next save
        }
    }

    onClose() {
        this.contentEl.empty()
    }
}
