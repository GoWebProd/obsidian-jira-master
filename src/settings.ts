import { App, Notice, PluginSettingTab, Setting, TextComponent } from 'obsidian'
import JiraClient from './client/jiraClient'
import { COLOR_SCHEMA_DESCRIPTION, EAuthenticationTypes, EColorSchema, ESearchColumnsTypes, IJiraIssueAccountSettings, IJiraIssueSettings, IRateLimitSettings, SEARCH_COLUMNS_DESCRIPTION } from './interfaces/settingsInterfaces'
import JiraIssuePlugin from './main'
import { getRandomHexColor } from './utils'

const AUTHENTICATION_TYPE_DESCRIPTION = {
    [EAuthenticationTypes.OPEN]: 'Open',
    [EAuthenticationTypes.BASIC]: 'Basic Authentication',
    [EAuthenticationTypes.CLOUD]: 'Jira Cloud',
    [EAuthenticationTypes.BEARER_TOKEN]: 'Bearer Token',
}

export const DEFAULT_SETTINGS: IJiraIssueSettings = {
    accounts: [],
    apiBasePath: '/rest/api/latest',
    cacheTime: '15m',
    searchResultsLimit: 10,
    cache: {
        columns: [],
    },
    colorSchema: EColorSchema.FOLLOW_OBSIDIAN,
    inlineIssueUrlToTag: true,
    inlineIssuePrefix: 'JIRA:',
    showColorBand: true,
    showJiraLink: true,
    searchColumns: [
        { type: ESearchColumnsTypes.KEY, compact: false },
        { type: ESearchColumnsTypes.SUMMARY, compact: false },
        { type: ESearchColumnsTypes.TYPE, compact: true },
        { type: ESearchColumnsTypes.CREATED, compact: false },
        { type: ESearchColumnsTypes.UPDATED, compact: false },
        { type: ESearchColumnsTypes.REPORTER, compact: false },
        { type: ESearchColumnsTypes.ASSIGNEE, compact: false },
        { type: ESearchColumnsTypes.PRIORITY, compact: true },
        { type: ESearchColumnsTypes.STATUS, compact: false },
    ],
    logRequestsResponses: false,
    logImagesFetch: false,
    batchDelayMs: 150,
    debugBatching: false,
}

export const DEFAULT_RATE_LIMIT: IRateLimitSettings = {
    enabled: true,
    delayMs: 100,      // 100ms = 10 requests/second
    concurrent: 1,     // Sequential processing
}

export const DEFAULT_ACCOUNT: IJiraIssueAccountSettings = {
    alias: 'Default',
    host: 'https://mycompany.atlassian.net',
    authenticationType: EAuthenticationTypes.OPEN,
    password: '',
    priority: 1,
    color: '#000000',
    use2025Api: false,
    rateLimit: DEFAULT_RATE_LIMIT,
    cache: {
        statusColor: {},
        customFieldsIdToName: {},
        customFieldsNameToId: {},
        customFieldsType: {},
        jqlAutocomplete: {
            fields: [],
            functions: {},
        },
    },
    predefinedLabels: [],
    predefinedAssignees: [],
    peopleFieldMappings: [],
    lastSelectedPeopleFields: [],
}

function deepCopy(obj: any): any {
    return JSON.parse(JSON.stringify(obj))
}

export class JiraIssueSettingTab extends PluginSettingTab {
    private _plugin: JiraIssuePlugin
    private _onChangeListener: (() => void) | null = null
    private _searchColumnsDetails: HTMLDetailsElement = null
    private _showPassword = false

    constructor(app: App, plugin: JiraIssuePlugin) {
        super(app, plugin)
        this._plugin = plugin
    }

    async loadSettings(): Promise<void> {
        // Read plugin data and fill new fields with default values
        Object.assign(SettingsData, DEFAULT_SETTINGS, await this._plugin.loadData())
        for (const i in SettingsData.accounts) {
            SettingsData.accounts[i] = Object.assign({}, DEFAULT_ACCOUNT, SettingsData.accounts[i])
        }
        SettingsData.cache = deepCopy(DEFAULT_SETTINGS.cache)

        if (SettingsData.accounts.length === 0 || SettingsData.accounts[0] === null) {
            if (SettingsData.host) {
                // Legacy credentials migration
                SettingsData.accounts = [
                    {
                        priority: 1,
                        host: SettingsData.host,
                        authenticationType: SettingsData.authenticationType,
                        username: SettingsData.username,
                        password: SettingsData.password,
                        bareToken: SettingsData.bareToken,
                        alias: DEFAULT_ACCOUNT.alias,
                        color: DEFAULT_ACCOUNT.color,
                        cache: DEFAULT_ACCOUNT.cache,
                        use2025Api: false,
                        rateLimit: DEFAULT_RATE_LIMIT,
                        predefinedLabels: [],
                        predefinedAssignees: [],
                        peopleFieldMappings: [],
                        lastSelectedPeopleFields: [],
                    }
                ]
            } else {
                // First installation
                SettingsData.accounts = [DEFAULT_ACCOUNT]
            }
            this.saveSettings()
        }
        this.accountsConflictsFix()
    }

