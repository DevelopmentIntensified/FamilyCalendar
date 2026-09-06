/**
 * Narrowing predicates for values decoded at their I/O boundary.
 *
 * These are named so call sites branch on the decoded contract (`v is string`)
 * instead of inlining representation probes; `no-runtime-typeof` exempts them.
 */

/** True for ISO date/time strings — the `Date | string` union's string arm. */
export function isDateString(value: unknown): value is string {
	return typeof value === 'string';
}

/** True for non-empty strings — decoded JSON payloads must prove content. */
export function isNonEmptyString(value: unknown): value is string {
	return typeof value === 'string' && value.length > 0;
}
