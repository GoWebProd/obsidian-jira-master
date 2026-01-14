import { COMMENT_REGEX, ESearchColumnsTypes, IJiraIssueAccountSettings, ISearchColumn } from "./interfaces/settingsInterfaces"
import { SettingsData } from "./settings"
import { getAccountByAlias } from "./utils"

export interface IKanbanColumn {
    name: string
    statuses: string[]
    wipLimit?: number
}

export type EstimationType = 'points' | 'time'

export class KanbanView {
    query: string = ''
    account: IJiraIssueAccountSettings = null
    columns: IKanbanColumn[] = []
    fields: ISearchColumn[] = []
    limit: number = null
    showUnmapped: boolean = true
    estimationField: string = null
    estimationType: EstimationType = 'points'
    hoursPerDay: number = 8  // For converting hours to days in time estimation
    // Swimlane settings
    swimlaneBy: string = null
    showEmptySwimlanes: boolean = false
    noValueSwimlane: string = 'No Value'
    private _cacheKey: string = null

    static fromString(source: string): KanbanView {
        const kv = new KanbanView()
        const lines = source.split('\n').filter(line => line.trim() && !COMMENT_REGEX.test(line))

        let currentColumn: IKanbanColumn | null = null

        for (const line of lines) {
            const trimmedLine = line.trim()
            const indentLevel = line.length - line.trimStart().length

            // Column definition (starts with "column:")
            if (trimmedLine.toLowerCase().startsWith('column:')) {
                if (currentColumn) {
                    kv.columns.push(currentColumn)
                }
                const columnName = trimmedLine.substring('column:'.length).trim()
                currentColumn = { name: columnName, statuses: [] }
                continue
            }

            // Indented line under a column (statuses, wip)
            if (currentColumn && indentLevel > 0) {
                const colonIndex = trimmedLine.indexOf(':')
                if (colonIndex === -1) continue

                const key = trimmedLine.substring(0, colonIndex).trim().toLowerCase()
                const value = trimmedLine.substring(colonIndex + 1).trim()

                if (key === 'statuses') {
                    currentColumn.statuses = value.split(',').map(s => s.trim()).filter(s => s)
                } else if (key === 'wip') {
                    const wipValue = parseInt(value)
                    if (!isNaN(wipValue) && wipValue > 0) {
                        currentColumn.wipLimit = wipValue
                    }
                }
                continue
            }

            // Save current column if we hit a top-level key
            if (currentColumn && indentLevel === 0) {
                kv.columns.push(currentColumn)
                currentColumn = null
            }

            // Top-level key-value pairs
            const colonIndex = trimmedLine.indexOf(':')
            if (colonIndex === -1) continue

            const key = trimmedLine.substring(0, colonIndex).trim().toLowerCase()
            const value = trimmedLine.substring(colonIndex + 1).trim()

            switch (key) {
                case 'query':
                    kv.query = value
                    break
                case 'account':
                    kv.account = getAccountByAlias(value)
                    break
                case 'fields':
                    kv.fields = kv.parseFields(value)
                    break
                case 'limit':
                    const limitValue = parseInt(value)
                    if (!isNaN(limitValue) && limitValue > 0) {
                        kv.limit = limitValue
                    }
                    break
                case 'showunmapped':
                    kv.showUnmapped = value.toLowerCase() !== 'false'
                    break
                case 'estimationfield':
                    kv.estimationField = value
                    break
                case 'estimationtype':
                    if (value.toLowerCase() === 'time' || value.toLowerCase() === 'points') {
                        kv.estimationType = value.toLowerCase() as EstimationType
                    }
                    break
                case 'hoursperday':
                    const hpd = parseInt(value)
                    if (!isNaN(hpd) && hpd > 0) {
                        kv.hoursPerDay = hpd
                    }
                    break
                case 'swimlaneby':
                    kv.swimlaneBy = value
                    break
                case 'showemptyswimlanes':
                    kv.showEmptySwimlanes = value.toLowerCase() === 'true'
                    break
                case 'novalueswimlane':
                    kv.noValueSwimlane = value
                    break
            }
        }

        // Don't forget the last column
        if (currentColumn) {
            kv.columns.push(currentColumn)
        }

        // Set default fields if not specified
        if (kv.fields.length === 0) {
            kv.fields = [
                { type: ESearchColumnsTypes.KEY, compact: false },
                { type: ESearchColumnsTypes.SUMMARY, compact: false },
                { type: ESearchColumnsTypes.PRIORITY, compact: false },
                { type: ESearchColumnsTypes.ASSIGNEE, compact: false },
            ]
        }

        // Validation
        if (!kv.query) {
            throw new Error('Query is required for jira-kanban')
        }
        if (kv.columns.length === 0) {
            throw new Error('At least one column definition is required')
        }

        return kv
    }

    private parseFields(value: string): ISearchColumn[] {
        return value.split(',')
            .filter(f => f.trim())
            .map(f => {
                let fieldName = f.trim()
                let extra = ''

                // Custom field
                if (fieldName.startsWith('$')) {
                    extra = fieldName.slice(1)
                    if (SettingsData.cache.columns.indexOf(extra.toUpperCase()) === -1) {
                        throw new Error(`Custom field ${extra} not found`)
                    }
                    return {
                        type: ESearchColumnsTypes.CUSTOM_FIELD,
                        compact: false,
                        extra: extra,
                    }
                }

                fieldName = fieldName.toUpperCase()
                if (!(fieldName in ESearchColumnsTypes)) {
                    throw new Error(`Invalid field: ${fieldName}`)
                }
                return {
                    type: fieldName as ESearchColumnsTypes,
                    compact: false,
                }
            })
    }

    getCacheKey(): string {
        if (!this._cacheKey) {
            this._cacheKey = `kanban:${this.query}:${this.limit || ''}:${this.account?.alias || ''}`
        }
        return this._cacheKey
    }

    toRawString(): string {
        let result = `query: ${this.query}\n`

        if (this.account) {
            result += `account: ${this.account.alias}\n`
        }

        result += '\n'

        for (const col of this.columns) {
            result += `column: ${col.name}\n`
            result += `  statuses: ${col.statuses.join(', ')}\n`
            if (col.wipLimit) {
                result += `  wip: ${col.wipLimit}\n`
            }
            result += '\n'
        }

        if (this.fields.length > 0) {
            result += `fields: ${this.fields.map(f =>
                f.type === ESearchColumnsTypes.CUSTOM_FIELD ? '$' + f.extra : f.type
            ).join(', ')}\n`
        }

        if (this.limit) {
            result += `limit: ${this.limit}\n`
        }

        if (!this.showUnmapped) {
            result += `showUnmapped: false\n`
        }

        if (this.estimationField) {
            result += `estimationField: ${this.estimationField}\n`
            result += `estimationType: ${this.estimationType}\n`
            if (this.hoursPerDay !== 8) {
                result += `hoursPerDay: ${this.hoursPerDay}\n`
            }
        }

        if (this.swimlaneBy) {
            result += `swimlaneBy: ${this.swimlaneBy}\n`
            if (this.showEmptySwimlanes) {
                result += `showEmptySwimlanes: true\n`
            }
            if (this.noValueSwimlane !== 'No Value') {
                result += `noValueSwimlane: ${this.noValueSwimlane}\n`
            }
        }

        return result
    }
}
