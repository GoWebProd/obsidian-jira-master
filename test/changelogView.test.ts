jest.mock('../src/settings', () => {
    return { SettingsData: { cache: { columns: [] } } }
})
jest.mock('../src/utils', () => { return { getAccountByAlias: jest.fn() } })

import { ChangelogView, parsePeriod } from '../src/changelogView'
import { TestAccountOpen } from './testData'
import * as Utils from '../src/utils'

const kQuery = `project = TEST AND updated >= -1d`
const kLimit = 50
const kPeriod = '24h'
const kComment = '# This is a comment'

;(Utils.getAccountByAlias as jest.Mock).mockReturnValue(TestAccountOpen)

describe('parsePeriod', () => {
    describe('Positive tests', () => {
        test('parses minutes', () => {
            expect(parsePeriod('30m')).toBe(30 * 60 * 1000)
            expect(parsePeriod('5m')).toBe(5 * 60 * 1000)
            expect(parsePeriod('1m')).toBe(60 * 1000)
        })

        test('parses hours', () => {
            expect(parsePeriod('2h')).toBe(2 * 60 * 60 * 1000)
            expect(parsePeriod('24h')).toBe(24 * 60 * 60 * 1000)
            expect(parsePeriod('1h')).toBe(60 * 60 * 1000)
        })

        test('parses days', () => {
            expect(parsePeriod('1d')).toBe(24 * 60 * 60 * 1000)
            expect(parsePeriod('7d')).toBe(7 * 24 * 60 * 60 * 1000)
            expect(parsePeriod('30d')).toBe(30 * 24 * 60 * 60 * 1000)
        })

        test('parses weeks', () => {
            expect(parsePeriod('1w')).toBe(7 * 24 * 60 * 60 * 1000)
            expect(parsePeriod('2w')).toBe(14 * 24 * 60 * 60 * 1000)
        })

        test('handles case insensitivity', () => {
            expect(parsePeriod('2H')).toBe(2 * 60 * 60 * 1000)
            expect(parsePeriod('1D')).toBe(24 * 60 * 60 * 1000)
            expect(parsePeriod('1W')).toBe(7 * 24 * 60 * 60 * 1000)
            expect(parsePeriod('30M')).toBe(30 * 60 * 1000)
        })

        test('handles whitespace', () => {
            expect(parsePeriod('  2h  ')).toBe(2 * 60 * 60 * 1000)
            expect(parsePeriod(' 1d')).toBe(24 * 60 * 60 * 1000)
        })
    })

    describe('Negative tests', () => {
        test('returns null for empty string', () => {
            expect(parsePeriod('')).toBeNull()
        })

        test('returns null for invalid format', () => {
            expect(parsePeriod('abc')).toBeNull()
            expect(parsePeriod('2x')).toBeNull()
            expect(parsePeriod('2')).toBeNull()
            expect(parsePeriod('h')).toBeNull()
        })

        test('returns null for unsupported units', () => {
            expect(parsePeriod('2s')).toBeNull()  // seconds
            expect(parsePeriod('2y')).toBeNull()  // years
        })
    })
})

