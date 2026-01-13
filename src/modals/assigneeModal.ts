import { Modal, Notice, Setting, TextComponent, debounce } from "obsidian"
import { IJiraIssue, IJiraUser } from "../interfaces/issueInterfaces"
import { IPredefinedAssignee } from "../interfaces/settingsInterfaces"
import { ObsidianApp } from "../main"
import JiraClient from "../client/jiraClient"
import ObjectsCache from "../objectsCache"

interface AssigneeOption {
    accountId: string
    displayName: string
    avatarUrl?: string
    isFromSearch?: boolean
}

export class AssigneeModal extends Modal {
    private _issue: IJiraIssue
    private _onComplete: (updatedIssue: IJiraIssue) => void
    private _predefinedAssignees: IPredefinedAssignee[]
    private _searchResults: AssigneeOption[]
    private _selectedAccountId: string | null
    private _isLoading: boolean
    private _searchContainer: HTMLElement
    private _resultsContainer: HTMLElement

    constructor(
        issue: IJiraIssue,
        onComplete: (updatedIssue: IJiraIssue) => void
    ) {
        super(ObsidianApp)
        this._issue = issue
        this._onComplete = onComplete
        this._predefinedAssignees = issue.account?.predefinedAssignees || []
        this._searchResults = []
        this._selectedAccountId = issue.fields.assignee?.accountId || null
        this._isLoading = false
    }

    onOpen() {
        const { contentEl } = this
        contentEl.empty()
        contentEl.addClass('jira-assignee-modal')

        contentEl.createEl('h2', { text: `Change Assignee: ${this._issue.key}` })

        // Search input
        const searchSetting = new Setting(contentEl)
            .setName('Search users')
            .addText(text => {
                text.setPlaceholder('Type to search...')
                text.inputEl.addEventListener('input', debounce((e: Event) => {
                    const query = (e.target as HTMLInputElement).value.trim()
                    if (query.length >= 2) {
                        this.searchUsers(query)
                    } else {
                        this._searchResults = []
                        this.renderAssignees()
                    }
                }, 300, true))
            })

        this._searchContainer = contentEl.createDiv({ cls: 'jira-assignee-search-container' })
        this._resultsContainer = contentEl.createDiv({ cls: 'jira-assignee-results' })

        this.renderAssignees()

        // Buttons
        new Setting(contentEl)
            .addButton(btn => btn
                .setButtonText('Cancel')
                .onClick(() => this.close()))
            .addButton(btn => btn
                .setButtonText('Assign')
                .setCta()
                .onClick(async () => {
                    await this.applyAssignee()
                }))
    }

    private async searchUsers(query: string): Promise<void> {
        this._isLoading = true
        this.renderAssignees()

        try {
            const users = await JiraClient.searchAssignableUsers(this._issue.key, query, {
                account: this._issue.account
            })
            console.log('JiraIssue: searchAssignableUsers response:', JSON.stringify(users, null, 2))

            this._searchResults = users.map(user => ({
                accountId: user.accountId || user.key || user.name,
                displayName: user.displayName,
                avatarUrl: user.avatarUrls?.['24x24'],
                isFromSearch: true
            }))
        } catch (error) {
            console.error('Failed to search users:', error)
            new Notice(`Failed to search users: ${error.message}`)
            this._searchResults = []
        }

        this._isLoading = false
        this.renderAssignees()
    }

