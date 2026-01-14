import { MarkdownPostProcessorContext, setIcon } from "obsidian"
import { toDefaultedIssue, IJiraSearchResults, IJiraIssue } from "../interfaces/issueInterfaces"
import { ESearchColumnsTypes, ISearchColumn } from "../interfaces/settingsInterfaces"
import JiraClient from "../client/jiraClient"
import ObjectsCache from "../objectsCache"
import RC, { JIRA_STATUS_COLOR_MAP, JIRA_STATUS_COLOR_MAP_BY_NAME } from "./renderingCommon"
import { KanbanView, IKanbanColumn, EstimationType } from "../kanbanView"
import { SettingsData } from "../settings"
import { attachIssueClickHandler } from "./issueClickHandler"
import { attachIssueContextMenuHandler } from "./issueContextMenuHandler"

interface IKanbanColumnData {
    column: IKanbanColumn
    issues: IJiraIssue[]
}

function groupIssuesByStatus(issues: IJiraIssue[], kanbanView: KanbanView): {
    columns: IKanbanColumnData[]
    unmapped: IJiraIssue[]
} {
    const result: IKanbanColumnData[] = kanbanView.columns.map(col => ({
        column: col,
        issues: []
    }))
    const unmapped: IJiraIssue[] = []
    const statusToColumnIndex: Map<string, number> = new Map()

    // Build status-to-column lookup (case-insensitive)
    kanbanView.columns.forEach((col, idx) => {
        col.statuses.forEach(status => {
            statusToColumnIndex.set(status.toLowerCase(), idx)
        })
    })

    // Group issues
    for (const issue of issues) {
        const statusName = issue.fields.status.name.toLowerCase()
        const columnIdx = statusToColumnIndex.get(statusName)

        if (columnIdx !== undefined) {
            result[columnIdx].issues.push(issue)
        } else {
            unmapped.push(issue)
        }
    }

    return { columns: result, unmapped }
}

