/**
 * The add-member routes answer `{ error }` on a handled failure, but a thrown
 * server error reaches the client as SvelteKit's `{ message }` with a non-2xx
 * status — which the tabs used to read as success (issue 250).
 *
 * Returns the message to show, or `null` when the request succeeded.
 */
export function responseError(
	res: { ok: boolean },
	json: { error?: unknown; message?: unknown } | null | undefined
): string | null {
	if (json?.error) return String(json.error);
	if (!res.ok) {
		return typeof json?.message === 'string' && json.message
			? json.message
			: 'Something went wrong. Please try again.';
	}
	return null;
}
