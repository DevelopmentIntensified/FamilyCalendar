/**
 * Validation primitives: the plain predicates a rules file shares with a
 * service, kept out of `validators.ts` so importing one never pulls the schema
 * library into a browser bundle. `validators.ts` imports them for its zod
 * schemas and re-exports nothing, so there is one home per name.
 *
 * Why the split: `validators.ts` carries zod and luxon at module scope, and a
 * page that asks for one predicate otherwise ships both (`/family` shipped the
 * 25 KB zod chunk for `isEmailAddress` alone — ADR 0010).
 *
 * Doc: src/lib/kernel/README.md#validation
 */

// The email rule the legacy auth flows used (magicLink.ts / mobileAuth.ts copies).
const EMAIL_PATTERN =
	/^(([^<>()[\]\\.,;:\s@"]+(\.[^<>()[\]\\.,;:\s@"]+)*)|(".+"))@((\[[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}])|(([a-zA-Z\-0-9]+\.)+[a-zA-Z]{2,}))$/;

export function isEmailAddress(text: string): boolean {
	return EMAIL_PATTERN.test(text);
}

/** `yyyy-MM-dd`, the only shape `isCalendarDate` looks at. */
const CALENDAR_DATE = /^(\d{4})-(\d{2})-(\d{2})$/;

/** Month lengths for a common year, 1-based (index 0 = January). */
const MONTH_LENGTHS = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31] as const;

/**
 * `yyyy-MM-dd` naming a day that actually exists — no `2026-02-30`, no month
 * 13, no day 0. The luxon-era rule (`DateTime.fromISO` valid) as field
 * arithmetic, so a date check does not pull the date library into a bundle
 * that only wanted the predicate.
 */
export function isCalendarDate(text: string): boolean {
	const match = CALENDAR_DATE.exec(text);
	if (!match) return false;
	const year = Number(match[1]);
	const month = Number(match[2]);
	const day = Number(match[3]);
	if (month < 1 || month > 12 || day < 1) return false;
	const leap = (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
	const length = month === 2 && leap ? 29 : MONTH_LENGTHS[month - 1];
	return day <= length;
}
