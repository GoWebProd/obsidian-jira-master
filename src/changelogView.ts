import { COMMENT_REGEX, IJiraIssueAccountSettings } from "./interfaces/settingsInterfaces"
import { getAccountByAlias } from "./utils"

export type ChangelogGroupBy = 'issue' | 'author' | 'author+issue' | null

/**
 * Parse period string to milliseconds
 * Supports: 30m, 2h, 1d, 1w
 *
 * @param periodStr - Period string like "2h", "1d", "30m", "1w"
 * @returns milliseconds or null if invalid
 */
export function parsePeriod(periodStr: string): number | null {
    if (!periodStr) return null

    const match = periodStr.trim().toLowerCase().match(/^(\d+)\s*(m|h|d|w)$/)
    if (!match) return null

    const value = parseInt(match[1], 10)
    const unit = match[2]

    const multipliers: Record<string, number> = {
        'm': 60 * 1000,              // minutes
        'h': 60 * 60 * 1000,         // hours
        'd': 24 * 60 * 60 * 1000,    // days
        'w': 7 * 24 * 60 * 60 * 1000 // weeks
    }

    return value * multipliers[unit]
}

export class ChangelogView {
    query: string = ''
    limit: number = 20
    period: number = null                    // milliseconds
    periodRaw: string = null                 // original string "2h", "1d" etc.
    fields: string[] = []                    // include only these fields (lowercase)
    fieldsRaw: string = null                 // original string for toRawString
    excludeFields: string[] = []             // exclude these fields (lowercase)
    excludeFieldsRaw: string = null          // original string for toRawString
    groupBy: ChangelogGroupBy = null         // grouping mode
    account: IJiraIssueAccountSettings = null
    private _cacheKey: string = null

    static fromString(str: string): ChangelogView {
        const cv = new ChangelogView()
        const lines = str.split('\n').filter(line => line.trim() && !COMMENT_REGEX.test(line))

        for (const line of lines) {
            const [key, ...values] = line.split(':')
            const value = values.join(':').trim()

            if (!value && lines.length === 1) {
                // Basic mode: single line = JQL query
                cv.query = line
            } else {
                // Advanced mode: key-value pairs
                switch (key.trim().toLowerCase()) {
                    case 'query':
                        cv.query = value
                        break
                    case 'limit':
                        const limitVal = parseInt(value)
                        if (isNaN(limitVal) || limitVal <= 0) {
                            throw new Error(`Invalid limit: ${value}`)
                        }
                        cv.limit = limitVal
                        break
                    case 'period':
                        const periodMs = parsePeriod(value)
                        if (periodMs === null) {
                            throw new Error(`Invalid period: ${value}. Use format: 30m, 2h, 1d, 1w`)
                        }
                        cv.period = periodMs
                        cv.periodRaw = value
                        break
                    case 'account':
                        cv.account = getAccountByAlias(value)
                        break
                    case 'fields':
                        cv.fields = value.split(',').map(f => f.trim().toLowerCase()).filter(f => f)
                        cv.fieldsRaw = value
                        break
                    case 'excludefields':
                        cv.excludeFields = value.split(',').map(f => f.trim().toLowerCase()).filter(f => f)
                        cv.excludeFieldsRaw = value
                        break
                    case 'groupby':
                        const validGroupBy = ['issue', 'author', 'author+issue']
                        const groupByValue = value.toLowerCase()
                        if (!validGroupBy.includes(groupByValue)) {
                            throw new Error(`Invalid groupBy: ${value}. Use: ${validGroupBy.join(', ')}`)
                        }
                        cv.groupBy = groupByValue as ChangelogGroupBy
                        break
                    default:
                        throw new Error(`Invalid key: ${key.trim()}`)
                }
            }
        }

        // Validation
        if (!cv.query) {
            throw new Error('Query is required for jira-changelog')
        }

        if (cv.fields.length > 0 && cv.excludeFields.length > 0) {
            throw new Error('Cannot use both fields and excludeFields')
        }

        return cv
    }

    getCacheKey(): string {
        if (!this._cacheKey) {
            this._cacheKey = `changelog:${this.query}:${this.limit}:${this.periodRaw || ''}:${this.fieldsRaw || ''}:${this.excludeFieldsRaw || ''}:${this.groupBy || ''}:${this.account?.alias || ''}`
        }
        return this._cacheKey
    }

    toRawString(): string {
        let result = `query: ${this.query}\n`
        if (this.limit !== 20) {
            result += `limit: ${this.limit}\n`
        }
        if (this.periodRaw) {
            result += `period: ${this.periodRaw}\n`
        }
        if (this.fieldsRaw) {
            result += `fields: ${this.fieldsRaw}\n`
        }
        if (this.excludeFieldsRaw) {
            result += `excludeFields: ${this.excludeFieldsRaw}\n`
        }
        if (this.groupBy) {
            result += `groupBy: ${this.groupBy}\n`
        }
        if (this.account) {
            result += `account: ${this.account.alias}\n`
        }
        return result
    }
}
