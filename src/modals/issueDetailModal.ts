import { Modal } from "obsidian"
import { IJiraIssue, IJiraSprint, IJiraUser } from "../interfaces/issueInterfaces"
import { ObsidianApp } from "../main"
import RC, { JIRA_STATUS_COLOR_MAP, JIRA_STATUS_COLOR_MAP_BY_NAME, createAvatarPlaceholder, getPriorityColorClass } from "../rendering/renderingCommon"

export class IssueDetailModal extends Modal {
    private _issue: IJiraIssue

    constructor(issue: IJiraIssue) {
        super(ObsidianApp)
        this._issue = issue
    }

    onOpen() {
        const { contentEl } = this
        contentEl.empty()
        contentEl.addClass('jira-issue-detail-modal')

        this.renderHeader(contentEl)

        const contentWrapper = contentEl.createDiv({ cls: 'jira-modal-content-wrapper' })
        this.renderMainContent(contentWrapper)
        this.renderSidebar(contentWrapper)

        this.renderFooter(contentEl)
    }

    onClose() {
        this.contentEl.empty()
    }

    private renderHeader(container: HTMLElement): void {
        const header = container.createDiv({ cls: 'jira-modal-header' })

        const titleRow = header.createDiv({ cls: 'jira-modal-title-row' })

        if (this._issue.fields.issuetype?.iconUrl) {
            createEl('img', {
                cls: 'jira-modal-type-icon',
                attr: { src: this._issue.fields.issuetype.iconUrl, alt: this._issue.fields.issuetype.name },
                title: this._issue.fields.issuetype.name,
                parent: titleRow
            })
        }

        createEl('a', {
            cls: 'jira-modal-key',
            text: this._issue.key,
            href: RC.issueUrl(this._issue.account, this._issue.key),
            parent: titleRow
        })

        header.createEl('h2', {
            cls: 'jira-modal-summary',
            text: this._issue.fields.summary
        })
    }

    private renderMainContent(container: HTMLElement): void {
        const main = container.createDiv({ cls: 'jira-modal-main' })

        // Description
        if (this._issue.fields.description) {
            const descSection = main.createDiv({ cls: 'jira-modal-section' })
            descSection.createEl('h3', { text: 'Description' })
            descSection.createDiv({
                cls: 'jira-modal-description',
                text: this._issue.fields.description
            })
        }

        // Issue Links
        if (this._issue.fields.issueLinks?.length > 0) {
            this.renderIssueLinks(main)
        }
    }

    private renderIssueLinks(container: HTMLElement): void {
        const section = container.createDiv({ cls: 'jira-modal-section' })
        section.createEl('h3', { text: 'Linked Issues' })

        for (const link of this._issue.fields.issueLinks) {
            if (!link.inwardIssue) continue

            // Use new card-style linked issue
            const linkEl = section.createDiv({ cls: 'jira-modal-linked-issue' })
            createSpan({ text: link.type?.name || 'Related', cls: 'jira-modal-link-type', parent: linkEl })
            createEl('a', {
                text: link.inwardIssue.key,
                cls: 'jira-modal-link-key',
                href: RC.issueUrl(this._issue.account, link.inwardIssue.key),
                parent: linkEl
            })
            if (link.inwardIssue.fields?.summary) {
                createSpan({ text: link.inwardIssue.fields.summary, cls: 'jira-modal-link-summary', parent: linkEl })
            }
        }
    }

    private renderSidebar(container: HTMLElement): void {
        const sidebar = container.createDiv({ cls: 'jira-modal-sidebar' })

        // Status
        this.renderStatusField(sidebar)

        // Priority
        if (this._issue.fields.priority?.name) {
            this.renderPriorityField(sidebar)
        }

        // Assignee
        this.renderUserField(sidebar, 'Assignee', this._issue.fields.assignee)

        // Reporter
        this.renderUserField(sidebar, 'Reporter', this._issue.fields.reporter)

        // Dates
        if (this._issue.fields.created) {
            this.renderDateField(sidebar, 'Created', this._issue.fields.created)
        }
        if (this._issue.fields.updated) {
            this.renderDateField(sidebar, 'Updated', this._issue.fields.updated)
        }
        if (this._issue.fields.duedate) {
            this.renderDateField(sidebar, 'Due Date', this._issue.fields.duedate)
        }

        // Labels
        if (this._issue.fields.labels?.length > 0) {
            this.renderLabels(sidebar)
        }

        // Components
        if (this._issue.fields.components?.length > 0) {
            this.renderComponents(sidebar)
        }

        // Fix Versions
        if (this._issue.fields.fixVersions?.length > 0) {
            this.renderFixVersions(sidebar)
        }

        // Sprints
        this.renderSprints(sidebar)

        // Time Tracking
        if (this._issue.fields.timeestimate || this._issue.fields.timespent) {
            this.renderTimeTracking(sidebar)
        }
    }