describe('ChangelogView', () => {
    describe('fromString', () => {
        describe('Positive tests', () => {
            test('basic mode - single line query', () => {
                const cv = ChangelogView.fromString(kQuery)
                expect(cv.query).toEqual(kQuery)
                expect(cv.limit).toEqual(20)  // default
                expect(cv.period).toBeNull()
                expect(cv.periodRaw).toBeNull()
                expect(cv.account).toBeNull()
            })

            test('advanced mode - all parameters', () => {
                const cv = ChangelogView.fromString(`
${kComment}
query: ${kQuery}
limit: ${kLimit}
period: ${kPeriod}
account: ${TestAccountOpen.alias}
`)
                expect(cv.query).toEqual(kQuery)
                expect(cv.limit).toEqual(kLimit)
                expect(cv.period).toEqual(24 * 60 * 60 * 1000)
                expect(cv.periodRaw).toEqual(kPeriod)
                expect(cv.account).toEqual(TestAccountOpen)
            })

            test('advanced mode - query only', () => {
                const cv = ChangelogView.fromString(`query: ${kQuery}`)
                expect(cv.query).toEqual(kQuery)
                expect(cv.limit).toEqual(20)
                expect(cv.period).toBeNull()
            })

            test('advanced mode - with limit only', () => {
                const cv = ChangelogView.fromString(`
query: ${kQuery}
limit: 100
`)
                expect(cv.query).toEqual(kQuery)
                expect(cv.limit).toEqual(100)
            })

            test('advanced mode - with period only', () => {
                const cv = ChangelogView.fromString(`
query: ${kQuery}
period: 2h
`)
                expect(cv.query).toEqual(kQuery)
                expect(cv.period).toEqual(2 * 60 * 60 * 1000)
                expect(cv.periodRaw).toEqual('2h')
            })

            test('handles comments', () => {
                const cv = ChangelogView.fromString(`
# Comment line 1
query: ${kQuery}
# Comment line 2
limit: ${kLimit}
`)
                expect(cv.query).toEqual(kQuery)
                expect(cv.limit).toEqual(kLimit)
            })

            test('parses fields filter', () => {
                const cv = ChangelogView.fromString(`
query: ${kQuery}
fields: Status, Assignee, Priority
`)
                expect(cv.fields).toEqual(['status', 'assignee', 'priority'])
                expect(cv.fieldsRaw).toEqual('Status, Assignee, Priority')
                expect(cv.excludeFields).toEqual([])
            })

            test('parses excludeFields filter', () => {
                const cv = ChangelogView.fromString(`
query: ${kQuery}
excludeFields: description, Attachment
`)
                expect(cv.excludeFields).toEqual(['description', 'attachment'])
                expect(cv.excludeFieldsRaw).toEqual('description, Attachment')
                expect(cv.fields).toEqual([])
            })

            test('handles empty fields gracefully', () => {
                const cv = ChangelogView.fromString(`
query: ${kQuery}
fields:
`)
                expect(cv.fields).toEqual([])
            })

            test('parses groupBy: issue', () => {
                const cv = ChangelogView.fromString(`
query: ${kQuery}
groupBy: issue
`)
                expect(cv.groupBy).toEqual('issue')
            })

            test('parses groupBy: author', () => {
                const cv = ChangelogView.fromString(`
query: ${kQuery}
groupBy: author
`)
                expect(cv.groupBy).toEqual('author')
            })

            test('parses groupBy: author+issue', () => {
                const cv = ChangelogView.fromString(`
query: ${kQuery}
groupBy: author+issue
`)
                expect(cv.groupBy).toEqual('author+issue')
            })

            test('handles case insensitivity for groupBy', () => {
                const cv = ChangelogView.fromString(`
query: ${kQuery}
groupBy: AUTHOR+ISSUE
`)
                expect(cv.groupBy).toEqual('author+issue')
            })

            test('groupBy defaults to null', () => {
                const cv = ChangelogView.fromString(kQuery)
                expect(cv.groupBy).toBeNull()
            })
        })

        describe('Negative tests', () => {
            test('throws on missing query', () => {
                expect(() => ChangelogView.fromString('limit: 10')).toThrow('Query is required for jira-changelog')
            })

            test('throws on empty input', () => {
                expect(() => ChangelogView.fromString('')).toThrow('Query is required for jira-changelog')
            })

            test('throws on invalid limit - non-numeric', () => {
                expect(() => ChangelogView.fromString(`
query: ${kQuery}
limit: abc
`)).toThrow('Invalid limit: abc')
            })

            test('throws on invalid limit - zero', () => {
                expect(() => ChangelogView.fromString(`
query: ${kQuery}
limit: 0
`)).toThrow('Invalid limit: 0')
            })

            test('throws on invalid limit - negative', () => {
                expect(() => ChangelogView.fromString(`
query: ${kQuery}
limit: -5
`)).toThrow('Invalid limit: -5')
            })

            test('throws on invalid period', () => {
                expect(() => ChangelogView.fromString(`
query: ${kQuery}
period: 2x
`)).toThrow('Invalid period: 2x. Use format: 30m, 2h, 1d, 1w')
            })

            test('throws on invalid key', () => {
                expect(() => ChangelogView.fromString(`
query: ${kQuery}
unknownKey: value
`)).toThrow('Invalid key: unknownKey')
            })

            test('throws when both fields and excludeFields are used', () => {
                expect(() => ChangelogView.fromString(`
query: ${kQuery}
fields: Status
excludeFields: description
`)).toThrow('Cannot use both fields and excludeFields')
            })

            test('throws on invalid groupBy', () => {
                expect(() => ChangelogView.fromString(`
query: ${kQuery}
groupBy: invalid
`)).toThrow('Invalid groupBy: invalid. Use: issue, author, author+issue')
            })
        })
    })

    describe('getCacheKey', () => {
        test('generates unique key with all parameters', () => {
            const cv = ChangelogView.fromString(`
query: ${kQuery}
limit: ${kLimit}
period: 2h
account: ${TestAccountOpen.alias}
`)
            expect(cv.getCacheKey()).toEqual(`changelog:${kQuery}:${kLimit}:2h::::${TestAccountOpen.alias}`)
        })

        test('generates key without optional parameters', () => {
            const cv = ChangelogView.fromString(kQuery)
            expect(cv.getCacheKey()).toEqual(`changelog:${kQuery}:20:::::`)
        })

        test('generates key with fields filter', () => {
            const cv = ChangelogView.fromString(`
query: ${kQuery}
fields: Status, Priority
`)
            expect(cv.getCacheKey()).toContain(':Status, Priority:')
        })

        test('generates key with groupBy', () => {
            const cv = ChangelogView.fromString(`
query: ${kQuery}
groupBy: author
`)
            expect(cv.getCacheKey()).toContain(':author:')
        })

        test('cache key is memoized', () => {
            const cv = ChangelogView.fromString(kQuery)
            const key1 = cv.getCacheKey()
            const key2 = cv.getCacheKey()
            expect(key1).toBe(key2)
        })
    })

    describe('toRawString', () => {
        test('serializes all parameters', () => {
            const cv = ChangelogView.fromString(`
query: ${kQuery}
limit: ${kLimit}
period: 2h
account: ${TestAccountOpen.alias}
`)
            const raw = cv.toRawString()
            expect(raw).toContain(`query: ${kQuery}`)
            expect(raw).toContain(`limit: ${kLimit}`)
            expect(raw).toContain('period: 2h')
            expect(raw).toContain(`account: ${TestAccountOpen.alias}`)
        })

        test('omits default limit', () => {
            const cv = ChangelogView.fromString(`query: ${kQuery}`)
            const raw = cv.toRawString()
            expect(raw).not.toContain('limit:')
        })

        test('omits null period', () => {
            const cv = ChangelogView.fromString(`query: ${kQuery}`)
            const raw = cv.toRawString()
            expect(raw).not.toContain('period:')
        })

        test('omits null account', () => {
            const cv = ChangelogView.fromString(`query: ${kQuery}`)
            const raw = cv.toRawString()
            expect(raw).not.toContain('account:')
        })

        test('serializes fields filter', () => {
            const cv = ChangelogView.fromString(`
query: ${kQuery}
fields: Status, Priority
`)
            const raw = cv.toRawString()
            expect(raw).toContain('fields: Status, Priority')
        })

        test('serializes excludeFields filter', () => {
            const cv = ChangelogView.fromString(`
query: ${kQuery}
excludeFields: description
`)
            const raw = cv.toRawString()
            expect(raw).toContain('excludeFields: description')
        })

        test('serializes groupBy', () => {
            const cv = ChangelogView.fromString(`
query: ${kQuery}
groupBy: author+issue
`)
            const raw = cv.toRawString()
            expect(raw).toContain('groupBy: author+issue')
        })

        test('omits null groupBy', () => {
            const cv = ChangelogView.fromString(`query: ${kQuery}`)
            const raw = cv.toRawString()
            expect(raw).not.toContain('groupBy:')
        })
    })

    afterEach(() => {
        jest.clearAllMocks()
    })
})

export { }
