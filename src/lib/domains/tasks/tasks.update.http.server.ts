/**
 * tasks update http: `PUT|DELETE /api/tasks/[id]` — the one body-dispatch route
 * and the delete door.
 *
 * The stem is frozen by `tasks.update.http.db.test.ts` (R13), which calls the
 * route file by PATH (`/api/tasks/<id>`) exactly as legacy read the id:
 * `url.pathname.split('/').pop()`, never `params`. Statuses and bodies are the
 * golden's: `200 {success, task}` for the four PUT branches, `200 {success:true}`
 * for DELETE, and the route's own 500 copy when the raw patch reaches the
 * database (`dueDate: 'not-a-date'` stays unvalidated, Q-052).
 *
 * Doc: ./README.md#public-interface
 */
import { endpoint, ok, reply } from '$lib/kernel/http/endpoint.server';
import { TaskUpdateBody } from './tasks.contract';
import { deleteTask, updateTask } from './tasks.items.service.server';

/** The route's own 400 for a path with no id segment (legacy verbatim). */
const TASK_ID_REQUIRED = 'Task ID required';

/** `PUT /api/tasks/[id]`: undo → skip → toggle → field patch, in `updateTask`. */
export const updateTaskEndpoint = endpoint({
	auth: 'user',
	body: TaskUpdateBody,
	// Legacy read the body before its `try`; a non-object body is a 400 under
	// the contract (the unpinned edge the S3 note left to this mode).
	bodyMode: 'lenient',
	failMessage: 'Failed to update task',
	handle: async ({ ctx, actor, body, event }) => {
		// Legacy read the id off the URL, never the route params.
		const taskId = event.url.pathname.split('/').pop() ?? '';
		if (!taskId) return reply(400, { error: TASK_ID_REQUIRED });
		return ok({ success: true, task: await updateTask(ctx, actor, { taskId, body }) });
	}
});

/** `DELETE /api/tasks/[id]`: open Task hard-deleted, completed one archived. */
export const deleteTaskEndpoint = endpoint({
	auth: 'user',
	failMessage: 'Failed to delete task',
	handle: async ({ ctx, actor, event }) => {
		// Legacy read the id off the URL, never the route params.
		const taskId = event.url.pathname.split('/').pop() ?? '';
		if (!taskId) return reply(400, { error: TASK_ID_REQUIRED });
		await deleteTask(ctx, actor, { taskId });
		return ok({ success: true });
	}
});
