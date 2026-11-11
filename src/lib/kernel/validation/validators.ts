/**
 * Boundary validation: zod plus the shared primitives every module reuses.
 * One home for the checks that were hand-copied across routes (isString x10,
 * EMAIL_REGEX x3, YYYY-MM(-DD) regex x4, readJsonObject, clampCount).
 *
 * Rules (docs/architecture/conventions.md#validation):
 * - Parse external input ONCE at the boundary (endpoint/formAction/pageLoad),
 *   then pass typed values inward. Services never see raw JSON.
 * - Error messages are user-facing copy and part of the contract: keep the
 *   legacy wording when porting an endpoint (golden tests pin it).
 *
 * Doc: src/lib/kernel/README.md#validation
 */
import { DateTime } from 'luxon';
import { z } from 'zod';

export { z };

/** Any value JSON.parse can produce. */
export type JsonValue =
	| string
	| number
	| boolean
	| null
	| readonly JsonValue[]
	| { readonly [key: string]: JsonValue };

/** Trimmed, non-empty text. `message` covers missing, non-string and blank. */
export function requiredText(message: string) {
	return z.string({ error: message }).trim().min(1, { error: message });
}

/** Trimmed text that may be absent: '' / null / undefined all become null. */
export function optionalText() {
	return z.preprocess((value) => (isBlank(value) ? null : value), z.string().trim().nullable());
}

/** Calendar date `YYYY-MM-DD` that actually exists (no Feb 30). */
export function isoDate(message = 'Invalid date') {
	return z
		.string({ error: message })
		.regex(/^\d{4}-\d{2}-\d{2}$/, { error: message })
		.refine((value) => DateTime.fromISO(value).isValid, { error: message });
}

/** Month `YYYY-MM`. */
export function yearMonth(message = 'Invalid month') {
	return z.string({ error: message }).regex(/^\d{4}-(0[1-9]|1[0-2])$/, { error: message });
}

/** ISO date or date-time accepted by luxon (the legacy `DateTime.fromISO(x).isValid` rule). */
export function isoInstant(message = 'Invalid date') {
	return z.string({ error: message }).refine((value) => DateTime.fromISO(value).isValid, {
		error: message
	});
}

// The email rule the legacy auth flows used (magicLink.ts / mobileAuth.ts copies).
const EMAIL_PATTERN =
	/^(([^<>()[\]\\.,;:\s@"]+(\.[^<>()[\]\\.,;:\s@"]+)*)|(".+"))@((\[[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}])|(([a-zA-Z\-0-9]+\.)+[a-zA-Z]{2,}))$/;

export function isEmailAddress(text: string): boolean {
	return EMAIL_PATTERN.test(text);
}

export function emailAddress(message = 'Enter a valid email address') {
	return z.string({ error: message }).trim().refine(isEmailAddress, { error: message });
}

/** One of a closed vocabulary (`as const` array). */
export function oneOf<const T extends readonly [string, ...string[]]>(values: T, message: string) {
	return z.enum(values, { error: message });
}

/** Whole number >= 0 (minutes, counts). */
export function wholeNumber(message: string) {
	return z.number({ error: message }).int({ error: message }).min(0, { error: message });
}

/** Form fields arrive as one string or many; always hand the schema an array. */
export function formList<S extends z.ZodType>(item: S) {
	return z.preprocess(
		(value) =>
			value === undefined || value === null ? [] : Array.isArray(value) ? value : [value],
		z.array(item)
	);
}

/** Clamp to [min, max]; non-numbers become `fallback`. Replaces legacy clampCount. */
export function clampedInt(min: number, max: number, fallback: number) {
	return z.preprocess((value) => {
		const n = isText(value) ? Number.parseInt(value, 10) : value;
		if (!isFiniteNumber(n)) return fallback;
		return Math.min(max, Math.max(min, Math.trunc(n)));
	}, z.number().int());
}

/** The message the HTTP builders put in `{ error }` for a failed parse. */
export function firstIssueMessage(error: z.ZodError): string {
	return error.issues[0]?.message ?? 'Invalid input';
}

function isBlank(value: unknown): value is '' | null | undefined {
	return (
		value === undefined || value === null || (typeof value === 'string' && value.trim() === '')
	);
}

function isText(value: unknown): value is string {
	return typeof value === 'string';
}

function isFiniteNumber(value: unknown): value is number {
	return typeof value === 'number' && Number.isFinite(value);
}
