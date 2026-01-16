# Obsidian jira-issue
![Test Status](https://github.com/GoWebProd/obsidian-jira-master/actions/workflows/ci.yaml/badge.svg)


This plugin allows you to track the progress of [Atlassian Jira](https://www.atlassian.com/software/jira) issues from your [Obsidian.md](https://obsidian.md/) notes.

![issues](./assets/issues.png)

![searchResults](./assets/searchResults2.png)

## Documentation
Check out the complete [documentation](https://GoWebProd.github.io/obsidian-jira-master) to start using Jira-Issue.

## Installation
From the obsidian app go in `Settings > Third-party plugins > Community Plugins > Browse` and search for `jira-issue`.

[Read more...](https://GoWebProd.github.io/obsidian-jira-master/docs/get-started/installation)

## Configuration

Use the plugin options to configure the connection to your Atlassian Jira server: host, username and password.

[Read more...](https://GoWebProd.github.io/obsidian-jira-master/docs/get-started/basic-authentication)

## Markdown Syntax

The plugin support the following components:

### 📃`jira-issue`:
- [Documentation](https://GoWebProd.github.io/obsidian-jira-master/docs/components/jira-issue)
- Example:
````
```jira-issue
AAA-111
AAA-222
https://my.jira-server.com/browse/BBB-333
# This is a comment
```
````

### 🔎`jira-search`
- [Documentation](https://GoWebProd.github.io/obsidian-jira-master/docs/components/jira-search)
- Simple example:
````
```jira-search
resolution = Unresolved AND assignee = currentUser() AND status = 'In Progress' order by priority DESC
    ```
````
- Advanced example:
````
```jira-search
type: TABLE
query: status = 'In Progress' order by priority DESC
limit: 15
columns: KEY, SUMMARY, -ASSIGNEE, -REPORTER, STATUS, NOTES
```
````

### 🔢`jira-count`
- [Documentation](https://GoWebProd.github.io/obsidian-jira-master/docs/components/jira-count)
- Example:
````
```jira-count
project = REF AND status changed to (Done, "Won't Fix", Archived, "Can't Reproduce", "PM Validated") after -14d
```
````

### 📊`jira-kanban`
- [Documentation](https://GoWebProd.github.io/obsidian-jira-master/docs/components/jira-kanban)
- Simple example:
````
```jira-kanban
query: project = DEMO AND sprint in openSprints()
columns: TODO, IN PROGRESS, DONE
```
````
- Advanced example with swimlanes and estimations:
````
```jira-kanban
query: project = DEMO AND sprint in openSprints()
columns:
  - name: Backlog
    statuses: [To Do, Open]
  - name: In Progress
    statuses: [In Progress]
    wipLimit: 3
  - name: Review
    statuses: [In Review, Code Review]
  - name: Done
    statuses: [Done, Closed]
swimlaneBy: assignee
estimationType: points
fields: [KEY, SUMMARY, PRIORITY, ASSIGNEE, LABELS]
```
````

### 📜`jira-changelog`
- [Documentation](https://GoWebProd.github.io/obsidian-jira-master/docs/components/jira-changelog)
- Simple example:
````
```jira-changelog
query: project = DEMO AND updated >= -1d
```
````
- Advanced example with grouping and filtering:
````
```jira-changelog
query: project = DEMO AND sprint in openSprints()
period: 1w
groupBy: author
fields: status, assignee, priority
limit: 50
```
````

### 🏷️Inline issues
- [Documentation](https://GoWebProd.github.io/obsidian-jira-master/docs/components/inline-issue)
- Example:
````
With inline issue you can insert an issue like JIRA:OPEN-351 inside your text.
The plugin will detect urls like https://jira.secondlife.com/browse/OPEN-352 and render the issue as tags.
- [ ] Issue can be extended JIRA:OPEN-353 with the summary
- [x] Or compact JIRA:-OPEN-354 without the summary
- [ ] JIRA:-OPEN-355 use the `-` symbol before the issue key to make it compact
```
The plugin searches inside the note for those patterns and replace them
JIRA:-OPEN-356
```
````
![Inline issues](./assets/inlineIssues.png)

## Contribution and Feedbacks

Feel free to share your experiences, feedbacks and suggestions in the by opening a GitHub issue.

Pull requests are welcome.

## License

Jira-Issue is licensed under the GNU AGPLv3 license. Refer to [LICENSE](https://github.com/GoWebProd/obsidian-jira-master/blob/master/LICENSE) for more information.
