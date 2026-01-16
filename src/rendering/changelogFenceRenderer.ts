import { MarkdownPostProcessorContext, setIcon } from "obsidian"
import { IJiraIssue, IJiraSearchResults, IChangelogEntry } from "../interfaces/issueInterfaces"
import { IJiraIssueAccountSettings } from "../interfaces/settingsInterfaces"
import JiraClient from "../client/jiraClient"
import ObjectsCache from "../objectsCache"
import RC, { createAvatarPlaceholder } from "./renderingCommon"
import { ChangelogView } from "../changelogView"

/**
 * Transform array of issues with changelog into flat list of change entries
 */
function flattenChangelog(
    issues: IJiraIssue[],
    periodMs: number | null,
    fields: string[],
    excludeFields: string[]
): IChangelogEntry[] {
    const entries: IChangelogEntry[] = []
    const cutoffTime = periodMs ? Date.now() - periodMs : null

    for (const issue of issues) {
        if (!issue.changelog?.histories) continue

        for (const history of issue.changelog.histories) {
            const timestamp = new Date(history.created)

            // Skip if outside period filter
            if (cutoffTime && timestamp.getTime() < cutoffTime) {
                continue
            }

            for (const item of history.items) {
                const fieldLower = item.field.toLowerCase()

                // Filter by included fields
                if (fields.length > 0 && !fields.includes(fieldLower)) {
                    continue
                }

                // Filter by excluded fields
                if (excludeFields.length > 0 && excludeFields.includes(fieldLower)) {
                    continue
                }

                entries.push({
                    issueKey: issue.key,
                    issueAccount: issue.account,
                    issueSummary: issue.fields.summary || '',
                    issueTypeIcon: issue.fields.issuetype?.iconUrl || '',
                    issueTypeName: issue.fields.issuetype?.name || '',
                    timestamp: timestamp,
                    created: history.created,
                    field: item.field,
                    fieldtype: item.fieldtype,
                    from: item.from,
                    fromString: item.fromString,
                    to: item.to,
                    toString: item.toString,
                    author: history.author
                })
            }
        }
    }

    // Sort by timestamp descending (newest first)
    entries.sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime())

    return entries
}

/**
 * Get display value for changelog entry from/to
 * Handles special cases like Comment where fromString/toString are empty
 */
function getChangeDisplayValue(
    entry: IChangelogEntry,
    direction: 'from' | 'to'
): { text: string, isEmpty: boolean } {
    const stringValue = direction === 'from' ? entry.fromString : entry.toString
    const idValue = direction === 'from' ? entry.from : entry.to

    // If we have a string value, use it
    if (stringValue) {
        return { text: stringValue, isEmpty: false }
    }

    // Special handling for Comment field
    if (entry.field.toLowerCase() === 'comment') {
        if (direction === 'from') {
            // from is null = new comment, from has ID = edited/deleted comment
            return idValue
                ? { text: '(edited)', isEmpty: false }
                : { text: '-', isEmpty: true }
        } else {
            // to has ID = comment added/edited, to is null = comment deleted
            return idValue
                ? { text: '(added)', isEmpty: false }
                : { text: '(deleted)', isEmpty: false }
        }
    }

    // Special handling for Attachment field
    if (entry.field.toLowerCase() === 'attachment') {
        if (direction === 'from') {
            return idValue
                ? { text: '(removed)', isEmpty: false }
                : { text: '-', isEmpty: true }
        } else {
            return idValue
                ? { text: '(added)', isEmpty: false }
                : { text: '-', isEmpty: true }
        }
    }

    // Default: show dash for empty
    return { text: '-', isEmpty: true }
}

/**
 * Format ISO timestamp to readable string
 */
function formatTimestamp(isoString: string): string {
    const date = new Date(isoString)
    return date.toLocaleString(undefined, {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
    })
}

/**
 * Render author cell with avatar and name
 */
