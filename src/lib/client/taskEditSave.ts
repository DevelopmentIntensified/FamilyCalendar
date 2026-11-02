import type { EditDraft } from '$lib/components/tasks/EditTaskDialog.svelte';
import { buildEditPayload, type EditTarget } from '$lib/utils/taskEditPayload';

/**
 * Edit-dialog save (#283), shared by /calendar/tasks and /family/tasks:
 * PUT the edit payload and word the toast that names what happened. Callers
 * own the pending state, closing the dialog and the refresh.
 */
export type TaskEditSaveResult =
	| { ok: true; message: string }
	/** `error` is the bare reason (inline alert); `message` is the toast. */
	| { ok: false; error: string; message: string };

export async function saveTaskEdit(
	task: EditTarget,
	draft: EditDraft,
	currentUserId: string | undefined
): Promise<TaskEditSaveResult> {
	const title = draft.title.trim();
	try {
		const { payload } = buildEditPayload(task, draft, currentUserId);
		const res = await fetch(`/api/tasks/${task.id}`, {
			method: 'PUT',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify(payload)
		});
		const j = await res.json().catch(() => ({}));
		if (res.ok) {
			const saved = typeof j?.task?.title === 'string' && j.task.title ? j.task.title : title;
			return { ok: true, message: `Saved "${saved}".` };
		}
		const reason = typeof j?.error === 'string' && j.error ? j.error : null;
		return {
			ok: false,
			error: reason ?? "That didn't work. Try again.",
			message: `Couldn't save "${title}" — ${reason ?? 'try again.'}`
		};
	} catch {
		return {
			ok: false,
			error: 'Network problem. Try again.',
			message: `Couldn't save "${title}" — check your connection.`
		};
	}
}
