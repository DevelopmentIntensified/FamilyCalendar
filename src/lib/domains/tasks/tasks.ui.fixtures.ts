/**
 * Task row builders for the tasks UI tests (rules, state classes, components):
 * one home for the `TaskPageRow` defaults, so a new column touches one file.
 * Not a `.server` fixture — these rows never reach a database.
 */

import type { TaskCategoryItem, TaskPageRow, TaskSections } from './tasks.contract';

const AT = '2026-09-01T10:00:00.000Z';

export function buildTaskRow(overrides: Partial<TaskPageRow> = {}): TaskPageRow {
	return {
		id: 'task-1',
		title: 'Wash the car',
		notes: null,
		dueDate: null,
		completedAt: null,
		recurrenceFrequency: null,
		recurrenceInterval: null,
		completionCount: 0,
		assignedTo: null,
		assignmentStatus: 'none',
		priority: 'normal',
		visibility: 'private',
		userId: 'u1',
		familyId: null,
		eventId: null,
		focusMinutes: null,
		focusStartedAt: null,
		category: null,
		createdAt: AT,
		tags: [],
		assigneeFirstName: null,
		assigneeLastName: null,
		creatorFirstName: null,
		eventTitle: null,
		eventStart: null,
		...overrides
	};
}

export function buildTaskSections(overrides: Partial<TaskSections> = {}): TaskSections {
	return {
		myTasks: [],
		pendingAssignments: [],
		requestedByMe: [],
		warnings: [],
		...overrides
	};
}

export function buildTaskCategory(
	id: string,
	name: string
): TaskCategoryItem {
	return { id, name };
}
