/** Family-tasks page mutations + list helpers (#039). Pure fetch wrappers —
 * toasts/feedback/invalidate stay with the calling page. */

export interface ActionTask {
	id: string;
	title: string;
	dueDate?: string | null;
	userId?: string;
}

/**
 * The task row these actions hand back.
 *
 * It used to be `unknown`, which pushed the guessing onto every caller — the
 * family-tasks page could not pass it to the recurring feedback without
 * tripping svelte-check, and the next person would have had to find out what
 * the API actually returns by reading it. These are the fields the callers
 * read: `id` for undo, `recurrenceFrequency` and `dueDate` for the feedback
 * toast. The rest of the row comes back typed as whatever the task has.
 */
export interface ActionTaskRow {
	id: string;
	recurrenceFrequency?: string | null;
	dueDate?: string | Date | null;
	completedAt?: string | null;
}

/** What `/api/tasks/:id` answers with: a `task` wrapper, or the row itself. */
export interface TaskActionPayload extends Partial<ActionTaskRow> {
	task?: ActionTaskRow;
	error?: string;
}

export type FamilyTaskActionResult = { ok: true; task: ActionTaskRow } | { ok: false; error: string };

/**
 * One place that decides what "the task" is: the `task` wrapper when the API
 * sends one, the payload itself when it sends the row bare, and the caller's
 * own id as the floor. Every mutation returns the same shape this way, so a
 * caller never has to check which door a row came through.
 */
function rowFrom(payload: TaskActionPayload, fallbackId: string): ActionTaskRow {
	if (payload.task) return payload.task;
	return { ...payload, id: payload.id ?? fallbackId };
}

export type FetchLike = (
	url: string,
	init?: RequestInit
) => Promise<{ ok: boolean; json: () => Promise<TaskActionPayload> }>;

type TaskMutation =
	| { toggleComplete: boolean }
	| { advanceToNext: boolean }
	| { assignmentStatus: string };

async function putTask(
	task: ActionTask,
	mutation: TaskMutation,
	fallbackError: string,
	fetchFn: FetchLike = fetch
): Promise<FamilyTaskActionResult> {
	try {
		const res = await fetchFn(`/api/tasks/${task.id}`, {
			method: 'PUT',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify(mutation)
		});
		const j = await res.json().catch((): TaskActionPayload => ({}));
		if (!res.ok) return { ok: false, error: j.error || fallbackError };
		return { ok: true, task: rowFrom(j, task.id) };
	} catch {
		return { ok: false, error: 'Network problem — try again.' };
	}
}

/** Toggle complete; returns the parsed task for recurring feedback. */
export function toggleTask(task: ActionTask, fetchFn?: FetchLike): Promise<FamilyTaskActionResult> {
	return putTask(
		task,
		{ toggleComplete: true },
		`Couldn't update "${task.title}" — try again.`,
		fetchFn
	);
}

/** Skip a recurring occurrence; returns the parsed task for skip feedback. */
export function advanceTask(
	task: ActionTask,
	fetchFn?: FetchLike
): Promise<FamilyTaskActionResult> {
	return putTask(
		task,
		{ advanceToNext: true },
		`Couldn't skip "${task.title}" — try again.`,
		fetchFn
	);
}

/** Accept or decline an assignment handoff. */
export function respondToTask(
	task: ActionTask,
	accept: boolean,
	fetchFn?: FetchLike
): Promise<FamilyTaskActionResult> {
	return putTask(
		task,
		{ assignmentStatus: accept ? 'accepted' : 'declined' },
		"Couldn't save your response — try again.",
		fetchFn
	);
}

export async function deleteTask(
	task: ActionTask,
	fetchFn: FetchLike = fetch
): Promise<FamilyTaskActionResult> {
	try {
		const res = await fetchFn(`/api/tasks/${task.id}`, { method: 'DELETE' });
		const j = await res.json().catch((): TaskActionPayload => ({}));
		if (!res.ok)
			return { ok: false, error: j.error || `Couldn't delete "${task.title}" — try again.` };
		return { ok: true, task: rowFrom(j, task.id) };
	} catch {
		return { ok: false, error: `Couldn't delete "${task.title}" — check your connection.` };
	}
}

export function nameOf(
	first: string | null | undefined,
	last: string | null | undefined,
	fallback: string
): string {
	const n = [first, last].filter(Boolean).join(' ').trim();
	return n || fallback;
}

/** True when the task has a tag starting with the filter (case-insensitive). */
export function matchesTagFilter(task: { tags?: string[] | null }, tagFilter: string): boolean {
	const q = tagFilter.trim().toLowerCase();
	if (!q) return true;
	return (task.tags ?? []).some((tag) => tag.toLowerCase().startsWith(q));
}
