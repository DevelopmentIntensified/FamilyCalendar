/**
 * TaskFocus focusStartedAt (022) request-body parser, shared by POST and PUT.
 *
 * Unlike focusMinutes, an explicit null is a value: the desktop sends
 * `focusStartedAt: null` on stop, and that must clear the stamp. So:
 * absent → `undefined` (leave stored value), null → `null` (clear),
 * parseable string → Date (overwrite), anything else → invalid.
 */
export type FocusStartedAtParse = { ok: true; value: Date | null | undefined } | { ok: false };

export function parseFocusStartedAt(body: Record<string, unknown>): FocusStartedAtParse {
	if (!('focusStartedAt' in body) || body.focusStartedAt === undefined) {
		return { ok: true, value: undefined };
	}
	const raw = body.focusStartedAt;
	if (raw === null) return { ok: true, value: null };
	if (typeof raw !== 'string') return { ok: false };
	const ms = Date.parse(raw);
	return Number.isNaN(ms) ? { ok: false } : { ok: true, value: new Date(ms) };
}
