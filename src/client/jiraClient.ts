import { Platform, requestUrl, RequestUrlParam, RequestUrlResponse } from 'obsidian'
import { AVATAR_RESOLUTION, EAuthenticationTypes, IJiraIssueAccountSettings } from '../interfaces/settingsInterfaces'
import { ESprintState, IJiraAutocompleteField, IJiraBoard, IJiraDevStatus, IJiraField, IJiraIssue, IJiraPriority, IJiraSearchResults, IJiraSprint, IJiraStatus, IJiraUser } from '../interfaces/issueInterfaces'
import { SettingsData } from "../settings"
import { RequestQueue } from "./requestQueue"
import { exponentialBackoff, parseRetryAfter, sleep } from "../utils"

interface RequestOptions {
    method: string
    path: string
    path2025?: string
    queryParameters?: URLSearchParams
    queryParameters2025?: URLSearchParams
    account?: IJiraIssueAccountSettings
    noBasePath?: boolean
    body?: Record<string, unknown>
}

const MAX_RETRIES = 5
const requestQueues = new Map<string, RequestQueue>()

function getMimeType(imageBuffer: ArrayBuffer): string {
    const imageBufferUint8 = new Uint8Array(imageBuffer.slice(0, 4))
    const bytes: string[] = []
    imageBufferUint8.forEach((byte) => {
        bytes.push(byte.toString(16))
    })
    const hex = bytes.join('').toUpperCase()
    switch (hex) {
        case '89504E47':
            return 'image/png'
        case '47494638':
            return 'image/gif'
        case 'FFD8FFDB':
        case 'FFD8FFE0':
        case 'FFD8FFE1':
            return 'image/jpeg'
        case '3C737667':
        case '3C3F786D':
            return 'image/svg+xml'
        default:
            SettingsData.logImagesFetch && console.error('Image mimeType not found:', hex)
            return null
    }
}

function bufferBase64Encode(b: ArrayBuffer) {
    const a = new Uint8Array(b)
    if (Platform.isMobileApp) {
        return btoa(String.fromCharCode(...a))
    } else {
        return Buffer.from(a).toString('base64')
    }
}

function base64Encode(s: string) {
    if (Platform.isMobileApp) {
        return btoa(s)
    } else {
        return Buffer.from(s).toString('base64')
    }
}

function buildUrl(host: string, requestOptions: RequestOptions, use2025Api: boolean): string {
    const basePath = requestOptions.noBasePath ? '' : SettingsData.apiBasePath
    // Normalize URL parts to prevent double slashes
    const normalizedHost = host.endsWith('/') ? host.slice(0, -1) : host
    const normalizedBasePath = basePath ? (basePath.startsWith('/') ? basePath : '/' + basePath) : ''
    const path = (use2025Api && requestOptions.path2025) ? requestOptions.path2025 : requestOptions.path
    const normalizedPath = path.startsWith('/') ? path : '/' + path

    const url = new URL(`${normalizedHost}${normalizedBasePath}${normalizedPath}`)
    const queryParameters = use2025Api ? requestOptions.queryParameters2025 : requestOptions.queryParameters
    if (queryParameters) {
        url.search = queryParameters.toString()
    }
    return url.toString()
}

function buildHeaders(account: IJiraIssueAccountSettings): Record<string, string> {
    const requestHeaders: Record<string, string> = {
        'User-Agent': 'obsidian-jira-issue-plugin',
        'X-Atlassian-Token': 'no-check',
        'Accept': 'application/json',
    }
    if (account.authenticationType === EAuthenticationTypes.BASIC || account.authenticationType === EAuthenticationTypes.CLOUD) {
        requestHeaders['Authorization'] = 'Basic ' + base64Encode(`${account.username}:${account.password}`)
    } else if (account.authenticationType === EAuthenticationTypes.BEARER_TOKEN) {
        requestHeaders['Authorization'] = `Bearer ${account.bareToken}`
    }
    return requestHeaders
}

function isJsonResponse(response: RequestUrlResponse): boolean {
    return response.headers && response.headers['content-type'] && response.headers['content-type'].includes('json') && response.json !== undefined
}

function isTextResponse(response: RequestUrlResponse): boolean {
    return response.headers && response.headers['content-type'] && response.headers['content-type'].includes('text') && response.text !== undefined
}