function renderKanbanCard(
    issue: IJiraIssue,
    fields: ISearchColumn[],
    onIssueUpdated: (issue: IJiraIssue) => void
): HTMLElement {
    const card = createDiv({ cls: 'ji-kanban-card' })

    // Attach context menu for editing labels, priority, assignee
    attachIssueContextMenuHandler(card, issue, onIssueUpdated)

    // Header row: type icon + key + priority
    const headerRow = createDiv({ cls: 'ji-kanban-card-header' })

    // Type icon
    if (hasField(fields, ESearchColumnsTypes.TYPE) && issue.fields.issuetype?.iconUrl) {
        createEl('img', {
            cls: 'ji-kanban-card-type-icon',
            attr: { src: issue.fields.issuetype.iconUrl, alt: issue.fields.issuetype.name },
            title: issue.fields.issuetype.name,
            parent: headerRow
        })
    }

    // Issue key
    if (hasField(fields, ESearchColumnsTypes.KEY)) {
        const keyLink = createEl('a', {
            cls: 'ji-kanban-card-key',
            text: issue.key,
            href: RC.issueUrl(issue.account, issue.key),
            title: issue.fields.summary,
            parent: headerRow
        })
        attachIssueClickHandler(keyLink, issue)
    }

    // Priority icon
    if (hasField(fields, ESearchColumnsTypes.PRIORITY) && issue.fields.priority?.iconUrl) {
        createEl('img', {
            cls: 'ji-kanban-card-priority-icon',
            attr: { src: issue.fields.priority.iconUrl, alt: issue.fields.priority.name },
            title: issue.fields.priority.name,
            parent: headerRow
        })
    }

    card.appendChild(headerRow)

    // Summary
    if (hasField(fields, ESearchColumnsTypes.SUMMARY)) {
        createDiv({ cls: 'ji-kanban-card-summary', text: issue.fields.summary, parent: card })
    }

    // Status
    if (hasField(fields, ESearchColumnsTypes.STATUS) && issue.fields.status?.name) {
        const statusColor = JIRA_STATUS_COLOR_MAP_BY_NAME[issue.fields.status.name] ||
            JIRA_STATUS_COLOR_MAP[issue.fields.status.statusCategory?.colorName] ||
            'is-light'
        const statusRow = createDiv({ cls: 'ji-kanban-card-status', parent: card })
        createSpan({
            cls: `ji-tag ${statusColor}`,
            text: issue.fields.status.name,
            title: issue.fields.status.description,
            parent: statusRow
        })
    }

    // Labels
    if (hasField(fields, ESearchColumnsTypes.LABELS) && issue.fields.labels?.length > 0) {
        const labelsRow = createDiv({ cls: 'ji-kanban-card-labels', parent: card })
        for (const label of issue.fields.labels) {
            createSpan({ cls: 'ji-kanban-card-label', text: label, parent: labelsRow })
        }
    }

    // Footer with assignee
    if (hasField(fields, ESearchColumnsTypes.ASSIGNEE)) {
        const footer = createDiv({ cls: 'ji-kanban-card-footer' })
        if (issue.fields.assignee?.displayName) {
            if (issue.fields.assignee.avatarUrls?.['16x16']) {
                createEl('img', {
                    cls: 'ji-kanban-card-avatar',
                    attr: { src: issue.fields.assignee.avatarUrls['16x16'], alt: issue.fields.assignee.displayName },
                    title: issue.fields.assignee.displayName,
                    parent: footer
                })
            }
            createSpan({ cls: 'ji-kanban-card-assignee', text: issue.fields.assignee.displayName, parent: footer })
        } else {
            createSpan({ cls: 'ji-kanban-card-assignee ji-unassigned', text: 'Unassigned', parent: footer })
        }
        card.appendChild(footer)
    }

    // Due date
    if (hasField(fields, ESearchColumnsTypes.DUE_DATE) && issue.fields.duedate) {
        const dueDateRow = createDiv({ cls: 'ji-kanban-card-due-date', parent: card })
        const isOverdue = new Date(issue.fields.duedate) < new Date()
        createSpan({
            cls: isOverdue ? 'ji-kanban-due-overdue' : 'ji-kanban-due-normal',
            text: issue.fields.duedate,
            parent: dueDateRow
        })
    }

    return card
}

function hasField(fields: ISearchColumn[], type: ESearchColumnsTypes): boolean {
    return fields.some(f => f.type === type)
}

/**
 * Convert seconds to human-readable time string with days support
 * e.g., 42h with 8h/day = "5d 2h"
 */
function formatTimeEstimation(seconds: number, hoursPerDay: number = 8): string {
    if (!seconds) return '0h'

    const totalHours = Math.floor(seconds / 3600)
    const m = Math.floor((seconds % 3600) / 60)

    // Calculate days and remaining hours
    const d = Math.floor(totalHours / hoursPerDay)
    const h = totalHours % hoursPerDay

    let timeStr = ''
    if (d > 0) timeStr += d + 'd'
    if (h > 0) timeStr += (timeStr ? ' ' : '') + h + 'h'
    if (m > 0 && d === 0) timeStr += (timeStr ? ' ' : '') + m + 'm'  // Only show minutes if no days
    return timeStr || '0h'
}

/**
 * Format estimation value based on type
 */
function formatEstimation(value: number, type: EstimationType, hoursPerDay: number = 8): string {
    if (type === 'time') {
        return formatTimeEstimation(value, hoursPerDay)
    }
    // For points, show as number (with 1 decimal if needed)
    if (value % 1 !== 0) {
        return value.toFixed(1)
    }
    return value.toString()
}

/**
 * Get estimation value from an issue field
 */
function getIssueEstimation(issue: IJiraIssue, fieldName: string): number {
    const fields = issue.fields as Record<string, unknown>

    // Try direct field access (e.g., timeoriginalestimate)
    if (fieldName in fields) {
        return Number(fields[fieldName]) || 0
    }

    // Try as customfield_XXXXX
    if (fields[fieldName]) {
        return Number(fields[fieldName]) || 0
    }

    // Try with customfield_ prefix
    const customFieldKey = fieldName.startsWith('customfield_') ? fieldName : `customfield_${fieldName}`
    if (fields[customFieldKey]) {
        return Number(fields[customFieldKey]) || 0
    }

    return 0
}

