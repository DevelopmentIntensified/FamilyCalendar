/**
 * Composite occurrence ids look like `{masterId}~{occurrenceISO}`.
 * Returns the bare master id. Event ids are lucia `generateId(15)`
 * strings or crypto uuids - anything alphanumeric of sane length.
 */
export function resolveMasterId(rawId: unknown): string | null {
	const master = String(rawId ?? '')
		.split('~')[0]
		.trim();
	return /^[A-Za-z0-9_-]{5,64}$/.test(master) ? master : null;
}