async function sendRequestWithRetry(
    account: IJiraIssueAccountSettings,
    requestUrlParam: RequestUrlParam,
    attempt: number = 0
): Promise<RequestUrlResponse> {
    let response: RequestUrlResponse
    let errorThrown = false

    try {
        response = await requestUrl(requestUrlParam)
        SettingsData.logRequestsResponses && console.info('JiraIssue:Fetch:', { request: requestUrlParam, response })
    } catch (errorResponse: any) {
        SettingsData.logRequestsResponses && console.warn('JiraIssue:Fetch:', { request: requestUrlParam, response: errorResponse })
        response = errorResponse
        errorThrown = true

        // Debug logging to understand the error structure
        if (SettingsData.logRequestsResponses) {
            console.warn('JiraIssue:Error details:', {
                status: response?.status,
                statusType: typeof response?.status,
                headers: response?.headers,
                allKeys: Object.keys(response || {}),
            })
        }
    }

    // Handle 429 Too Many Requests with retry
    // Status can be a number or string, so convert to number for comparison
    const statusCode = parseInt(response?.status?.toString() || '0')
    if (statusCode === 429) {
        if (attempt < MAX_RETRIES) {
            const retryAfter = response.headers?.['retry-after']
            const waitTime = retryAfter
                ? parseRetryAfter(retryAfter)
                : exponentialBackoff(attempt)

            console.warn(`JiraIssue: Rate limited (429), retrying after ${waitTime}ms (attempt ${attempt + 1}/${MAX_RETRIES})`)
            await sleep(waitTime)
            return sendRequestWithRetry(account, requestUrlParam, attempt + 1)
        } else {
            console.error(`JiraIssue: Max retries (${MAX_RETRIES}) exceeded for 429 error`)
        }
    }

    // If we got an error response but didn't retry (or retries exhausted), rethrow it
    if (errorThrown) {
        throw response
    }

    return response
}

async function sendRequest(requestOptions: RequestOptions): Promise<any> {
    let response: RequestUrlResponse
    if (requestOptions.account) {
        response = await sendRequestWithAccount(requestOptions.account, requestOptions)

        if (response.status === 204) {
            // Success with no content (e.g., PUT/DELETE operations)
            return { account: requestOptions.account }
        }
        if (response.status === 200 && isJsonResponse(response)) {
            return { ...response.json, account: requestOptions.account }
        }
    } else {
        for (let i = 0; i < SettingsData.accounts.length; i++) {
            const account = SettingsData.accounts[i]
            response = await sendRequestWithAccount(account, requestOptions)

            if (response.status === 204) {
                // Success with no content (e.g., PUT/DELETE operations)
                return { account: account }
            }
            if (response.status === 200 && isJsonResponse(response)) {
                return { ...response.json, account: account }
            } else if (Math.floor(response.status / 100) !== 4) {
                break
            }
        }
    }

    if (response && response.headers && isJsonResponse(response) && response.json.errorMessages) {
        throw new Error(response.json.errorMessages.join('\n'))
    } else if (response && response.status) {
        let errorMsg
        switch (response.status) {
            case 400:
                throw new Error(`Bad Request: The query is not valid`)
            case 401:
                throw new Error(`Unauthorized: Please check your authentication credentials`)
            case 403:
                throw new Error(`Forbidden: You don't have permission to access this resource. Check your API token permissions and Jira project access.`)
            case 404:
                throw new Error(`Not Found: Issue does not exist`)
            case 410:
                throw new Error(`Missing API: Activate the 2025 search api in the Jira Issue account settings`)
            case 429:
                throw new Error(`Too Many Requests: Rate limit exceeded (should have been retried)`)
            default:
                if (isJsonResponse(response) && response.json.message) {
                    errorMsg = response.json.message
                } else if (isTextResponse(response) && response.text.contains('<title>Log in')) {
                    errorMsg = 'Login required'
                } else {
                    errorMsg = `HTTP ${response.status}`
                }
                throw new Error(`Jira API ${response.status} Error: ${errorMsg}`)
        }
    } else {
        throw new Error(response as any)
    }
}