/**
 * Calculate total estimation for a list of issues
 */
function calculateColumnEstimation(issues: IJiraIssue[], fieldName: string): number {
    let sum = 0
    for (const issue of issues) {
        sum += getIssueEstimation(issue, fieldName)
    }
    return sum
}

// ============ Swimlane Support ============

interface ISwimlane {
    key: string
    name: string
    avatarUrl?: string
    issues: IJiraIssue[]
}

interface ISwimlaneValue {
    key: string
    name: string
    avatarUrl?: string
}

/**
 * Get swimlane grouping value from an issue based on swimlaneBy type
 */
function getSwimlaneValue(issue: IJiraIssue, swimlaneBy: string, noValueLabel: string): ISwimlaneValue {
    const fields = issue.fields as Record<string, unknown>
    const swimlaneByLower = swimlaneBy.toLowerCase()

    switch (swimlaneByLower) {
        case 'assignee': {
            const assignee = issue.fields.assignee
            return {
                key: assignee?.accountId || assignee?.name || 'unassigned',
                name: assignee?.displayName || noValueLabel,
                avatarUrl: assignee?.avatarUrls?.['24x24']
            }
        }

        case 'reporter': {
            const reporter = issue.fields.reporter
            return {
                key: reporter?.accountId || reporter?.name || 'unknown',
                name: reporter?.displayName || noValueLabel,
                avatarUrl: reporter?.avatarUrls?.['24x24']
            }
        }

        case 'epic': {
            // Try common Epic Link custom field patterns
            const epicFieldNames = ['customfield_10014', 'customfield_10000', 'customfield_10008']
            let epicKey: string = null

            for (const fieldName of epicFieldNames) {
                const value = fields[fieldName]
                if (value && typeof value === 'string') {
                    epicKey = value
                    break
                }
            }

            // Also try parent for Next-gen projects
            if (!epicKey && issue.fields.parent?.fields?.issuetype?.name === 'Epic') {
                epicKey = issue.fields.parent.key
            }

            return {
                key: epicKey || 'no-epic',
                name: epicKey || noValueLabel
            }
        }

        case 'parent':
        case 'story': {
            const parent = issue.fields.parent
            if (parent) {
                return {
                    key: parent.key,
                    name: `${parent.key}: ${parent.fields?.summary || ''}`
                }
            }
            return {
                key: 'no-parent',
                name: noValueLabel
            }
        }

        default: {
            // Custom field - support both $FieldName and customfield_XXXXX formats
            let fieldKey = swimlaneBy

            // Handle $FieldName format - resolve to customfield ID
            if (swimlaneBy.startsWith('$')) {
                const fieldName = swimlaneBy.slice(1)
                const account = issue.account
                if (account?.cache?.customFieldsNameToId?.[fieldName]) {
                    fieldKey = `customfield_${account.cache.customFieldsNameToId[fieldName]}`
                }
            }

            // Handle plain customfield ID (add prefix if needed)
            if (!fieldKey.startsWith('customfield_') && /^\d+$/.test(fieldKey)) {
                fieldKey = `customfield_${fieldKey}`
            }

            const value = fields[fieldKey]

            // Handle user-type custom fields
            if (value && typeof value === 'object' && 'displayName' in value) {
                const userValue = value as { displayName?: string; accountId?: string; avatarUrls?: Record<string, string> }
                return {
                    key: userValue.accountId || String(userValue.displayName) || 'unknown',
                    name: userValue.displayName || noValueLabel,
                    avatarUrl: userValue.avatarUrls?.['24x24']
                }
            }

            // Handle array values (take first)
            if (Array.isArray(value)) {
                const firstValue = value[0]
                if (typeof firstValue === 'object' && firstValue?.displayName) {
                    return {
                        key: firstValue.accountId || String(firstValue.displayName),
                        name: firstValue.displayName,
                        avatarUrl: firstValue.avatarUrls?.['24x24']
                    }
                }
                return {
                    key: String(firstValue) || 'no-value',
                    name: String(firstValue) || noValueLabel
                }
            }

            // Handle string/number values
            if (value !== null && value !== undefined) {
                return {
                    key: String(value),
                    name: String(value)
                }
            }

            return {
                key: 'no-value',
                name: noValueLabel
            }
        }
    }
}

