import { Menu } from "obsidian"
import { IJiraIssue } from "../interfaces/issueInterfaces"
import { AssigneeModal } from "../modals/assigneeModal"
import { LabelManagementModal } from "../modals/labelManagementModal"
import { PriorityModal } from "../modals/priorityModal"

/**
 * Attaches a context menu (right-click) handler to an issue element.
 * Shows menu with "Add labels" and "Remove labels" options.
 */
export function attachIssueContextMenuHandler(
    element: HTMLElement,
    issue: IJiraIssue,
    onIssueUpdated: (issue: IJiraIssue) => void
): void {
    element.addEventListener('contextmenu', (event: MouseEvent) => {
        event.preventDefault()
        event.stopPropagation()

        const menu = new Menu()

        menu.addItem(item => item
            .setTitle('Add labels')
            .setIcon('tag')
            .onClick(() => {
                new LabelManagementModal(issue, 'add', onIssueUpdated).open()
            })
        )

        if (issue.fields.labels && issue.fields.labels.length > 0) {
            menu.addItem(item => item
                .setTitle('Remove labels')
                .setIcon('x')
                .onClick(() => {
                    new LabelManagementModal(issue, 'remove', onIssueUpdated).open()
                })
            )
        }

        menu.addSeparator()

        menu.addItem(item => item
            .setTitle('Change priority')
            .setIcon('signal')
            .onClick(() => {
                new PriorityModal(issue, onIssueUpdated).open()
            })
        )

        menu.addItem(item => item
            .setTitle('Change assignee')
            .setIcon('user')
            .onClick(() => {
                new AssigneeModal(issue, onIssueUpdated).open()
            })
        )

        menu.showAtMouseEvent(event)
    })
}