    async saveSettings() {
        const settingsToStore: IJiraIssueSettings = Object.assign({}, SettingsData, {
            // Global cache settings cleanup
            cache: DEFAULT_SETTINGS.cache, jqlAutocomplete: null, customFieldsIdToName: null, customFieldsNameToId: null, statusColorCache: null
        })
        // Account cache settings cleanup
        settingsToStore.accounts.forEach(account => account.cache = DEFAULT_ACCOUNT.cache)
        // Delete old properties
        delete (settingsToStore as any)['darkMode']
        delete (settingsToStore as any)['host']
        delete (settingsToStore as any)['authenticationType']
        delete (settingsToStore as any)['username']
        delete (settingsToStore as any)['password']
        delete (settingsToStore as any)['customFieldsNames']

        await this._plugin.saveData(settingsToStore)

        if (this._onChangeListener) {
            this._onChangeListener()
        }
    }

    onChange(listener: () => void) {
        this._onChangeListener = listener
    }

    display(): void {
        // Backup the search columns details status before cleaning the page
        const isSearchColumnsDetailsOpen = this._searchColumnsDetails
            && this._searchColumnsDetails.getAttribute('open') !== null

        // Clean the page
        this.containerEl.empty()
        this.displayHeader()
        this.displayAccountsSettings()
        this.displayRenderingSettings()
        this.displaySearchColumnsSettings(isSearchColumnsDetailsOpen)
        this.displayExtraSettings()
        this.displayFooter()
    }

    displayHeader() {
        const { containerEl } = this
        containerEl.createEl('h2', { text: 'Jira Issue' })
        const description = containerEl.createEl('p')
        description.appendText('Need help? Explore the ')
        description.appendChild(createEl('a', {
            text: 'Jira Issue documentation',
            href: 'https://marc0l92.github.io/obsidian-jira-issue/',
        }))
        description.appendText('.')

    }

    displayFooter() {
        const { containerEl } = this
        containerEl.createEl('h3', { text: 'Support development' })
        const description = containerEl.createEl('p')
        description.appendText('If you enjoy JiraIssue, consider giving me your feedback on the ')
        description.appendChild(createEl('a', {
            text: 'github repository',
            href: 'https://github.com/marc0l92/obsidian-jira-issue/issues',
        }))
        description.appendText(', and maybe ')
        description.appendChild(createEl('a', {
            text: 'buying me a coffee',
            href: 'https://ko-fi.com/marc0l92',
        }))
        description.appendText(' ☕.')
        const buyMeACoffee = containerEl.createEl('a', { href: 'https://ko-fi.com/marc0l92' })
        buyMeACoffee.appendChild(createEl('img', {
            attr: {
                src: 'https://ko-fi.com/img/githubbutton_sm.svg',
                height: '30',
            }
        }))
    }

    displayAccountsSettings() {
        const { containerEl } = this
        containerEl.createEl('h3', { text: 'Accounts' })

        for (const account of SettingsData.accounts) {
            const accountSetting = new Setting(containerEl)
                .setName(`${account.priority}: ${account.alias}`)
                .setDesc(account.host)
                .addExtraButton(button => button
                    .setIcon('pencil')
                    .setTooltip('Modify')
                    .onClick(async () => {
                        // Change page
                        this.displayModifyAccountPage(account)
                    }))
                .addExtraButton(button => button
                    .setIcon('trash')
                    .setTooltip('Delete')
                    .setDisabled(SettingsData.accounts.length <= 1)
                    .onClick(async () => {
                        SettingsData.accounts.remove(account)
                        this.accountsConflictsFix()
                        await this.saveSettings()
                        // Force refresh
                        this.display()
                    }))
            accountSetting.infoEl.setAttr('style', 'padding-left:5px;border-left:5px solid ' + account.color)
        }
        new Setting(containerEl)
            .addButton(button => button
                .setButtonText("Add account")
                .setCta()
                .onClick(async value => {
                    SettingsData.accounts.push(this.createNewEmptyAccount())
                    this.accountsConflictsFix()
                    await this.saveSettings()
                    // Force refresh
                    this.display()
                }))
    }