function renderAuthorCell(cell: HTMLElement, author: IChangelogEntry['author']): void {
    if (!author) {
        createSpan({ text: '-', cls: 'changelog-empty', parent: cell })
        return
    }

    const authorContainer = createDiv({ cls: 'changelog-author', parent: cell })

    if (author.avatarUrls?.['16x16']) {
        createEl('img', {
            cls: 'ji-avatar',
            attr: {
                src: author.avatarUrls['16x16'],
                alt: author.displayName
            },
            title: author.displayName,
            parent: authorContainer
        })
    } else {
        const placeholder = createAvatarPlaceholder(author.displayName, 16)
        placeholder.addClass('ji-avatar')
        authorContainer.appendChild(placeholder)
    }

    createSpan({
        text: author.displayName,
        cls: 'changelog-author-name',
        title: author.displayName,
        parent: authorContainer
    })
}

/**
 * Group entries by issue key
 */
function groupEntriesByIssue(entries: IChangelogEntry[]): Map<string, IChangelogEntry[]> {
    const grouped = new Map<string, IChangelogEntry[]>()
    for (const entry of entries) {
        const key = entry.issueKey
        if (!grouped.has(key)) grouped.set(key, [])
        grouped.get(key)!.push(entry)
    }
    return grouped
}

/**
 * Group entries by author
 */
function groupEntriesByAuthor(entries: IChangelogEntry[]): Map<string, IChangelogEntry[]> {
    const grouped = new Map<string, IChangelogEntry[]>()
    for (const entry of entries) {
        const key = entry.author?.displayName || 'Unknown'
        if (!grouped.has(key)) grouped.set(key, [])
        grouped.get(key)!.push(entry)
    }
    return grouped
}

/**
 * Group entries by author, then by issue (two-level)
 */
function groupEntriesByAuthorAndIssue(entries: IChangelogEntry[]): Map<string, Map<string, IChangelogEntry[]>> {
    const grouped = new Map<string, Map<string, IChangelogEntry[]>>()
    for (const entry of entries) {
        const authorKey = entry.author?.displayName || 'Unknown'
        const issueKey = entry.issueKey
        if (!grouped.has(authorKey)) grouped.set(authorKey, new Map())
        const authorGroup = grouped.get(authorKey)!
        if (!authorGroup.has(issueKey)) authorGroup.set(issueKey, [])
        authorGroup.get(issueKey)!.push(entry)
    }
    return grouped
}

/**
 * Render the changelog table
 */
function renderChangelogTable(
    rootEl: HTMLElement,
    changelogView: ChangelogView,
    entries: IChangelogEntry[]
): void {
    const table = createEl('table', {
        cls: `table is-bordered is-striped is-narrow is-hoverable is-fullwidth ${RC.getTheme()}`
    })

    // Header
    const thead = createEl('thead', { parent: table })
    const headerRow = createEl('tr', { parent: thead })

    const headers = ['Time', 'Issue', 'Author', 'Field', 'From', 'To']
    for (const headerText of headers) {
        createEl('th', { text: headerText, parent: headerRow })
    }

    // Body
    const tbody = createEl('tbody', { parent: table })

    for (const entry of entries) {
        const row = createEl('tr', { parent: tbody })

        // Time
        createEl('td', {
            text: formatTimestamp(entry.created),
            cls: 'changelog-time',
            parent: row
        })

        // Issue key (clickable link)
        const issueCell = createEl('td', { parent: row })
        createEl('a', {
            text: entry.issueKey,
            href: RC.issueUrl(entry.issueAccount, entry.issueKey),
            cls: 'changelog-issue-link',
            parent: issueCell
        })

        // Author
        const authorCell = createEl('td', { cls: 'changelog-author-cell', parent: row })
        renderAuthorCell(authorCell, entry.author)

        // Field
        createEl('td', {
            text: entry.field,
            cls: 'changelog-field',
            parent: row
        })

        // From value
        const fromCell = createEl('td', { cls: 'changelog-from', parent: row })
        const fromDisplay = getChangeDisplayValue(entry, 'from')
        createSpan({
            text: fromDisplay.text,
            cls: fromDisplay.isEmpty ? 'changelog-empty' : '',
            parent: fromCell
        })

        // To value
        const toCell = createEl('td', { cls: 'changelog-to', parent: row })
        const toDisplay = getChangeDisplayValue(entry, 'to')
        createSpan({
            text: toDisplay.text,
            cls: toDisplay.isEmpty ? 'changelog-empty' : '',
            parent: toCell
        })
    }

    // Footer
    const footer = renderChangelogFooter(rootEl, changelogView, entries)

    rootEl.replaceChildren(RC.renderContainer([table, footer]))
}