    private renderAssignees(): void {
        this._resultsContainer.empty()

        if (this._isLoading) {
            this._resultsContainer.createEl('p', { text: 'Searching...', cls: 'jira-assignee-loading' })
            return
        }

        const currentAssignee = this._issue.fields.assignee

        // Unassigned option
        const unassignedItem = this._resultsContainer.createDiv({
            cls: `jira-assignee-item${this._selectedAccountId === null ? ' is-selected' : ''}`
        })
        const unassignedLabel = unassignedItem.createEl('label', { cls: 'jira-assignee-label' })
        const unassignedRadio = unassignedLabel.createEl('input', {
            type: 'radio',
            attr: { name: 'assignee', value: '' }
        }) as HTMLInputElement
        if (this._selectedAccountId === null) {
            unassignedRadio.checked = true
        }
        unassignedRadio.addEventListener('change', () => {
            if (unassignedRadio.checked) {
                this._selectedAccountId = null
                this.updateSelection()
            }
        })
        unassignedLabel.createSpan({ text: 'Unassigned' })
        if (!currentAssignee) {
            unassignedLabel.createSpan({ text: ' (current)', cls: 'jira-assignee-current-tag' })
        }

        // Separator
        if (this._predefinedAssignees.length > 0) {
            this._resultsContainer.createEl('div', { cls: 'jira-assignee-separator' })
            this._resultsContainer.createEl('div', { text: 'Predefined:', cls: 'jira-assignee-section-title' })
        }

        // Predefined assignees
        for (const assignee of this._predefinedAssignees) {
            this.renderAssigneeOption(assignee, currentAssignee)
        }

        // Search results
        if (this._searchResults.length > 0) {
            this._resultsContainer.createEl('div', { cls: 'jira-assignee-separator' })
            this._resultsContainer.createEl('div', { text: 'Search results:', cls: 'jira-assignee-section-title' })

            for (const result of this._searchResults) {
                // Skip if already in predefined
                if (this._predefinedAssignees.some(p => p.accountId === result.accountId)) {
                    continue
                }
                this.renderAssigneeOption(result, currentAssignee)
            }
        }
    }

    private renderAssigneeOption(assignee: AssigneeOption, currentAssignee: IJiraUser | null): void {
        const isCurrent = currentAssignee?.accountId === assignee.accountId
        const isSelected = this._selectedAccountId === assignee.accountId

        const item = this._resultsContainer.createDiv({
            cls: `jira-assignee-item${isSelected ? ' is-selected' : ''}${isCurrent ? ' is-current' : ''}`
        })

        if (assignee.avatarUrl) {
            item.createEl('img', {
                cls: 'jira-assignee-avatar',
                attr: { src: assignee.avatarUrl, alt: assignee.displayName }
            })
        }

        const label = item.createEl('label', { cls: 'jira-assignee-label' })
        const radio = label.createEl('input', {
            type: 'radio',
            attr: { name: 'assignee', value: assignee.accountId }
        }) as HTMLInputElement

        if (isSelected) {
            radio.checked = true
        }

        radio.addEventListener('change', () => {
            if (radio.checked) {
                this._selectedAccountId = assignee.accountId
                this.updateSelection()
            }
        })

        label.createSpan({ text: assignee.displayName })

        if (isCurrent) {
            label.createSpan({ text: ' (current)', cls: 'jira-assignee-current-tag' })
        }
    }

    private updateSelection(): void {
        // Update visual selection state
        const items = this._resultsContainer.querySelectorAll('.jira-assignee-item')
        items.forEach(item => {
            const radio = item.querySelector('input[type="radio"]') as HTMLInputElement
            if (radio) {
                if (radio.checked) {
                    item.addClass('is-selected')
                } else {
                    item.removeClass('is-selected')
                }
            }
        })
    }

    private async applyAssignee(): Promise<void> {
        const currentAssigneeId = this._issue.fields.assignee?.accountId || null

        if (this._selectedAccountId === currentAssigneeId) {
            new Notice('Assignee unchanged')
            this.close()
            return
        }

        try {
            await JiraClient.updateIssueAssignee(this._issue.key, this._selectedAccountId, {
                account: this._issue.account
            })

            // Update local issue object
            if (this._selectedAccountId === null) {
                this._issue.fields.assignee = null
            } else {
                // Find the selected assignee info
                const selectedAssignee =
                    this._predefinedAssignees.find(a => a.accountId === this._selectedAccountId) ||
                    this._searchResults.find(a => a.accountId === this._selectedAccountId)

                this._issue.fields.assignee = {
                    accountId: this._selectedAccountId,
                    displayName: selectedAssignee?.displayName || 'Unknown',
                    active: true,
                    avatarUrls: {}
                } as IJiraUser
            }

            ObjectsCache.add(this._issue.key, this._issue, false)

            this._onComplete(this._issue)

            const msg = this._selectedAccountId === null
                ? 'Assignee removed'
                : `Assigned to ${this._issue.fields.assignee?.displayName}`
            new Notice(msg)
            this.close()
        } catch (error) {
            console.error('Failed to update assignee:', error)
            new Notice(`Failed to update assignee: ${error.message}`)
        }
    }

    onClose() {
        this.contentEl.empty()
    }
}