    displayModifyAccountPage(prevAccount: IJiraIssueAccountSettings, newAccount: IJiraIssueAccountSettings = null) {
        if (!newAccount) newAccount = Object.assign({}, prevAccount)
        const { containerEl } = this
        containerEl.empty()
        containerEl.createEl('h3', { text: 'Modify account' })

        new Setting(containerEl)
            .setName('Alias')
            .setDesc('Name of this account.')
            .addText(text => text
                .setPlaceholder('Example: Company name')
                .setValue(newAccount.alias)
                .onChange(async value => {
                    newAccount.alias = value
                }))
        new Setting(containerEl)
            .setName('Host')
            .setDesc('Hostname of your company Jira server.')
            .addText(text => text
                .setPlaceholder('Example: ' + DEFAULT_ACCOUNT.host)
                .setValue(newAccount.host)
                .onChange(async value => {
                    newAccount.host = value
                }))
        new Setting(containerEl)
            .setName('Authentication type')
            .setDesc('Select how the plugin should authenticate in your Jira server.')
            .addDropdown(dropdown => dropdown
                .addOptions(AUTHENTICATION_TYPE_DESCRIPTION)
                .setValue(newAccount.authenticationType)
                .onChange(async value => {
                    newAccount.authenticationType = value as EAuthenticationTypes
                    this._showPassword = false
                    // Force refresh
                    this.displayModifyAccountPage(prevAccount, newAccount)
                }))
        if (newAccount.authenticationType === EAuthenticationTypes.BASIC) {
            new Setting(containerEl)
                .setName('Username')
                .setDesc('Username to access your Jira Server account using HTTP basic authentication.')
                .addText(text => text
                    // .setPlaceholder('')
                    .setValue(newAccount.username)
                    .onChange(async value => {
                        newAccount.username = value
                    }))
            new Setting(containerEl)
                .setName('Password')
                .setDesc('Password to access your Jira Server account using HTTP basic authentication.')
                .addText(text => text
                    // .setPlaceholder('')
                    .setValue(newAccount.password)
                    .onChange(async value => {
                        newAccount.password = value
                    }).inputEl.setAttr('type', this._showPassword ? 'text' : 'password'))
                .addExtraButton(button => button
                    .setIcon(this._showPassword ? 'jira-issue-hidden' : 'jira-issue-visible')
                    .setTooltip(this._showPassword ? 'Hide password' : 'Show password')
                    .onClick(async () => {
                        this._showPassword = !this._showPassword
                        // Force refresh
                        this.displayModifyAccountPage(prevAccount, newAccount)
                    }))
        } else if (newAccount.authenticationType === EAuthenticationTypes.CLOUD) {
            new Setting(containerEl)
                .setName('Email')
                .setDesc('Email of your Jira Cloud account.')
                .addText(text => text
                    // .setPlaceholder('')
                    .setValue(newAccount.username)
                    .onChange(async value => {
                        newAccount.username = value
                    }))
            const apiTokenDescription = new Setting(containerEl)
                .setName('API Token')
                .addText(text => text
                    // .setPlaceholder('')
                    .setValue(newAccount.password)
                    .onChange(async value => {
                        newAccount.password = value
                    }).inputEl.setAttr('type', this._showPassword ? 'text' : 'password'))
                .addExtraButton(button => button
                    .setIcon(this._showPassword ? 'jira-issue-hidden' : 'jira-issue-visible')
                    .setTooltip(this._showPassword ? 'Hide password' : 'Show password')
                    .onClick(async () => {
                        this._showPassword = !this._showPassword
                        // Force refresh
                        this.displayModifyAccountPage(prevAccount, newAccount)
                    }))
                .descEl
            apiTokenDescription.appendText('API token of your Jira Cloud account (')
            apiTokenDescription
                .appendChild(createEl('a', {
                    text: 'Official Documentation',
                    href: 'https://support.atlassian.com/atlassian-account/docs/manage-api-tokens-for-your-atlassian-account/'
                }))
            apiTokenDescription.appendText(').')
        } else if (newAccount.authenticationType === EAuthenticationTypes.BEARER_TOKEN) {
            new Setting(containerEl)
                .setName('Bearer token')
                .setDesc('Token to access your Jira account using OAuth3 Bearer token authentication.')
                .addText(text => text
                    // .setPlaceholder('')
                    .setValue(newAccount.bareToken)
                    .onChange(async value => {
                        newAccount.bareToken = value
                    }).inputEl.setAttr('type', this._showPassword ? 'text' : 'password'))
                .addExtraButton(button => button
                    .setIcon(this._showPassword ? 'jira-issue-hidden' : 'jira-issue-visible')
                    .setTooltip(this._showPassword ? 'Hide password' : 'Show password')
                    .onClick(async () => {
                        this._showPassword = !this._showPassword
                        // Force refresh
                        this.displayModifyAccountPage(prevAccount, newAccount)
                    }))
        }
        new Setting(containerEl)
            .setName('Priority')
            .setDesc('Accounts search priority.')
            .addDropdown(dropdown => dropdown
                .addOptions(this.createPriorityOptions())
                .setValue(newAccount.priority.toString())
                .onChange(async value => {
                    newAccount.priority = parseInt(value)
                }))
        let colorTextComponent: TextComponent = null
        const colorInput = new Setting(containerEl)
            .setName('Color band')
            .setDesc('Color of the tags border. Use colors in hexadecimal notation (Example: #000000).')
            .addText(text => {
                text
                    .setPlaceholder('Example: #000000')
                    .setValue(newAccount.color)
                    .onChange(async value => {
                        newAccount.color = value.replace(/[^#0-9A-Fa-f]/g, '')
                        if (newAccount.color[0] != '#') newAccount.color = '#' + newAccount.color
                        colorInput.setAttr('style', 'border-left: 5px solid ' + newAccount.color)
                    })
                colorTextComponent = text
            })
            .addExtraButton(button => button
                .setIcon('dice')
                .setTooltip('New random color')
                .onClick(async () => {
                    newAccount.color = getRandomHexColor()
                    if (colorTextComponent != null) colorTextComponent.setValue(newAccount.color)
                    colorInput.setAttr('style', 'border-left: 5px solid ' + newAccount.color)
                })).controlEl.children[0]
        colorInput.setAttr('style', 'border-left: 5px solid ' + newAccount.color)

        new Setting(containerEl)
            .setName('Use 2025 search api')
            .setDesc(`In Aug 2025, Atlassian replaced the search api with a new one. Activate this option if you use Jira Cloud or you get the error 410 when searching issues.`)
            .addToggle(toggle => toggle
                .setValue(newAccount.use2025Api)
                .onChange(async value => {
                    newAccount.use2025Api = value
                    await this.saveSettings()
                }))

        containerEl.createEl('h3', { text: 'Rate Limiting' })

        new Setting(containerEl)
            .setName('Enable request queue')
            .setDesc('Enable request queue to avoid 429 errors from Jira API. Requests are executed sequentially with a fixed delay between them.')
            .addToggle(toggle => toggle
                .setValue(newAccount.rateLimit.enabled)
                .onChange(async value => {
                    newAccount.rateLimit.enabled = value
                }))

        new Setting(containerEl)
            .setName('Delay between requests')
            .setDesc('Delay in milliseconds between consecutive requests (e.g., 100 = 10 req/sec, 500 = 2 req/sec, 1000 = 1 req/sec).')
            .addText(text => text
                .setPlaceholder('100')
                .setValue(newAccount.rateLimit.delayMs.toString())
                .onChange(async value => {
                    newAccount.rateLimit.delayMs = parseInt(value) || DEFAULT_RATE_LIMIT.delayMs
                }))

        new Setting(containerEl)
            .setName('Concurrent requests')
            .setDesc('Number of requests that can be processed simultaneously. Use 1 for strict sequential processing.')
            .addText(text => text
                .setPlaceholder('1')
                .setValue(newAccount.rateLimit.concurrent.toString())
                .onChange(async value => {
                    newAccount.rateLimit.concurrent = Math.max(1, parseInt(value) || DEFAULT_RATE_LIMIT.concurrent)
                }))

        containerEl.createEl('h3', { text: 'Predefined Labels' })
        containerEl.createEl('p', { text: 'Labels available in the context menu for quick assignment.', cls: 'setting-item-description' })

        // Display existing predefined labels
        if (!newAccount.predefinedLabels) {
            newAccount.predefinedLabels = []
        }
        for (let i = 0; i < newAccount.predefinedLabels.length; i++) {
            const label = newAccount.predefinedLabels[i]
            new Setting(containerEl)
                .setName(label)
                .addExtraButton(button => button
                    .setIcon('trash')
                    .setTooltip('Remove label')
                    .onClick(async () => {
                        newAccount.predefinedLabels.splice(i, 1)
                        this.displayModifyAccountPage(prevAccount, newAccount)
                    }))
        }

        // Add new label input
        let newLabelInput: TextComponent = null
        new Setting(containerEl)
            .setName('Add new label')
            .addText(text => {
                newLabelInput = text
                text.setPlaceholder('Enter label name')
            })
            .addButton(button => button
                .setButtonText('Add')
                .onClick(async () => {
                    const labelName = newLabelInput.getValue().trim()
                    if (labelName && !newAccount.predefinedLabels.includes(labelName)) {
                        newAccount.predefinedLabels.push(labelName)
                        this.displayModifyAccountPage(prevAccount, newAccount)
                    }
                }))

        // Predefined Assignees section
        containerEl.createEl('h3', { text: 'Predefined Assignees' })
        containerEl.createEl('p', { text: 'Users available in the context menu for quick assignment. Use Account ID from Jira user profile.', cls: 'setting-item-description' })

        if (!newAccount.predefinedAssignees) {
            newAccount.predefinedAssignees = []
        }
        for (let i = 0; i < newAccount.predefinedAssignees.length; i++) {
            const assignee = newAccount.predefinedAssignees[i]
            new Setting(containerEl)
                .setName(assignee.displayName)
                .setDesc(`ID: ${assignee.accountId}`)
                .addExtraButton(button => button
                    .setIcon('trash')
                    .setTooltip('Remove assignee')
                    .onClick(async () => {
                        newAccount.predefinedAssignees.splice(i, 1)
                        this.displayModifyAccountPage(prevAccount, newAccount)
                    }))
        }

        // Search for users
        let searchInput: TextComponent = null
        const searchResultsContainer = containerEl.createDiv({ cls: 'jira-assignee-search-results' })

        new Setting(containerEl)
            .setName('Search users')
            .setDesc('Search by name or email to add assignees')
            .addText(text => {
                searchInput = text
                text.setPlaceholder('Type to search...')
            })
            .addButton(button => button
                .setButtonText('Search')
                .onClick(async () => {
                    const query = searchInput.getValue().trim()
                    if (query.length < 2) {
                        new Notice('Enter at least 2 characters to search')
                        return
                    }
                    button.setDisabled(true)
                    button.setButtonText('Searching...')
                    searchResultsContainer.empty()

                    try {
                        const users = await JiraClient.searchUsers(query, { account: newAccount })
                        if (users.length === 0) {
                            searchResultsContainer.createEl('p', { text: 'No users found', cls: 'setting-item-description' })
                        } else {
                            for (const user of users) {
                                // Jira Server uses "name", Jira Cloud uses "accountId"
                                const accountId = user.accountId || user.name || user.key
                                const isAlreadyAdded = newAccount.predefinedAssignees.some(a => a.accountId === accountId)
                                // /user/picker returns html field with email, parse it
                                const emailMatch = (user as any).html?.match(/\(([^)]+@[^)]+)\)/)
                                const email = user.emailAddress || (emailMatch ? emailMatch[1] : null)
                                // /user/picker with showAvatar=true returns avatarUrl (singular)
                                const avatarUrl = (user as any).avatarUrl || user.avatarUrls?.['32x32'] || user.avatarUrls?.['24x24']

                                const userRow = searchResultsContainer.createDiv({ cls: 'jira-user-search-result' })

                                // Avatar: use image if available, otherwise show initials placeholder
                                if (avatarUrl) {
                                    userRow.createEl('img', { cls: 'jira-user-avatar', attr: { src: avatarUrl, alt: user.displayName } })
                                } else {
                                    const initials = user.displayName
                                        .split(' ')
                                        .map(n => n[0])
                                        .slice(0, 2)
                                        .join('')
                                        .toUpperCase()
                                    userRow.createDiv({ cls: 'jira-user-avatar-placeholder', text: initials })
                                }

                                // User info
                                const userInfo = userRow.createDiv({ cls: 'jira-user-info' })
                                userInfo.createEl('div', { text: user.displayName, cls: 'jira-user-name' })
                                if (email) {
                                    userInfo.createEl('div', { text: email, cls: 'jira-user-email' })
                                }

                                // Add button
                                const addBtn = userRow.createEl('button', {
                                    text: isAlreadyAdded ? 'Added' : 'Add',
                                    cls: isAlreadyAdded ? 'mod-muted' : ''
                                })
                                if (isAlreadyAdded) {
                                    addBtn.disabled = true
                                } else {
                                    addBtn.addEventListener('click', async () => {
                                        newAccount.predefinedAssignees.push({
                                            accountId: accountId,
                                            displayName: user.displayName
                                        })
                                        this.displayModifyAccountPage(prevAccount, newAccount)
                                    })
                                }
                            }
                        }
                    } catch (e) {
                        console.error('JiraIssue: User search failed', e)
                        searchResultsContainer.createEl('p', { text: `Search failed: ${e.message}`, cls: 'setting-item-description' })
                    }

                    button.setButtonText('Search')
                    button.setDisabled(false)
                }))

        // People Field Mappings section
        containerEl.createEl('h3', { text: 'People Field Mappings' })
        containerEl.createEl('p', {
            text: 'Configure custom user fields for bulk assignment via "Assign to fields" context menu.',
            cls: 'setting-item-description'
        })

        if (!newAccount.peopleFieldMappings) {
            newAccount.peopleFieldMappings = []
        }
        for (let i = 0; i < newAccount.peopleFieldMappings.length; i++) {
            const mapping = newAccount.peopleFieldMappings[i]
            new Setting(containerEl)
                .setName(mapping.displayName)
                .setDesc(`Field ID: ${mapping.fieldId}`)
                .addExtraButton(button => button
                    .setIcon('trash')
                    .setTooltip('Remove field mapping')
                    .onClick(async () => {
                        newAccount.peopleFieldMappings.splice(i, 1)
                        // Also remove from lastSelectedPeopleFields if present
                        if (newAccount.lastSelectedPeopleFields) {
                            newAccount.lastSelectedPeopleFields = newAccount.lastSelectedPeopleFields.filter(
                                id => id !== mapping.fieldId
                            )
                        }
                        this.displayModifyAccountPage(prevAccount, newAccount)
                    }))
        }

        // Add new mapping form
        let newMappingName: TextComponent = null
        let newMappingFieldId: TextComponent = null

        new Setting(containerEl)
            .setName('Display name')
            .setDesc('Human-readable name (e.g., "Code Reviewer")')
            .addText(text => {
                newMappingName = text
                text.setPlaceholder('Code Reviewer')
            })

        new Setting(containerEl)
            .setName('Field ID')
            .setDesc('Jira custom field ID (e.g., "customfield_10100")')
            .addText(text => {
                newMappingFieldId = text
                text.setPlaceholder('customfield_10100')
            })
            .addButton(button => button
                .setButtonText('Add')
                .onClick(async () => {
                    const displayName = newMappingName.getValue().trim()
                    const fieldId = newMappingFieldId.getValue().trim()

                    if (!displayName) {
                        new Notice('Please enter a display name')
                        return
                    }
                    if (!fieldId) {
                        new Notice('Please enter a field ID')
                        return
                    }

                    // Check for duplicate field ID
                    if (newAccount.peopleFieldMappings.some(m => m.fieldId === fieldId)) {
                        new Notice('This field ID is already mapped')
                        return
                    }

                    newAccount.peopleFieldMappings.push({ displayName, fieldId })
                    this.displayModifyAccountPage(prevAccount, newAccount)
                }))

        new Setting(containerEl)
            .addButton(button => button
                .setButtonText("Back")
                .setWarning()
                .onClick(async value => {
                    this._showPassword = false
                    this.display()
                }))
            .addButton(button => button
                .setButtonText("Test Connection")
                .onClick(async value => {
                    button.setDisabled(true)
                    button.setButtonText("Testing...")
                    try {
                        await JiraClient.testConnection(newAccount)
                        new Notice('JiraIssue: Connection established!')
                        try {
                            const loggedUser = await JiraClient.getLoggedUser(newAccount)
                            new Notice(`JiraIssue: Logged as ${loggedUser.displayName}`)
                        } catch (e) {
                            new Notice('JiraIssue: Logged as Guest')
                            console.error('JiraIssue:TestConnection', e)
                        }
                    } catch (e) {
                        console.error('JiraIssue:TestConnection', e)
                        new Notice('JiraIssue: Connection failed!')
                    }
                    button.setButtonText("Test Connection")
                    button.setDisabled(false)
                }))
            .addButton(button => button
                .setButtonText("Save")
                .setCta()
                .onClick(async value => {
                    this._showPassword = false
                    // Swap priority with another existing account
                    SettingsData.accounts.find(a => a.priority === newAccount.priority).priority = prevAccount.priority
                    Object.assign(prevAccount, newAccount)
                    this.accountsConflictsFix()
                    await this.saveSettings()
                    this.display()
                }))
    }

