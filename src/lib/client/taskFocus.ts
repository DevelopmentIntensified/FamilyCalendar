/**
 * TaskFocus start/stop (#315): the same device-channel body the phone
 * enqueues (#290), `{"command":"start","taskId"}` / `{"command":"stop"}`.
 * The desktop clock owns `focusStartedAt`/`focusMinutes`; this only asks it
 * to switch, so callers re-read tasks afterwards instead of guessing minutes.
 */

/** The desktop polls its queue within seconds; the phone waits 4 s too (#290). */
export const FOCUS_SETTLE_MS = 4_000;

export type FocusCommandResult =
	| { ok: true; message: string }
	/** `error` is the bare reason for the inline alert. */
	| { ok: false; error: string };

export async function sendFocusCommand(
	taskId: string,
	stop: boolean
): Promise<FocusCommandResult> {
	try {
		const res = await fetch('/api/taskfocus/commands', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify(stop ? { command: 'stop' } : { command: 'start', taskId })
		});
		if (!res.ok) {
			// 404/405 = a server without the command channel (same read as the
			// phone's ApiError.Unsupported): say so, don't show "Task not found".
			if (res.status === 404 || res.status === 405) {
				return { ok: false, error: "This server can't start focus yet." };
			}
			const j = await res.json().catch(() => ({}));
			const reason = typeof j?.error === 'string' && j.error ? j.error : null;
			return { ok: false, error: reason ?? "That didn't work. Try again." };
		}
		return {
			ok: true,
			message: stop ? 'Asked TaskFocus to stop focus.' : 'Asked TaskFocus to start focus.'
		};
	} catch {
		return { ok: false, error: 'Network problem. Try again.' };
	}
}