/**
 * Render the footer with stats and refresh button
 */
function renderChangelogFooter(
    rootEl: HTMLElement,
    changelogView: ChangelogView,
    entries: IChangelogEntry[]
): HTMLElement {
    const footer = createDiv({ cls: 'changelog-footer' })

    const periodInfo = changelogView.periodRaw ? ` (last ${changelogView.periodRaw})` : ''
    const statsText = `Total changes: ${entries.length}${periodInfo} | ${changelogView.account?.alias || 'default'}`
    createSpan({ text: statsText, parent: footer })

    const lastUpdateContainer = createDiv({ parent: footer })
    createSpan({
        text: `Last update: ${ObjectsCache.getTime(changelogView.getCacheKey())}`,
        parent: lastUpdateContainer,
    })

    const refreshButton = createEl('button', {
        parent: lastUpdateContainer,
        title: 'Refresh',
        cls: 'rotate-animation'
    })
    setIcon(refreshButton, 'sync-small')
    refreshButton.onClickEvent(() => {
        rootEl.empty()
        ObjectsCache.delete(changelogView.getCacheKey())
        ChangelogFenceRenderer(changelogView.toRawString(), rootEl, null)
    })

    return footer
}

/**
 * Render a mini changelog table for a swimlane (without Issue column when grouping by issue)
 */
function renderMiniChangelogTable(
    entries: IChangelogEntry[],
    showIssueColumn: boolean,
    showAuthorColumn: boolean
): HTMLTableElement {
    const table = createEl('table', {
        cls: `table is-bordered is-striped is-narrow is-hoverable is-fullwidth ${RC.getTheme()} changelog-mini-table`
    })

    // Header
    const thead = createEl('thead', { parent: table })
    const headerRow = createEl('tr', { parent: thead })

    const headers: string[] = ['Time']
    if (showIssueColumn) headers.push('Issue')
    if (showAuthorColumn) headers.push('Author')
    headers.push('Field', 'From', 'To')

    for (const headerText of headers) {
        createEl('th', { text: headerText, parent: headerRow })
    }

    // Body
    const tbody = createEl('tbody', { parent: table })

    for (const entry of entries) {
        const row = createEl('tr', { parent: tbody })

        // Time
        createEl('td', {
            text: formatTimestamp(entry.created),
            cls: 'changelog-time',
            parent: row
        })

        // Issue key (optional)
        if (showIssueColumn) {
            const issueCell = createEl('td', { parent: row })
            createEl('a', {
                text: entry.issueKey,
                href: RC.issueUrl(entry.issueAccount, entry.issueKey),
                cls: 'changelog-issue-link',
                parent: issueCell
            })
        }

        // Author (optional)
        if (showAuthorColumn) {
            const authorCell = createEl('td', { cls: 'changelog-author-cell', parent: row })
            renderAuthorCell(authorCell, entry.author)
        }

        // Field
        createEl('td', {
            text: entry.field,
            cls: 'changelog-field',
            parent: row
        })

        // From value
        const fromCell = createEl('td', { cls: 'changelog-from', parent: row })
        const fromDisplay = getChangeDisplayValue(entry, 'from')
        createSpan({
            text: fromDisplay.text,
            cls: fromDisplay.isEmpty ? 'changelog-empty' : '',
            parent: fromCell
        })

        // To value
        const toCell = createEl('td', { cls: 'changelog-to', parent: row })
        const toDisplay = getChangeDisplayValue(entry, 'to')
        createSpan({
            text: toDisplay.text,
            cls: toDisplay.isEmpty ? 'changelog-empty' : '',
            parent: toCell
        })
    }

    return table
}