/**
 * Group issues into swimlanes based on swimlaneBy field
 */
function groupIssuesBySwimlane(
    issues: IJiraIssue[],
    swimlaneBy: string,
    noValueLabel: string
): ISwimlane[] {
    const swimlaneMap = new Map<string, ISwimlane>()

    for (const issue of issues) {
        const { key, name, avatarUrl } = getSwimlaneValue(issue, swimlaneBy, noValueLabel)

        if (!swimlaneMap.has(key)) {
            swimlaneMap.set(key, {
                key,
                name,
                avatarUrl,
                issues: []
            })
        }
        swimlaneMap.get(key).issues.push(issue)
    }

    // Sort: "no-value" / "no-epic" / etc. swimlanes at the end
    return Array.from(swimlaneMap.values()).sort((a, b) => {
        const aIsNoValue = a.key.startsWith('no-') || a.key === 'unassigned' || a.key === 'unknown'
        const bIsNoValue = b.key.startsWith('no-') || b.key === 'unassigned' || b.key === 'unknown'
        if (aIsNoValue && !bIsNoValue) return 1
        if (!aIsNoValue && bIsNoValue) return -1
        return a.name.localeCompare(b.name)
    })
}

/**
 * Render a single swimlane with its columns
 */
function renderSwimlane(
    swimlane: ISwimlane,
    kanbanView: KanbanView,
    onIssueUpdated: (issue: IJiraIssue) => void
): HTMLElement {
    const swimlaneEl = createDiv({ cls: 'ji-kanban-swimlane' })

    // Swimlane header (collapsible)
    const header = createDiv({ cls: 'ji-kanban-swimlane-header' })

    // Collapse toggle
    const toggle = createSpan({ cls: 'ji-kanban-swimlane-toggle', text: '▼', parent: header })

    // Avatar (for user-based swimlanes)
    if (swimlane.avatarUrl) {
        createEl('img', {
            cls: 'ji-kanban-swimlane-avatar',
            attr: { src: swimlane.avatarUrl, alt: swimlane.name },
            parent: header
        })
    }

    // Name
    createSpan({ cls: 'ji-kanban-swimlane-name', text: swimlane.name, parent: header })

    // Issue count
    createSpan({
        cls: 'ji-kanban-swimlane-count',
        text: `(${swimlane.issues.length})`,
        parent: header
    })

    // Estimation total for swimlane
    if (kanbanView.estimationField) {
        const total = calculateColumnEstimation(swimlane.issues, kanbanView.estimationField)
        const formatted = formatEstimation(total, kanbanView.estimationType, kanbanView.hoursPerDay)
        const suffix = kanbanView.estimationType === 'points' ? ' pts' : ''
        createSpan({
            cls: 'ji-kanban-swimlane-estimation',
            text: formatted + suffix,
            parent: header
        })
    }

    swimlaneEl.appendChild(header)

    // Columns container inside swimlane
    const { columns, unmapped } = groupIssuesByStatus(swimlane.issues, kanbanView)
    const columnsContainer = createDiv({ cls: 'ji-kanban-columns' })

    for (const colData of columns) {
        columnsContainer.appendChild(renderKanbanColumn(colData, kanbanView, onIssueUpdated))
    }

    // Unmapped column inside swimlane
    if (kanbanView.showUnmapped && unmapped.length > 0) {
        const unmappedColumn: IKanbanColumnData = {
            column: { name: 'Unmapped', statuses: [] },
            issues: unmapped
        }
        const unmappedEl = renderKanbanColumn(unmappedColumn, kanbanView, onIssueUpdated)
        unmappedEl.classList.add('ji-kanban-column-unmapped')
        columnsContainer.appendChild(unmappedEl)
    }

    swimlaneEl.appendChild(columnsContainer)

    // Collapse/expand functionality
    let collapsed = false
    header.addEventListener('click', () => {
        collapsed = !collapsed
        toggle.textContent = collapsed ? '▶' : '▼'
        swimlaneEl.classList.toggle('collapsed', collapsed)
    })

    return swimlaneEl
}

