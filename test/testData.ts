import { IJiraAutocompleteDataField } from "../src/interfaces/issueInterfaces"
import { DEFAULT_RATE_LIMIT } from "../src/settings"
import { EAuthenticationTypes, IPeopleFieldMapping, IPredefinedAssignee } from "../src/interfaces/settingsInterfaces"

const kEmptyAccountCache = {
    customFieldsIdToName: {},
    customFieldsNameToId: {},
    customFieldsType: {},
    jqlAutocomplete: {
        fields: [] as IJiraAutocompleteDataField[],
        functions: {},
    },
    statusColor: {},
}

export const TestAccountOpen = {
    alias: 'alias1',
    host: 'https://test-company.atlassian.net',
    authenticationType: EAuthenticationTypes.OPEN,
    priority: 1,
    color: '#123456',
    use2025Api: false,
    rateLimit: DEFAULT_RATE_LIMIT,
    cache: kEmptyAccountCache,
    predefinedLabels: [] as string[],
    predefinedAssignees: [] as IPredefinedAssignee[],
    peopleFieldMappings: [] as IPeopleFieldMapping[],
    lastSelectedPeopleFields: [] as string[],
}

export const TestAccountBasic = {
    alias: 'alias2',
    host: 'host2',
    authenticationType: EAuthenticationTypes.BASIC,
    username: 'username2',
    password: 'password2',
    priority: 2,
    color: '#789012',
    use2025Api: false,
    rateLimit: DEFAULT_RATE_LIMIT,
    cache: kEmptyAccountCache,
    predefinedLabels: [] as string[],
    predefinedAssignees: [] as IPredefinedAssignee[],
    peopleFieldMappings: [] as IPeopleFieldMapping[],
    lastSelectedPeopleFields: [] as string[],
}