async function sendRequestWithAccount(account: IJiraIssueAccountSettings, requestOptions: RequestOptions): Promise<RequestUrlResponse> {
    // Get or create request queue for this account
    let queue = requestQueues.get(account.alias)
    if (!queue && account.rateLimit?.enabled) {
        queue = new RequestQueue({
            delayMs: account.rateLimit.delayMs,
            concurrent: account.rateLimit.concurrent
        })
        requestQueues.set(account.alias, queue)
    }

    const requestUrlParam: RequestUrlParam = {
        method: requestOptions.method,
        url: buildUrl(account.host, requestOptions, account.use2025Api),
        headers: buildHeaders(account),
        contentType: 'application/json',
        body: requestOptions.body ? JSON.stringify(requestOptions.body) : undefined,
    }

    // If rate limiting is disabled, execute directly
    if (!queue || !account.rateLimit?.enabled) {
        return sendRequestWithRetry(account, requestUrlParam)
    }

    // Add to queue - will execute when its turn comes
    return queue.add(() => sendRequestWithRetry(account, requestUrlParam))
}

async function preFetchImageWithRetry(
    account: IJiraIssueAccountSettings,
    options: RequestUrlParam,
    attempt: number = 0
): Promise<RequestUrlResponse> {
    let response: RequestUrlResponse
    let errorThrown = false

    try {
        response = await requestUrl(options)
        SettingsData.logImagesFetch && console.info('JiraIssue:FetchImage:', { request: options, response })
    } catch (errorResponse: any) {
        SettingsData.logImagesFetch && console.warn('JiraIssue:FetchImage:', { request: options, response: errorResponse })
        response = errorResponse
        errorThrown = true
    }

    // Handle 429 Too Many Requests with retry
    const statusCode = parseInt(response?.status?.toString() || '0')
    if (statusCode === 429 && attempt < MAX_RETRIES) {
        const retryAfter = response.headers?.['retry-after']
        const waitTime = retryAfter
            ? parseRetryAfter(retryAfter)
            : exponentialBackoff(attempt)

        console.warn(`JiraIssue: Image fetch rate limited (429), retrying after ${waitTime}ms (attempt ${attempt + 1}/${MAX_RETRIES})`)
        await sleep(waitTime)
        return preFetchImageWithRetry(account, options, attempt + 1)
    }

    // If we got an error response but didn't retry (or retries exhausted), rethrow it
    if (errorThrown && statusCode !== 200) {
        throw response
    }

    return response
}

async function preFetchImage(account: IJiraIssueAccountSettings, url: string): Promise<string> {
    // Pre fetch only images hosted on the Jira server
    if (!url.startsWith(account.host)) {
        return url
    }

    // Get or create request queue for this account
    let queue = requestQueues.get(account.alias)
    if (!queue && account.rateLimit?.enabled) {
        queue = new RequestQueue({
            delayMs: account.rateLimit.delayMs,
            concurrent: account.rateLimit.concurrent
        })
        requestQueues.set(account.alias, queue)
    }

    const options: RequestUrlParam = {
        url: url,
        method: 'GET',
        headers: buildHeaders(account),
    }

    const fetchFn = () => preFetchImageWithRetry(account, options)

    // If rate limiting is disabled, execute directly
    if (!queue || !account.rateLimit?.enabled) {
        const response = await fetchFn()
        if (response.status === 200) {
            const mimeType = getMimeType(response.arrayBuffer)
            if (mimeType) {
                return `data:${mimeType};base64,` + bufferBase64Encode(response.arrayBuffer)
            }
        }
        return null
    }

    // Add to queue
    const response = await queue.add(fetchFn)
    if (response.status === 200) {
        const mimeType = getMimeType(response.arrayBuffer)
        if (mimeType) {
            return `data:${mimeType};base64,` + bufferBase64Encode(response.arrayBuffer)
        }
    }
    return null
}

async function fetchIssueImages(issue: IJiraIssue) {
    if (issue.fields) {
        if (issue.fields.issuetype && issue.fields.issuetype.iconUrl) {
            issue.fields.issuetype.iconUrl = await preFetchImage(issue.account, issue.fields.issuetype.iconUrl)
        }
        if (issue.fields.reporter) {
            issue.fields.reporter.avatarUrls[AVATAR_RESOLUTION] = await preFetchImage(issue.account, issue.fields.reporter.avatarUrls[AVATAR_RESOLUTION])
        }
        if (issue.fields.assignee && issue.fields.assignee.avatarUrls && issue.fields.assignee.avatarUrls[AVATAR_RESOLUTION]) {
            issue.fields.assignee.avatarUrls[AVATAR_RESOLUTION] = await preFetchImage(issue.account, issue.fields.assignee.avatarUrls[AVATAR_RESOLUTION])
        }
        if (issue.fields.priority && issue.fields.priority.iconUrl) {
            issue.fields.priority.iconUrl = await preFetchImage(issue.account, issue.fields.priority.iconUrl)
        }
    }
}

