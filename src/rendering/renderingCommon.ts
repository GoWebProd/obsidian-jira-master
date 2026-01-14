import { FrontMatterCache, TFile } from "obsidian"
import { IJiraIssue } from "../interfaces/issueInterfaces"
import { EColorSchema, IJiraIssueAccountSettings } from "../interfaces/settingsInterfaces"
import { ObsidianApp } from "../main"
import { SearchView } from "../searchView"
import { SettingsData } from "../settings"
import { attachIssueClickHandler } from "./issueClickHandler"
import { attachIssueContextMenuHandler } from "./issueContextMenuHandler"

// Avatar gradient colors for placeholder avatars
const AVATAR_GRADIENTS = [
    'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',  // Purple-violet
    'linear-gradient(135deg, #4facfe 0%, #00f2fe 100%)',  // Blue-cyan
    'linear-gradient(135deg, #fa709a 0%, #fee140 100%)',  // Pink-yellow
    'linear-gradient(135deg, #43e97b 0%, #38f9d7 100%)',  // Green-teal
    'linear-gradient(135deg, #f093fb 0%, #f5576c 100%)',  // Pink-red
    'linear-gradient(135deg, #a18cd1 0%, #fbc2eb 100%)',  // Lavender-pink
    'linear-gradient(135deg, #ff9a9e 0%, #fecfef 100%)',  // Salmon-pink
    'linear-gradient(135deg, #ffecd2 0%, #fcb69f 100%)',  // Peach-orange
]

/**
 * Generate a consistent gradient based on a name string
 */
export function generateAvatarGradient(name: string): string {
    const hash = name.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0)
    return AVATAR_GRADIENTS[hash % AVATAR_GRADIENTS.length]
}

/**
 * Get initials from a name (e.g., "John Doe" -> "JD")
 */
export function getInitials(name: string): string {
    if (!name) return '?'
    return name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2)
}

/**
 * Create an avatar placeholder element with gradient background and initials
 */
export function createAvatarPlaceholder(name: string, size: number = 24): HTMLElement {
    const el = document.createElement('div')
    el.className = 'ji-avatar-placeholder'
    el.style.width = `${size}px`
    el.style.height = `${size}px`
    el.style.background = generateAvatarGradient(name)
    el.style.fontSize = `${Math.floor(size * 0.45)}px`
    el.textContent = getInitials(name)
    return el
}

/**
 * Get CSS class for priority color based on priority name
 */
export function getPriorityColorClass(priorityName: string): string {
    const name = priorityName.toLowerCase()
    if (name.includes('highest') || name.includes('blocker') || name.includes('critical')) {
        return 'ji-priority-highest'
    } else if (name.includes('high') || name.includes('major')) {
        return 'ji-priority-high'
    } else if (name.includes('medium') || name.includes('normal')) {
        return 'ji-priority-medium'
    } else if (name.includes('low') || name.includes('minor')) {
        return 'ji-priority-low'
    } else if (name.includes('lowest') || name.includes('trivial')) {
        return 'ji-priority-lowest'
    }
    return 'ji-priority-medium'
}

export const JIRA_STATUS_COLOR_MAP: Record<string, string> = {
    'blue-gray': 'is-info',
    'yellow': 'is-warning',
    'green': 'is-success',
    'red': 'is-danger',
    'medium-gray': 'is-dark',
}

export const JIRA_STATUS_COLOR_MAP_BY_NAME: Record<string, string> = {
    'New': 'is-todo',
    'Planning': 'is-todo',
    'To Do': 'is-todo',
    'In Progress': 'is-info',
    'Code Review': 'is-info',
    'Review': 'is-info',
    'Dev Complete': 'is-info',
    'Testing': 'is-info',
    'Release Pending': 'is-success',
    'Closed': 'is-success'
}