/**
 * Render a collapsible swimlane header
 */
function renderSwimlaneHeader(
    title: string,
    count: number,
    isExpanded: boolean,
    avatar?: { url?: string, name: string },
    issueType?: { iconUrl: string, name: string }
): HTMLElement {
    const header = createDiv({ cls: 'changelog-swimlane-header' })

    const toggleIcon = createSpan({ cls: 'changelog-swimlane-toggle', parent: header })
    setIcon(toggleIcon, isExpanded ? 'chevron-down' : 'chevron-right')

    // Issue type icon if provided
    if (issueType?.iconUrl) {
        createEl('img', {
            cls: 'changelog-swimlane-type-icon',
            attr: { src: issueType.iconUrl, alt: issueType.name },
            title: issueType.name,
            parent: header
        })
    }

    // Avatar if provided
    if (avatar) {
        if (avatar.url) {
            createEl('img', {
                cls: 'ji-avatar changelog-swimlane-avatar',
                attr: { src: avatar.url, alt: avatar.name },
                parent: header
            })
        } else {
            const placeholder = createAvatarPlaceholder(avatar.name, 20)
            placeholder.addClass('ji-avatar', 'changelog-swimlane-avatar')
            header.appendChild(placeholder)
        }
    }

    createSpan({ text: title, cls: 'changelog-swimlane-title', parent: header })
    createSpan({ text: `${count}`, cls: 'changelog-swimlane-count', parent: header })

    return header
}

/**
 * Render grouped changelog with swimlanes
 */