    private renderStatusField(container: HTMLElement): void {
        const field = container.createDiv({ cls: 'jira-modal-field' })
        field.createDiv({ cls: 'jira-modal-field-label', text: 'Status' })

        const statusColor = JIRA_STATUS_COLOR_MAP_BY_NAME[this._issue.fields.status.name] ||
            JIRA_STATUS_COLOR_MAP[this._issue.fields.status.statusCategory?.colorName] ||
            'is-light'

        createSpan({
            cls: `ji-tag ${statusColor}`,
            text: this._issue.fields.status.name,
            title: this._issue.fields.status.description || '',
            parent: field
        })
    }

    private renderPriorityField(container: HTMLElement): void {
        const field = container.createDiv({ cls: 'jira-modal-field' })
        field.createDiv({ cls: 'jira-modal-field-label', text: 'Priority' })

        const value = field.createDiv({ cls: 'jira-modal-field-value jira-modal-priority' })
        const priorityColorClass = getPriorityColorClass(this._issue.fields.priority.name)

        if (this._issue.fields.priority.iconUrl) {
            createEl('img', {
                cls: `jira-modal-priority-icon ${priorityColorClass}`,
                attr: { src: this._issue.fields.priority.iconUrl, alt: this._issue.fields.priority.name },
                parent: value
            })
        }
        createSpan({ text: this._issue.fields.priority.name, parent: value })
    }

    private renderUserField(container: HTMLElement, label: string, user: IJiraUser | null): void {
        const field = container.createDiv({ cls: 'jira-modal-field' })
        field.createDiv({ cls: 'jira-modal-field-label', text: label })

        const value = field.createDiv({ cls: 'jira-modal-field-value' })

        if (user?.displayName) {
            const userEl = value.createDiv({ cls: 'jira-modal-user' })
            if (user.avatarUrls?.['24x24']) {
                createEl('img', {
                    cls: 'jira-modal-user-avatar',
                    attr: { src: user.avatarUrls['24x24'], alt: user.displayName },
                    parent: userEl
                })
            } else {
                // Use gradient avatar placeholder
                const placeholder = createAvatarPlaceholder(user.displayName, 24)
                placeholder.addClass('jira-modal-user-avatar')
                userEl.appendChild(placeholder)
            }
            createSpan({ text: user.displayName, parent: userEl })
        } else {
            value.setText('Unassigned')
            value.addClass('jira-modal-unassigned')
        }
    }

    private renderDateField(container: HTMLElement, label: string, dateStr: string): void {
        const field = container.createDiv({ cls: 'jira-modal-field' })
        field.createDiv({ cls: 'jira-modal-field-label', text: label })

        const date = new Date(dateStr)
        const formatted = date.toLocaleDateString(undefined, {
            year: 'numeric',
            month: 'short',
            day: 'numeric'
        })

        field.createDiv({ cls: 'jira-modal-field-value', text: formatted })
    }

    private renderLabels(container: HTMLElement): void {
        const field = container.createDiv({ cls: 'jira-modal-field' })
        field.createDiv({ cls: 'jira-modal-field-label', text: 'Labels' })

        const labelsEl = field.createDiv({ cls: 'jira-modal-labels' })
        for (const label of this._issue.fields.labels) {
            createSpan({ cls: 'jira-modal-label', text: label, parent: labelsEl })
        }
    }

    private renderComponents(container: HTMLElement): void {
        const field = container.createDiv({ cls: 'jira-modal-field' })
        field.createDiv({ cls: 'jira-modal-field-label', text: 'Components' })

        const componentsEl = field.createDiv({ cls: 'jira-modal-labels' })
        for (const component of this._issue.fields.components) {
            createSpan({ cls: 'jira-modal-label', text: component.name, parent: componentsEl })
        }
    }

    private renderFixVersions(container: HTMLElement): void {
        const field = container.createDiv({ cls: 'jira-modal-field' })
        field.createDiv({ cls: 'jira-modal-field-label', text: 'Fix Versions' })

        const versionsEl = field.createDiv({ cls: 'jira-modal-labels' })
        for (const version of this._issue.fields.fixVersions) {
            const cls = version.released ? 'jira-modal-label jira-modal-version-released' : 'jira-modal-label'
            createSpan({ cls, text: version.name, title: version.description || '', parent: versionsEl })
        }
    }

