/**
 * tasks browser client — one typed call per `/api` route this module's UI
 * reads or writes, on the kernel api client. No state, no toasts, no retries:
 * the state classes own optimistic edits and their rollback (`port-ui.md`).
 *
 * Replaces the 43 raw `fetch` calls the legacy `client/task*.ts` modules and
 * the tasks components each carried.
 */

import { createApiClient, type ApiResult } from '$lib/kernel/client/apiClient';
import type {
	FocusSessionWire,
	TaskCategoryWire,
	TaskCreateBody,
	TaskUpdateBody,
	TaskWithTagsWire,
	TaskWire
} from './tasks.contract';

/** A `PUT` answer: the row plus its tags on a field patch, the bare row otherwise. */
export type TaskMutationAnswer = { success: true; task: TaskWithTagsWire | TaskWire };

/** `GET /api/taskfocus/sessions?unabsorbed=1` items (the phone's answer shape). */
export type TaskFocusSessionList = { sessions: FocusSessionWire[] };

export function createTasksApi(client = createApiClient()) {
	return {
		// --- Tasks --------------------------------------------------------------
		listForEvent: (eventId: string): Promise<ApiResult<{ tasks: TaskWire[] }>> =>
			client.request('GET', `/api/tasks?eventId=${encodeURIComponent(eventId)}`),
		create: (body: TaskCreateBody): Promise<ApiResult<{ success: true; task: TaskWithTagsWire }>> =>
			client.request('POST', '/api/tasks', body),
		update: (taskId: string, body: TaskUpdateBody): Promise<ApiResult<TaskMutationAnswer>> =>
			client.request('PUT', `/api/tasks/${encodeURIComponent(taskId)}`, body),
		remove: (taskId: string): Promise<ApiResult<{ success: true }>> =>
			client.request('DELETE', `/api/tasks/${encodeURIComponent(taskId)}`),
		clearCompleted: (): Promise<ApiResult<{ success: true }>> =>
			client.request('DELETE', '/api/tasks/completed'),

		// --- Categories ---------------------------------------------------------
		listCategories: (): Promise<ApiResult<{ categories: TaskCategoryWire[] }>> =>
			client.request('GET', '/api/task-categories'),
		addCategory: (name: string): Promise<ApiResult<{ category: TaskCategoryWire }>> =>
			client.request('POST', '/api/task-categories', { name }),
		renameCategory: (categoryId: string, name: string): Promise<ApiResult<{ category: TaskCategoryWire }>> =>
			client.request('PATCH', `/api/task-categories/${encodeURIComponent(categoryId)}`, { name }),
		removeCategory: (categoryId: string): Promise<ApiResult<{ success: true }>> =>
			client.request('DELETE', `/api/task-categories/${encodeURIComponent(categoryId)}`),

		// --- TaskFocus ----------------------------------------------------------
		/** The device command channel; `stop` may carry no task id. */
		focusCommand: (command: 'start' | 'stop', taskId?: string): Promise<ApiResult<undefined>> =>
			client.request(
				'POST',
				'/api/taskfocus/commands',
				command === 'stop' ? { command } : { command, taskId }
			),
		listUnabsorbedSessions: (): Promise<ApiResult<TaskFocusSessionList>> =>
			client.request('GET', '/api/taskfocus/sessions?unabsorbed=1')
	};
}

export type TasksApi = ReturnType<typeof createTasksApi>;