function renderGroupedChangelog(
    rootEl: HTMLElement,
    changelogView: ChangelogView,
    entries: IChangelogEntry[]
): void {
    const container = createDiv({ cls: 'changelog-grouped' })

    if (changelogView.groupBy === 'issue') {
        const grouped = groupEntriesByIssue(entries)
        for (const [issueKey, issueEntries] of grouped) {
            const swimlane = createDiv({ cls: 'changelog-swimlane expanded' })

            // Get first entry for issue link and metadata
            const firstEntry = issueEntries[0]
            const issueType = firstEntry.issueTypeIcon ? {
                iconUrl: firstEntry.issueTypeIcon,
                name: firstEntry.issueTypeName
            } : undefined

            const header = renderSwimlaneHeader(issueKey, issueEntries.length, true, undefined, issueType)

            // Make issue key clickable and add summary
            const titleEl = header.querySelector('.changelog-swimlane-title')
            if (titleEl) {
                const link = createEl('a', {
                    text: issueKey,
                    href: RC.issueUrl(firstEntry.issueAccount, issueKey),
                    cls: 'changelog-swimlane-issue-link'
                })
                titleEl.replaceChildren(link)

                // Add summary after link
                if (firstEntry.issueSummary) {
                    createSpan({
                        text: ` ${firstEntry.issueSummary}`,
                        cls: 'changelog-swimlane-summary',
                        parent: titleEl
                    })
                }
            }

            header.addEventListener('click', () => {
                swimlane.toggleClass('expanded', !swimlane.hasClass('expanded'))
                const icon = header.querySelector('.changelog-swimlane-toggle')
                if (icon) setIcon(icon as HTMLElement, swimlane.hasClass('expanded') ? 'chevron-down' : 'chevron-right')
            })
            swimlane.appendChild(header)

            const content = createDiv({ cls: 'changelog-swimlane-content' })
            content.appendChild(renderMiniChangelogTable(issueEntries, false, true))
            swimlane.appendChild(content)

            container.appendChild(swimlane)
        }
    } else if (changelogView.groupBy === 'author') {
        const grouped = groupEntriesByAuthor(entries)
        for (const [authorName, authorEntries] of grouped) {
            const swimlane = createDiv({ cls: 'changelog-swimlane expanded' })

            // Get avatar from first entry
            const firstEntry = authorEntries[0]
            const avatar = firstEntry.author ? {
                url: firstEntry.author.avatarUrls?.['24x24'],
                name: firstEntry.author.displayName
            } : { name: authorName }

            const header = renderSwimlaneHeader(authorName, authorEntries.length, true, avatar)
            header.addEventListener('click', () => {
                swimlane.toggleClass('expanded', !swimlane.hasClass('expanded'))
                const icon = header.querySelector('.changelog-swimlane-toggle')
                if (icon) setIcon(icon as HTMLElement, swimlane.hasClass('expanded') ? 'chevron-down' : 'chevron-right')
            })
            swimlane.appendChild(header)

            const content = createDiv({ cls: 'changelog-swimlane-content' })
            content.appendChild(renderMiniChangelogTable(authorEntries, true, false))
            swimlane.appendChild(content)

            container.appendChild(swimlane)
        }
    } else if (changelogView.groupBy === 'author+issue') {
        const grouped = groupEntriesByAuthorAndIssue(entries)
        for (const [authorName, issuesMap] of grouped) {
            const authorSwimlane = createDiv({ cls: 'changelog-swimlane expanded' })

            // Count total entries for this author
            let totalAuthorEntries = 0
            for (const issueEntries of issuesMap.values()) {
                totalAuthorEntries += issueEntries.length
            }

            // Get avatar from first entry
            const firstIssueEntries = issuesMap.values().next().value
            const firstEntry = firstIssueEntries?.[0]
            const avatar = firstEntry?.author ? {
                url: firstEntry.author.avatarUrls?.['24x24'],
                name: firstEntry.author.displayName
            } : { name: authorName }

            const authorHeader = renderSwimlaneHeader(authorName, totalAuthorEntries, true, avatar)
            authorHeader.addEventListener('click', (e) => {
                // Only toggle if clicking on header, not nested swimlanes
                if ((e.target as HTMLElement).closest('.changelog-swimlane-nested')) return
                authorSwimlane.toggleClass('expanded', !authorSwimlane.hasClass('expanded'))
                const icon = authorHeader.querySelector('.changelog-swimlane-toggle')
                if (icon) setIcon(icon as HTMLElement, authorSwimlane.hasClass('expanded') ? 'chevron-down' : 'chevron-right')
            })
            authorSwimlane.appendChild(authorHeader)

            const authorContent = createDiv({ cls: 'changelog-swimlane-content' })

            // Nested swimlanes by issue
            for (const [issueKey, issueEntries] of issuesMap) {
                const issueSwimlane = createDiv({ cls: 'changelog-swimlane-nested expanded' })

                // Get issue metadata from first entry
                const issueFirstEntry = issueEntries[0]
                const issueType = issueFirstEntry.issueTypeIcon ? {
                    iconUrl: issueFirstEntry.issueTypeIcon,
                    name: issueFirstEntry.issueTypeName
                } : undefined

                const issueHeader = renderSwimlaneHeader(issueKey, issueEntries.length, true, undefined, issueType)

                // Make issue key clickable and add summary
                const titleEl = issueHeader.querySelector('.changelog-swimlane-title')
                if (titleEl) {
                    const link = createEl('a', {
                        text: issueKey,
                        href: RC.issueUrl(issueFirstEntry.issueAccount, issueKey),
                        cls: 'changelog-swimlane-issue-link'
                    })
                    titleEl.replaceChildren(link)

                    // Add summary after link
                    if (issueFirstEntry.issueSummary) {
                        createSpan({
                            text: ` ${issueFirstEntry.issueSummary}`,
                            cls: 'changelog-swimlane-summary',
                            parent: titleEl
                        })
                    }
                }

                issueHeader.addEventListener('click', () => {
                    issueSwimlane.toggleClass('expanded', !issueSwimlane.hasClass('expanded'))
                    const icon = issueHeader.querySelector('.changelog-swimlane-toggle')
                    if (icon) setIcon(icon as HTMLElement, issueSwimlane.hasClass('expanded') ? 'chevron-down' : 'chevron-right')
                })
                issueSwimlane.appendChild(issueHeader)

                const issueContent = createDiv({ cls: 'changelog-swimlane-content' })
                issueContent.appendChild(renderMiniChangelogTable(issueEntries, false, false))
                issueSwimlane.appendChild(issueContent)

                authorContent.appendChild(issueSwimlane)
            }

            authorSwimlane.appendChild(authorContent)
            container.appendChild(authorSwimlane)
        }
    }

    // Footer
    const footer = renderChangelogFooter(rootEl, changelogView, entries)

    rootEl.replaceChildren(RC.renderContainer([container, footer]))
}