    displayRenderingSettings() {
        const { containerEl } = this
        containerEl.createEl('h3', { text: 'Rendering' })

        new Setting(containerEl)
            .setName('Default search results limit')
            .setDesc('Maximum number of search results to retrieve when using jira-search without specifying a limit.')
            .addText(text => text
                // .setPlaceholder('Insert a number')
                .setValue(SettingsData.searchResultsLimit.toString())
                .onChange(async value => {
                    SettingsData.searchResultsLimit = parseInt(value) || DEFAULT_SETTINGS.searchResultsLimit
                    await this.saveSettings()
                }))
        new Setting(containerEl)
            .setName('Color schema')
            // .setDesc('')
            .addDropdown(dropdown => dropdown
                .addOptions(COLOR_SCHEMA_DESCRIPTION)
                .setValue(SettingsData.colorSchema)
                .onChange(async value => {
                    SettingsData.colorSchema = value as EColorSchema
                    await this.saveSettings()
                }))

        new Setting(containerEl)
            .setName('Issue url to tags')
            .setDesc(`Convert links to issues to tags. Example: ${SettingsData.accounts[0].host}/browse/AAA-123`)
            .addToggle(toggle => toggle
                .setValue(SettingsData.inlineIssueUrlToTag)
                .onChange(async value => {
                    SettingsData.inlineIssueUrlToTag = value
                    await this.saveSettings()
                }))

        const inlineIssuePrefixDesc = (prefix: string) => 'Prefix to use when rendering inline issues. Keep this field empty to disable this feature. '
            + (prefix ? `Example: ${prefix}AAA-123` : 'Feature disabled.')
        const inlineIssuePrefixSetting = new Setting(containerEl)
            .setName('Inline issue prefix')
            .setDesc(inlineIssuePrefixDesc(SettingsData.inlineIssuePrefix))
            .addText(text => text
                .setValue(SettingsData.inlineIssuePrefix)
                .onChange(async value => {
                    SettingsData.inlineIssuePrefix = value
                    inlineIssuePrefixSetting.setDesc(inlineIssuePrefixDesc(SettingsData.inlineIssuePrefix))
                    await this.saveSettings()
                }))
        new Setting(containerEl)
            .setName('Show color band')
            .setDesc('Display color band near by inline issue to simplify the account identification.')
            .addToggle(toggle => toggle
                .setValue(SettingsData.showColorBand)
                .onChange(async value => {
                    SettingsData.showColorBand = value
                    await this.saveSettings()
                }))

        new Setting(containerEl)
            .setName('Show Jira link')
            .setDesc('Make the result count in jira-search a link to the jira project with the jql from the search.')
            .addToggle(toggle => toggle
                .setValue(SettingsData.showJiraLink)
                .onChange(async value => {
                    SettingsData.showJiraLink = value
                    await this.saveSettings()
                }))
    }