function renderKanbanColumn(
    columnData: IKanbanColumnData,
    kanbanView: KanbanView,
    onIssueUpdated: (issue: IJiraIssue) => void
): HTMLElement {
    const column = createDiv({ cls: 'ji-kanban-column' })

    // Column header
    const header = createDiv({ cls: 'ji-kanban-column-header' })
    createSpan({ cls: 'ji-kanban-column-title', text: columnData.column.name, parent: header })

    // Stats container (count + estimation)
    const statsContainer = createDiv({ cls: 'ji-kanban-column-stats', parent: header })

    const countText = columnData.column.wipLimit
        ? `${columnData.issues.length}/${columnData.column.wipLimit}`
        : columnData.issues.length.toString()

    const isWipExceeded = columnData.column.wipLimit && columnData.issues.length > columnData.column.wipLimit
    createSpan({
        cls: `ji-kanban-column-count ${isWipExceeded ? 'ji-wip-exceeded' : ''}`,
        text: countText,
        parent: statsContainer
    })

    // Estimation display
    if (kanbanView.estimationField) {
        const estimation = calculateColumnEstimation(columnData.issues, kanbanView.estimationField)
        const formatted = formatEstimation(estimation, kanbanView.estimationType, kanbanView.hoursPerDay)
        const suffix = kanbanView.estimationType === 'points' ? ' pts' : ''
        createSpan({
            cls: 'ji-kanban-column-estimation',
            text: formatted + suffix,
            title: `Total estimation: ${formatted}${suffix}`,
            parent: statsContainer
        })
    }

    column.appendChild(header)

    // Column cards container
    const cardsContainer = createDiv({ cls: 'ji-kanban-column-cards' })
    for (const issue of columnData.issues) {
        cardsContainer.appendChild(renderKanbanCard(toDefaultedIssue(issue), kanbanView.fields, onIssueUpdated))
    }
    column.appendChild(cardsContainer)

    return column
}

function renderKanbanBoard(
    rootEl: HTMLElement,
    kanbanView: KanbanView,
    searchResults: IJiraSearchResults
): void {
    kanbanView.account = searchResults.account

    const board = createDiv({ cls: `ji-kanban-board ${RC.getTheme()}` })

    // Callback to update issue in cache and re-render board
    const onIssueUpdated = (updatedIssue: IJiraIssue): void => {
        // Update issue in cached search results
        const cachedResults = ObjectsCache.get(kanbanView.getCacheKey())
        if (cachedResults && !cachedResults.isError) {
            const results = cachedResults.data as IJiraSearchResults
            const issueIndex = results.issues.findIndex(i => i.key === updatedIssue.key)
            if (issueIndex !== -1) {
                results.issues[issueIndex] = updatedIssue
            }
        }
        // Re-render the board
        renderKanbanBoard(rootEl, kanbanView, searchResults)
    }

    // Check if swimlanes are enabled
    if (kanbanView.swimlaneBy) {
        // Render with swimlanes
        const swimlanes = groupIssuesBySwimlane(
            searchResults.issues,
            kanbanView.swimlaneBy,
            kanbanView.noValueSwimlane
        )

        const swimlanesContainer = createDiv({ cls: 'ji-kanban-swimlanes' })

        for (const swimlane of swimlanes) {
            if (swimlane.issues.length > 0 || kanbanView.showEmptySwimlanes) {
                swimlanesContainer.appendChild(renderSwimlane(swimlane, kanbanView, onIssueUpdated))
            }
        }

        board.appendChild(swimlanesContainer)
    } else {
        // Render without swimlanes (original logic)
        const { columns, unmapped } = groupIssuesByStatus(searchResults.issues, kanbanView)

        const columnsContainer = createDiv({ cls: 'ji-kanban-columns' })
        for (const colData of columns) {
            columnsContainer.appendChild(renderKanbanColumn(colData, kanbanView, onIssueUpdated))
        }

        // Render unmapped issues column if enabled and there are unmapped issues
        if (kanbanView.showUnmapped && unmapped.length > 0) {
            const unmappedColumn: IKanbanColumnData = {
                column: { name: 'Unmapped', statuses: [] },
                issues: unmapped
            }
            const unmappedEl = renderKanbanColumn(unmappedColumn, kanbanView, onIssueUpdated)
            unmappedEl.classList.add('ji-kanban-column-unmapped')
            columnsContainer.appendChild(unmappedEl)
        }

        board.appendChild(columnsContainer)
    }

    // Footer with stats
    const footer = renderKanbanFooter(rootEl, kanbanView, searchResults)
    board.appendChild(footer)

    rootEl.replaceChildren(RC.renderContainer([board]))
}