/**
 * Render empty state when no changes found
 */
function renderEmptyState(rootEl: HTMLElement, changelogView: ChangelogView): void {
    const container = createDiv({ cls: 'changelog-empty-state' })
    createSpan({
        text: 'No changes found',
        cls: 'changelog-empty-message',
        parent: container
    })
    if (changelogView.periodRaw) {
        createSpan({
            text: ` in the last ${changelogView.periodRaw}`,
            cls: 'changelog-empty-period',
            parent: container
        })
    }

    // Footer with refresh button
    const footer = createDiv({ cls: 'changelog-footer', parent: container })
    const lastUpdateContainer = createDiv({ parent: footer })
    createSpan({
        text: `Last update: ${ObjectsCache.getTime(changelogView.getCacheKey())}`,
        parent: lastUpdateContainer,
    })
    const refreshButton = createEl('button', {
        parent: lastUpdateContainer,
        title: 'Refresh',
        cls: 'rotate-animation'
    })
    setIcon(refreshButton, 'sync-small')
    refreshButton.onClickEvent(() => {
        rootEl.empty()
        ObjectsCache.delete(changelogView.getCacheKey())
        ChangelogFenceRenderer(changelogView.toRawString(), rootEl, null)
    })

    rootEl.replaceChildren(RC.renderContainer([container]))
}

/**
 * Main renderer for jira-changelog code blocks
 */
export const ChangelogFenceRenderer = async (
    source: string,
    rootEl: HTMLElement,
    ctx: MarkdownPostProcessorContext
): Promise<void> => {
    try {
        const changelogView = ChangelogView.fromString(source)

        const cachedData = ObjectsCache.get(changelogView.getCacheKey())
        if (cachedData) {
            if (cachedData.isError) {
                RC.renderSearchError(rootEl, cachedData.data as string, null)
            } else {
                const entries = cachedData.data as IChangelogEntry[]
                if (entries.length === 0) {
                    renderEmptyState(rootEl, changelogView)
                } else if (changelogView.groupBy) {
                    renderGroupedChangelog(rootEl, changelogView, entries)
                } else {
                    renderChangelogTable(rootEl, changelogView, entries)
                }
            }
            return
        }

        // Show loading state
        const loadingEl = createDiv({ cls: 'changelog-loading' })
        createSpan({ cls: 'spinner', parent: loadingEl })
        createSpan({ text: 'Loading changelog...', parent: loadingEl })
        rootEl.appendChild(loadingEl)

        // Fetch data with changelog expansion
        JiraClient.getSearchResults(changelogView.query, {
            limit: changelogView.limit,
            expand: ['changelog'],
            account: changelogView.account
        })
            .then(searchResults => {
                changelogView.account = searchResults.account

                // Transform to flat changelog entries
                const entries = flattenChangelog(
                    searchResults.issues,
                    changelogView.period,
                    changelogView.fields,
                    changelogView.excludeFields
                )

                // Cache the transformed data
                ObjectsCache.add(changelogView.getCacheKey(), entries)

                if (entries.length === 0) {
                    renderEmptyState(rootEl, changelogView)
                } else if (changelogView.groupBy) {
                    renderGroupedChangelog(rootEl, changelogView, entries)
                } else {
                    renderChangelogTable(rootEl, changelogView, entries)
                }
            })
            .catch(err => {
                ObjectsCache.add(changelogView.getCacheKey(), err, true)
                RC.renderSearchError(rootEl, err, null)
            })

    } catch (err) {
        RC.renderSearchError(rootEl, err.message || err, null)
    }
}