    displaySearchColumnsSettings(isSearchColumnsDetailsOpen: boolean) {
        const { containerEl } = this
        containerEl.createEl('h3', { text: 'Search columns' })

        const desc = document.createDocumentFragment()
        desc.append(
            "Columns to display in the jira-search table visualization.",
        )
        new Setting(containerEl).setDesc(desc)
        this._searchColumnsDetails = containerEl.createEl('details',
            { attr: isSearchColumnsDetailsOpen ? { open: true } : {} }
        )
        this._searchColumnsDetails.createEl('summary', { text: 'Show/Hide columns' })
        SettingsData.searchColumns.forEach((column, index) => {
            const setting = new Setting(this._searchColumnsDetails)
                .addDropdown(dropdown => dropdown
                    .addOptions(SEARCH_COLUMNS_DESCRIPTION)
                    .setValue(column.type)
                    .onChange(async value => {
                        SettingsData.searchColumns[index].type = value as ESearchColumnsTypes
                        await this.saveSettings()
                        // Force refresh
                        this.display()
                    }).selectEl.addClass('flex-grow-1')
                )

            // if (column.type === ESearchColumnsTypes.CUSTOM) {
            //     setting.addText(text => text
            //         .setPlaceholder('Custom field name')
            //         .setValue(column.customField)
            //         .onChange(async value => {
            //             settingData.searchColumns[index].customField = value
            //             await this.saveSettings()
            //         }).inputEl.addClass('custom-field-text')
            //     )
            // }
            setting.addExtraButton(button => button
                .setIcon(SettingsData.searchColumns[index].compact ? 'compress-glyph' : 'enlarge-glyph')
                .setTooltip(SettingsData.searchColumns[index].compact ? 'Compact' : 'Full width')
                .onClick(async () => {
                    SettingsData.searchColumns[index].compact = !SettingsData.searchColumns[index].compact
                    await this.saveSettings()
                    // Force refresh
                    this.display()
                }))
            setting.addExtraButton(button => button
                .setIcon('up-chevron-glyph')
                .setTooltip('Move up')
                .setDisabled(index === 0)
                .onClick(async () => {
                    const tmp = SettingsData.searchColumns[index]
                    SettingsData.searchColumns[index] = SettingsData.searchColumns[index - 1]
                    SettingsData.searchColumns[index - 1] = tmp
                    await this.saveSettings()
                    // Force refresh
                    this.display()
                }))
            setting.addExtraButton(button => button
                .setIcon('down-chevron-glyph')
                .setTooltip('Move down')
                .setDisabled(index === SettingsData.searchColumns.length - 1)
                .onClick(async () => {
                    const tmp = SettingsData.searchColumns[index]
                    SettingsData.searchColumns[index] = SettingsData.searchColumns[index + 1]
                    SettingsData.searchColumns[index + 1] = tmp
                    await this.saveSettings()
                    // Force refresh
                    this.display()
                }))
            setting.addExtraButton(button => button
                .setIcon('trash')
                .setTooltip('Delete')
                .onClick(async () => {
                    SettingsData.searchColumns.splice(index, 1)
                    await this.saveSettings()
                    // Force refresh
                    this.display()
                }))
            setting.infoEl.remove()
        })
        new Setting(this._searchColumnsDetails)
            .addButton(button => button
                .setButtonText("Reset columns")
                .setWarning()
                .onClick(async value => {
                    SettingsData.searchColumns = [...DEFAULT_SETTINGS.searchColumns]
                    await this.saveSettings()
                    // Force refresh
                    this.display()
                }))
            .addButton(button => button
                .setButtonText("Add Column")
                .setCta()
                .onClick(async value => {
                    SettingsData.searchColumns.push({ type: ESearchColumnsTypes.KEY, compact: false })
                    await this.saveSettings()
                    // Force refresh
                    this.display()
                }))
    }