export default {
    issueUrl(account: IJiraIssueAccountSettings, issueKey: string): string {
        try {
            return (new URL(`${account.host}/browse/${issueKey}`)).toString()
        } catch (e) { return '' }
    },

    searchUrl(account: IJiraIssueAccountSettings, searchQuery: string): string {
        try {
            return (new URL(`${account.host}/issues/?jql=${searchQuery}`)).toString()
        } catch (e) { return '' }
    },

    getTheme(): string {
        switch (SettingsData.colorSchema) {
            case EColorSchema.FOLLOW_OBSIDIAN:
                const obsidianTheme = (ObsidianApp.vault as any).getConfig("theme")
                if (obsidianTheme === 'obsidian') {
                    return 'is-dark'
                } else if (obsidianTheme === 'moonstone') {
                    return 'is-light'
                } else if (obsidianTheme === 'system') {
                    if (window.matchMedia("(prefers-color-scheme: dark)").matches) {
                        return 'is-dark'
                    } else {
                        return 'is-light'
                    }
                }
                break
            case EColorSchema.LIGHT:
                return 'is-light'
            case EColorSchema.DARK:
                return 'is-dark'
        }
        return 'is-light'
    },

    getNotes(): TFile[] {
        return ObsidianApp.vault.getMarkdownFiles()
    },

    getFrontMatter(file: TFile): FrontMatterCache {
        return ObsidianApp.metadataCache.getFileCache(file).frontmatter
    },

    renderContainer(children: HTMLElement[]): HTMLElement {
        const container = createDiv({ cls: 'jira-issue-container' })
        for (const child of children) {
            container.appendChild(child)
        }
        return container
    },

    renderLoadingItem(item: string, inline = false): HTMLElement {
        let tagsRow
        if (inline) {
            tagsRow = createSpan({ cls: 'ji-tags has-addons' })
        } else {
            tagsRow = createDiv({ cls: 'ji-tags has-addons' })
        }
        createSpan({ cls: 'spinner', parent: createSpan({ cls: `ji-tag ${this.getTheme()}`, parent: tagsRow }) })
        createEl('a', { cls: `ji-tag is-link ${this.getTheme()}`, text: item, parent: tagsRow })
        createSpan({ cls: `ji-tag ${this.getTheme()}`, text: 'Loading ...', parent: tagsRow })
        return tagsRow
    },

    renderSearchError(el: HTMLElement, message: string, searchView: SearchView): void {
        const tagsRow = createDiv('ji-tags has-addons')
        createSpan({ cls: 'ji-tag is-delete is-danger', parent: tagsRow })
        if (searchView) {
            createSpan({ cls: `ji-tag is-danger ${this.getTheme()}`, text: "Search error", parent: tagsRow })
        } else {
            createSpan({ cls: `ji-tag is-danger ${this.getTheme()}`, text: "Search error", parent: tagsRow })
        }
        createSpan({ cls: 'ji-tag is-danger', text: message, parent: tagsRow })
        el.replaceChildren(this.renderContainer([tagsRow]))
    },

    renderIssue(issue: IJiraIssue, compact = false, onIssueUpdated?: (issue: IJiraIssue) => void): HTMLElement {
        const tagsRow = createDiv('ji-tags has-addons')
        this.renderAccountColorBand(issue.account, tagsRow)
        if (issue.fields.issuetype.iconUrl) {
            createEl('img', {
                cls: 'fit-content',
                attr: { src: issue.fields.issuetype.iconUrl, alt: issue.fields.issuetype.name },
                title: issue.fields.issuetype.name,
                parent: createSpan({ cls: `ji-tag ${this.getTheme()} ji-sm-tag`, parent: tagsRow })
            })
        }
        // Priority icon with color class
        if (issue.fields.priority?.iconUrl) {
            const priorityColorClass = getPriorityColorClass(issue.fields.priority.name)
            const priorityTag = createSpan({ cls: `ji-tag ${this.getTheme()} ji-sm-tag`, parent: tagsRow })
            const priorityImg = createEl('img', {
                cls: `fit-content ji-priority-icon ${priorityColorClass}`,
                attr: { src: issue.fields.priority.iconUrl, alt: issue.fields.priority.name },
                title: issue.fields.priority.name,
                parent: priorityTag
            })
        }
        const keyLink = createEl('a', { cls: `ji-tag is-link ${this.getTheme()} no-wrap`, href: this.issueUrl(issue.account, issue.key), title: this.issueUrl(issue.account, issue.key), text: issue.key, parent: tagsRow })
        attachIssueClickHandler(keyLink, issue)
        if (!compact) {
            const summaryTag = createSpan({ cls: `ji-tag ${this.getTheme()} issue-summary`, parent: tagsRow })
            createDiv({ cls: 'ji-summary-text', text: issue.fields.summary, parent: summaryTag })

            // Labels under summary
            if (issue.fields.labels?.length > 0) {
                const labelsRow = createDiv({ cls: 'ji-summary-labels', parent: summaryTag })
                for (const label of issue.fields.labels) {
                    createSpan({ cls: 'ji-label-badge', text: label, parent: labelsRow })
                }
            }
        }
        const statusColor = JIRA_STATUS_COLOR_MAP_BY_NAME[issue.fields.status.name] ||
            JIRA_STATUS_COLOR_MAP[issue.fields.status.statusCategory.colorName] ||
            'is-light'
        createSpan({ cls: `ji-tag no-wrap ${statusColor}`, text: issue.fields.status.name, title: issue.fields.status.description, attr: { 'data-status': issue.fields.status.name }, parent: tagsRow })

        // Assignee display
        const assigneeTag = createSpan({
            cls: `ji-tag ${this.getTheme()} is-flex is-align-items-center`,
            parent: tagsRow
        })

        if (issue.fields.assignee && issue.fields.assignee.displayName) {
            // Has assignee - show avatar and name
            if (issue.fields.assignee.avatarUrls && issue.fields.assignee.avatarUrls['16x16']) {
                createEl('img', {
                    cls: 'fit-content ji-avatar',
                    attr: {
                        src: issue.fields.assignee.avatarUrls['16x16'],
                        alt: issue.fields.assignee.displayName
                    },
                    title: issue.fields.assignee.displayName,
                    parent: assigneeTag
                })
            } else {
                // No avatar image - use gradient placeholder
                const placeholder = createAvatarPlaceholder(issue.fields.assignee.displayName, 16)
                placeholder.addClass('ji-avatar')
                assigneeTag.appendChild(placeholder)
            }
            createSpan({
                cls: 'ji-assignee-name',
                text: issue.fields.assignee.displayName,
                parent: assigneeTag
            })
        } else {
            // No assignee - show "Unassigned"
            createSpan({
                cls: 'ji-assignee-name',
                text: 'Unassigned',
                parent: assigneeTag
            })
        }

        // Attach context menu handler if callback is provided
        if (onIssueUpdated) {
            attachIssueContextMenuHandler(tagsRow, issue, onIssueUpdated)
        }

        return tagsRow
    },

    renderIssueError(issueKey: string, message: string): HTMLElement {
        const tagsRow = createDiv('ji-tags has-addons')
        createSpan({ cls: 'ji-tag is-delete is-danger', parent: tagsRow })
        createSpan({ cls: 'ji-tag is-danger is-light', text: issueKey, parent: tagsRow })
        createSpan({ cls: 'ji-tag is-danger', text: message, parent: tagsRow })
        return tagsRow
    },

    renderAccountColorBand(account: IJiraIssueAccountSettings, parent: HTMLDivElement) {
        if (SettingsData.showColorBand) {
            createSpan({ cls: `ji-tag ${this.getTheme()} ji-band`, attr: { style: `background-color: ${account.color}` }, title: account.alias, parent: parent })
        }
    },
}