function renderKanbanFooter(
    rootEl: HTMLElement,
    kanbanView: KanbanView,
    searchResults: IJiraSearchResults
): HTMLElement {
    const footer = createDiv({ cls: 'ji-kanban-footer' })

    const statsText = `Total: ${searchResults.issues.length} issues | ${searchResults.account.alias}`
    if (SettingsData.showJiraLink) {
        createEl('a', {
            text: statsText,
            href: RC.searchUrl(kanbanView.account, kanbanView.query),
            parent: footer,
        })
    } else {
        createSpan({ text: statsText, parent: footer })
    }

    const lastUpdateContainer = createDiv({ parent: footer })
    createSpan({
        text: `Last update: ${ObjectsCache.getTime(kanbanView.getCacheKey())}`,
        parent: lastUpdateContainer,
    })

    const refreshButton = createEl('button', { parent: lastUpdateContainer, title: 'Refresh', cls: 'rotate-animation' })
    setIcon(refreshButton, 'sync-small')
    refreshButton.onClickEvent(() => {
        rootEl.empty()
        ObjectsCache.delete(kanbanView.getCacheKey())
        KanbanFenceRenderer(kanbanView.toRawString(), rootEl, null)
    })

    return footer
}

export const KanbanFenceRenderer = async (
    source: string,
    rootEl: HTMLElement,
    ctx: MarkdownPostProcessorContext
): Promise<void> => {
    try {
        const kanbanView = KanbanView.fromString(source)

        const cachedResults = ObjectsCache.get(kanbanView.getCacheKey())
        if (cachedResults) {
            if (cachedResults.isError) {
                RC.renderSearchError(rootEl, cachedResults.data as string, null)
            } else {
                renderKanbanBoard(rootEl, kanbanView, cachedResults.data as IJiraSearchResults)
            }
        } else {
            const loadingEl = createDiv({ cls: 'ji-kanban-loading' })
            createSpan({ cls: 'spinner', parent: loadingEl })
            createSpan({ text: 'Loading...', parent: loadingEl })
            rootEl.appendChild(loadingEl)

            const limit = kanbanView.limit || SettingsData.searchResultsLimit
            JiraClient.getSearchResults(kanbanView.query, {
                limit,
                account: kanbanView.account
            })
                .then(searchResults => {
                    kanbanView.account = searchResults.account
                    const cached = ObjectsCache.add(kanbanView.getCacheKey(), searchResults)
                    renderKanbanBoard(rootEl, kanbanView, cached.data as IJiraSearchResults)
                })
                .catch(err => {
                    ObjectsCache.add(kanbanView.getCacheKey(), err, true)
                    RC.renderSearchError(rootEl, err, null)
                })
        }
    } catch (err) {
        RC.renderSearchError(rootEl, err.message || err, null)
    }
}