    displayExtraSettings() {
        const { containerEl } = this
        containerEl.createEl('h3', { text: 'Cache' })

        new Setting(containerEl)
            .setName('Cache time')
            .setDesc('Time before the cached issue status expires. A low value will refresh the data very often but do a lot of requests to the server.')
            .addText(text => text
                .setPlaceholder('Example: 15m, 24h, 5s')
                .setValue(SettingsData.cacheTime)
                .onChange(async value => {
                    SettingsData.cacheTime = value
                    await this.saveSettings()
                }))

        containerEl.createEl('h3', { text: 'Troubleshooting' })
        new Setting(containerEl)
            .setName('Log data request and responses')
            .setDesc('Log in the console (CTRL+Shift+I) all the API requests and responses performed by the plugin.')
            .addToggle(toggle => toggle
                .setValue(SettingsData.logRequestsResponses)
                .onChange(async value => {
                    SettingsData.logRequestsResponses = value
                    await this.saveSettings()
                }))
        new Setting(containerEl)
            .setName('Log images requests and responses')
            .setDesc('Log in the console (CTRL+Shift+I) all the images fetch requests and responses performed by the plugin.')
            .addToggle(toggle => toggle
                .setValue(SettingsData.logImagesFetch)
                .onChange(async value => {
                    SettingsData.logImagesFetch = value
                    await this.saveSettings()
                }))
        new Setting(containerEl)
            .setName('Debug batch requests')
            .setDesc('Log batch request operations in the console (CTRL+Shift+I). Shows JQL queries, cache hits/misses, and fetch results.')
            .addToggle(toggle => toggle
                .setValue(SettingsData.debugBatching)
                .onChange(async value => {
                    SettingsData.debugBatching = value
                    await this.saveSettings()
                }))
        new Setting(containerEl)
            .setName('Batch delay (ms)')
            .setDesc('Delay in milliseconds before executing batch request. Higher values collect more issues but increase perceived latency. Minimum: 50ms.')
            .addText(text => text
                .setValue(SettingsData.batchDelayMs.toString())
                .onChange(async value => {
                    const numValue = parseInt(value)
                    SettingsData.batchDelayMs = isNaN(numValue) ? 150 : Math.max(50, numValue)
                    await this.saveSettings()
                }))
    }

    createNewEmptyAccount() {
        const newAccount = JSON.parse(JSON.stringify(DEFAULT_ACCOUNT))
        newAccount.priority = SettingsData.accounts.length + 1
        this.accountsConflictsFix()
        return newAccount
    }

    accountsConflictsFix() {
        const aliases: string[] = []
        SettingsData.accounts.sort((a, b) => a.priority - b.priority)
        let priority = 1
        for (const account of SettingsData.accounts) {
            while (aliases.indexOf(account.alias) >= 0) account.alias += '1'
            aliases.push(account.alias)

            account.priority = priority
            priority++
        }
    }

    createPriorityOptions(): Record<string, string> {
        const options: Record<string, string> = {}
        for (let i = 1; i <= SettingsData.accounts.length; i++) {
            options[i.toString()] = i.toString()
        }
        return options
    }
}
export const SettingsData: IJiraIssueSettings = deepCopy(DEFAULT_SETTINGS)