    private renderTimeTracking(container: HTMLElement): void {
        const field = container.createDiv({ cls: 'jira-modal-field' })
        field.createDiv({ cls: 'jira-modal-field-label', text: 'Time Tracking' })

        const timeEl = field.createDiv({ cls: 'jira-modal-time-tracking' })

        const estimate = this._issue.fields.timeestimate || 0
        const spent = this._issue.fields.timespent || 0

        const formatTime = (seconds: number): string => {
            if (seconds === 0) return '0h'
            const hours = Math.floor(seconds / 3600)
            const minutes = Math.floor((seconds % 3600) / 60)
            if (hours > 0 && minutes > 0) return `${hours}h ${minutes}m`
            if (hours > 0) return `${hours}h`
            return `${minutes}m`
        }

        // Time labels row
        const labelsRow = timeEl.createDiv({ cls: 'jira-modal-time-labels' })
        createSpan({ text: `Logged: ${formatTime(spent)}`, parent: labelsRow })
        if (estimate > 0) {
            createSpan({ text: `Remaining: ${formatTime(estimate)}`, parent: labelsRow })
        }

        if (estimate > 0) {
            // Progress bar
            const total = spent + estimate
            const percent = total > 0 ? Math.round((spent / total) * 100) : 0

            const progressBar = timeEl.createDiv({ cls: 'jira-modal-progress-bar' })
            progressBar.createDiv({
                cls: 'jira-modal-progress-fill',
                attr: { style: `width: ${percent}%` }
            })

            // Percentage label
            timeEl.createDiv({
                cls: 'jira-modal-time-percent',
                text: `${percent}% complete`
            })
        }
    }

    private parseSprintString(sprintStr: string): { id: number, name: string, state: string } | null {
        // Parse Jira Server sprint format: "com.atlassian.greenhopper.service.sprint.Sprint@...[id=...,name=...,state=...]"
        const idMatch = sprintStr.match(/id=(\d+)/)
        const nameMatch = sprintStr.match(/name=([^,\]]+)/)
        const stateMatch = sprintStr.match(/state=([^,\]]+)/)
        if (nameMatch) {
            return {
                id: idMatch ? parseInt(idMatch[1], 10) : 0,
                name: nameMatch[1],
                state: (stateMatch?.[1] || '').toLowerCase()
            }
        }
        return null
    }

    private renderSprints(container: HTMLElement): void {
        // Get sprint field ID from account cache
        const sprintFieldId = this._issue.account?.cache?.customFieldsNameToId?.['Sprint']
        if (!sprintFieldId) return

        const sprintsRaw = this._issue.fields[`customfield_${sprintFieldId}`]
        if (!sprintsRaw?.length) return

        // Parse sprints - handle both object format (Cloud) and string format (Server)
        const sprints: { id: number, name: string, state: string }[] = []
        for (const sprint of sprintsRaw) {
            if (typeof sprint === 'string') {
                const parsed = this.parseSprintString(sprint)
                if (parsed) sprints.push(parsed)
            } else if (sprint.name) {
                sprints.push({ id: sprint.id || 0, name: sprint.name, state: sprint.state || '' })
            }
        }

        if (!sprints.length) return

        const field = container.createDiv({ cls: 'jira-modal-field' })
        field.createDiv({ cls: 'jira-modal-field-label', text: 'Sprints' })

        const sprintsEl = field.createDiv({ cls: 'jira-modal-sprints' })

        // Sort: active first, then by id descending (newer sprints first)
        sprints.sort((a, b) => {
            if (a.state === 'active' && b.state !== 'active') return -1
            if (a.state !== 'active' && b.state === 'active') return 1
            return b.id - a.id  // Newer sprints (higher id) first
        })

        for (const sprint of sprints) {
            const stateClass = sprint.state === 'active'
                ? ''
                : 'is-closed'

            const sprintItem = sprintsEl.createDiv({ cls: `jira-modal-sprint-item ${stateClass}` })
            createSpan({
                cls: 'jira-modal-sprint-name',
                text: sprint.name,
                parent: sprintItem
            })
            if (sprint.state === 'active') {
                createSpan({
                    cls: 'jira-modal-sprint-state',
                    text: 'Active',
                    parent: sprintItem
                })
            }
        }
    }

    private renderFooter(container: HTMLElement): void {
        const footer = container.createDiv({ cls: 'jira-modal-footer' })

        createEl('a', {
            cls: 'jira-modal-open-button',
            text: 'Open in Jira',
            href: RC.issueUrl(this._issue.account, this._issue.key),
            parent: footer
        })
    }
}