export default {

    async getIssue(issueKey: string, options: { fields?: string[], account?: IJiraIssueAccountSettings } = {}): Promise<IJiraIssue> {
        const opt = {
            fields: options.fields || [],
            account: options.account || null,
        }
        const queryParameters = new URLSearchParams({
            fields: opt.fields.join(','),
        })
        const issue = await sendRequest(
            {
                method: 'GET',
                path: `/issue/${issueKey}`,
                account: opt.account,
                queryParameters: queryParameters,
            }
        ) as IJiraIssue
        await fetchIssueImages(issue)
        return issue
    },

    async getSearchResults(query: string, options: { limit?: number, offset?: number, fields?: string[], expand?: string[], account?: IJiraIssueAccountSettings } = {}): Promise<IJiraSearchResults> {
        const opt = {
            fields: options.fields || ['*all'],
            expand: options.expand || [],
            offset: options.offset || 0,
            limit: options.limit || 50,
            account: options.account || null,
        }
        const queryParameters = new URLSearchParams({
            jql: query,
            fields: opt.fields.join(','),
            expand: opt.expand.length > 0 ? opt.expand.join(',') : '',
            startAt: opt.offset > 0 ? opt.offset.toString() : '',
            maxResults: opt.limit > 0 ? opt.limit.toString() : '',
        })
        const queryParameters2025 = new URLSearchParams({
            jql: query,
            fields: opt.fields.join(','),
            expand: opt.expand.length > 0 ? opt.expand.join(',') : '',
            nextPageToken: opt.offset > 0 ? opt.offset.toString() : '',
            maxResults: opt.limit > 0 ? opt.limit.toString() : '',
        })
        const searchResults = await sendRequest(
            {
                method: 'GET',
                path: '/search',
                path2025: '/search/jql',
                queryParameters: queryParameters,
                queryParameters2025: queryParameters2025,
                account: opt.account,
            }
        ) as IJiraSearchResults
        for (const issue of searchResults.issues) {
            issue.account = searchResults.account
            await fetchIssueImages(issue)
        }
        return searchResults
    },

    async updateStatusColorCache(status: string, account: IJiraIssueAccountSettings): Promise<void> {
        if (status in account.cache.statusColor) {
            return
        }
        const response = await sendRequest(
            {
                method: 'GET',
                path: `/status/${status}`,
            }
        ) as IJiraStatus
        account.cache.statusColor[status] = response.statusCategory.colorName
    },

    async updateCustomFieldsCache(): Promise<void> {
        SettingsData.cache.columns = []
        for (const account of SettingsData.accounts) {
            try {
                const response = await sendRequest(
                    {
                        method: 'GET',
                        path: `/field`,
                        account: account,
                    }
                ) as IJiraField[]
                account.cache.customFieldsIdToName = {}
                account.cache.customFieldsNameToId = {}
                account.cache.customFieldsType = {}
                for (const i in response) {
                    const field = response[i]
                    if (field.custom && field.schema && field.schema.customId) {
                        account.cache.customFieldsIdToName[field.schema.customId] = field.name
                        account.cache.customFieldsNameToId[field.name] = field.schema.customId.toString()
                        account.cache.customFieldsType[field.schema.customId] = field.schema
                        SettingsData.cache.columns.push(field.schema.customId.toString(), field.name.toUpperCase())
                    }
                }
            } catch (e) {
                console.error('Error while retrieving custom fields list of account:', account.alias, e)
            }
        }
    },

    // async updateJQLAutoCompleteCache(): Promise<void> {
    // const response = await sendRequest(
    //     {
    //         method: 'GET',
    //         path: `/jql/autocompletedata`,
    //     }
    // ) as IJiraAutocompleteData
    // settingData.cache.jqlAutocomplete = { fields: [], functions: {} }
    // for (const functionData of response.visibleFunctionNames) {
    //     for (const functionType of functionData.types) {
    //         if (functionType in settingData.cache.jqlAutocomplete.functions) {
    //             settingData.cache.jqlAutocomplete.functions[functionType].push(functionData.value)
    //         } else {
    //             settingData.cache.jqlAutocomplete.functions[functionType] = [functionData.value]
    //         }
    //     }
    // }
    // settingData.cache.jqlAutocomplete.fields = response.visibleFieldNames
    // },

    async getJQLAutoCompleteField(fieldName: string, fieldValue: string): Promise<IJiraAutocompleteField> {
        const queryParameters = new URLSearchParams({
            fieldName: fieldName,
            fieldValue: fieldValue,
        })
        return await sendRequest(
            {
                method: 'GET',
                path: `/jql/autocompletedata/suggestions`,
                queryParameters: queryParameters,
            }
        ) as IJiraAutocompleteField
    },

    async testConnection(account: IJiraIssueAccountSettings): Promise<boolean> {
        await sendRequest(
            {
                method: 'GET',
                path: `/project`,
                account: account,
            }
        )
        return true
    },

    async getLoggedUser(account: IJiraIssueAccountSettings = null): Promise<IJiraUser> {
        return await sendRequest(
            {
                method: 'GET',
                path: `/myself`,
                account: account,
            }
        ) as IJiraUser
    },

    async getDevStatus(issueId: string, options: { account?: IJiraIssueAccountSettings } = {}): Promise<IJiraDevStatus> {
        const opt = {
            account: options.account || null,
        }
        const queryParameters = new URLSearchParams({
            issueId: issueId,
        })
        return await sendRequest(
            {
                method: 'GET',
                path: `/rest/dev-status/latest/issue/summary`,
                queryParameters: queryParameters,
                noBasePath: true,
                account: opt.account,
            }
        ) as IJiraDevStatus
    },

    async getBoards(projectKeyOrId: string, options: { limit?: number, offset?: number, account?: IJiraIssueAccountSettings } = {}): Promise<IJiraBoard[]> {
        const opt = {
            offset: options.offset || 0,
            limit: options.limit || 50,
            account: options.account || null,
        }
        const queryParameters = new URLSearchParams({
            projectKeyOrId: projectKeyOrId,
            startAt: opt.offset > 0 ? opt.offset.toString() : '',
            maxResults: opt.limit > 0 ? opt.limit.toString() : '',
        })
        const boards = await sendRequest(
            {
                method: 'GET',
                path: `/rest/agile/1.0/board`,
                queryParameters: queryParameters,
                noBasePath: true,
                account: opt.account,
            }
        )
        if (boards.values && boards.values.length) {
            return boards.values
        }
        return []
    },

    async getSprints(boardId: number, options: { limit?: number, offset?: number, state?: ESprintState[], account?: IJiraIssueAccountSettings } = {}): Promise<IJiraSprint[]> {
        const opt = {
            state: options.state || [],
            offset: options.offset || 0,
            limit: options.limit || 50,
            account: options.account || null,
        }
        const queryParameters = new URLSearchParams({
            state: opt.state.join(','),
            startAt: opt.offset > 0 ? opt.offset.toString() : '',
            maxResults: opt.limit > 0 ? opt.limit.toString() : '',
        })
        const sprints = await sendRequest(
            {
                method: 'GET',
                path: `/rest/agile/1.0/board/${boardId}/sprint`,
                queryParameters: queryParameters,
                noBasePath: true,
                account: opt.account,
            }
        )
        if (sprints.values && sprints.values.length) {
            return sprints.values
        }
        return []
    },

    async getSprint(sprintId: number, options: { account?: IJiraIssueAccountSettings } = {}): Promise<IJiraSprint> {
        const opt = {
            account: options.account || null
        }
        return await sendRequest(
            {
                method: 'GET',
                path: `/rest/agile/1.0/sprint/${sprintId}`,
                noBasePath: true,
                account: opt.account,
            }
        )
    },

    async updateIssueLabels(issueKey: string, labels: string[], options: { account?: IJiraIssueAccountSettings } = {}): Promise<void> {
        await sendRequest(
            {
                method: 'PUT',
                path: `/issue/${issueKey}`,
                account: options.account || null,
                body: {
                    fields: {
                        labels: labels
                    }
                }
            }
        )
    },

    async getIssuePriorities(issueKey: string, options: { account?: IJiraIssueAccountSettings } = {}): Promise<IJiraPriority[]> {
        const response = await sendRequest(
            {
                method: 'GET',
                path: `/issue/${issueKey}/editmeta`,
                account: options.account || null,
            }
        )
        console.log('editmeta response:', response)
        // Extract allowed priorities from editmeta response
        const priorityField = response.fields?.priority
        if (priorityField?.allowedValues) {
            return priorityField.allowedValues as IJiraPriority[]
        }
        return []
    },

    async updateIssuePriority(issueKey: string, priorityId: string, options: { account?: IJiraIssueAccountSettings } = {}): Promise<void> {
        await sendRequest(
            {
                method: 'PUT',
                path: `/issue/${issueKey}`,
                account: options.account || null,
                body: {
                    fields: {
                        priority: { id: priorityId }
                    }
                }
            }
        )
    },

    async searchAssignableUsers(issueKey: string, query: string, options: { account?: IJiraIssueAccountSettings } = {}): Promise<IJiraUser[]> {
        const queryParameters = new URLSearchParams({
            issueKey: issueKey,
            username: query,
            maxResults: '20',
        })
        const response = await sendRequest(
            {
                method: 'GET',
                path: `/user/assignable/search`,
                queryParameters: queryParameters,
                account: options.account || null,
            }
        )
        // Response can be an array or an object with numeric keys (Jira Server quirk)
        if (Array.isArray(response)) {
            return response as IJiraUser[]
        }
        // Handle object with numeric keys like {"0": {...}, "1": {...}}
        if (typeof response === 'object' && response !== null) {
            const users: IJiraUser[] = []
            for (const key of Object.keys(response)) {
                if (/^\d+$/.test(key)) {
                    users.push(response[key] as IJiraUser)
                }
            }
            if (users.length > 0) {
                return users
            }
        }
        return []
    },

    async updateIssueAssignee(issueKey: string, userNameOrAccountId: string | null, options: { account?: IJiraIssueAccountSettings } = {}): Promise<void> {
        // Jira Server uses "name", Jira Cloud uses "accountId"
        // Try to detect which one to use based on the value format
        let assigneeField: Record<string, string> | null = null
        if (userNameOrAccountId) {
            // accountId is typically a long alphanumeric string, name is usually email-like
            if (userNameOrAccountId.includes('@') || !userNameOrAccountId.match(/^[0-9a-f]{24}$/)) {
                assigneeField = { name: userNameOrAccountId }
            } else {
                assigneeField = { accountId: userNameOrAccountId }
            }
        }
        const body = {
            fields: {
                assignee: assigneeField
            }
        }
        console.log('JiraIssue: updateIssueAssignee request:', issueKey, JSON.stringify(body, null, 2))
        await sendRequest(
            {
                method: 'PUT',
                path: `/issue/${issueKey}`,
                account: options.account || null,
                body: body
            }
        )
    },

    async searchUsers(query: string, options: { account?: IJiraIssueAccountSettings } = {}): Promise<IJiraUser[]> {
        // Use /user/picker endpoint which is more universally available
        const queryParameters = new URLSearchParams({
            query: query,
            maxResults: '20',
            showAvatar: 'true',
        })
        const response = await sendRequest(
            {
                method: 'GET',
                path: `/user/picker`,
                queryParameters: queryParameters,
                account: options.account || null,
            }
        )
        // /user/picker returns { users: [...] } structure
        let users: IJiraUser[] = []
        if (response.users && Array.isArray(response.users)) {
            users = response.users as IJiraUser[]
        } else if (Array.isArray(response)) {
            users = response as IJiraUser[]
        }
        return users
    },

    async getUser(usernameOrKey: string, options: { account?: IJiraIssueAccountSettings } = {}): Promise<IJiraUser> {
        const queryParameters = new URLSearchParams({
            username: usernameOrKey,
        })
        const response = await sendRequest(
            {
                method: 'GET',
                path: `/user`,
                queryParameters: queryParameters,
                account: options.account || null,
            }
        )
        return response as IJiraUser
    },

    async updateIssuePeopleFields(
        issueKey: string,
        fieldUpdates: Record<string, string | null>,
        options: { account?: IJiraIssueAccountSettings } = {}
    ): Promise<void> {
        const fields: Record<string, Record<string, string> | null> = {}

        for (const [fieldId, userNameOrAccountId] of Object.entries(fieldUpdates)) {
            if (userNameOrAccountId === null) {
                fields[fieldId] = null
            } else {
                // Jira Server uses "name", Jira Cloud uses "accountId"
                // Same detection logic as updateIssueAssignee
                if (userNameOrAccountId.includes('@') || !userNameOrAccountId.match(/^[0-9a-f]{24}$/)) {
                    fields[fieldId] = { name: userNameOrAccountId }
                } else {
                    fields[fieldId] = { accountId: userNameOrAccountId }
                }
            }
        }

        const body = { fields }
        console.log('JiraIssue: updateIssuePeopleFields request:', issueKey, JSON.stringify(body, null, 2))
        await sendRequest({
            method: 'PUT',
            path: `/issue/${issueKey}`,
            account: options.account || null,
            body: body
        })
    },
}
