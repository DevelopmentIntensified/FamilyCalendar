/**
 * access redirect rules: the ONE post-auth `?redirect=` sanitiser, shared by
 * link issuance (signed into the JWT) and the callback (re-sanitised from the
 * signed payload). Only a same-origin relative path survives: it must start
 * with a single `/`, carry no `//` (browsers read `/\` as `//`), no backslash,
 * and no control characters or encoded CR/LF. Anything else lands on the
 * fallback.
 *
 * Ported verbatim from legacy `safeRedirectPath`
 * (`src/lib/utils/safeRedirect.ts:7-19`). Two landing paths are deliberate:
 * the page flows fall back to `/calendar`, the emailed link to `/calendar/`
 * (`magicLink.ts:46-57`). Nothing here reads the clock or the environment.
 *
 * Doc: ./README.md#invariants
 */
export const CALENDAR_LANDING_PATH = '/calendar';

/** The email-link callback's fallback (legacy `magicLinkRedirectPath`). */
export const EMAIL_LINK_LANDING_PATH = '/calendar/';

/** True for a C0/C1 control character or DEL (typed or percent-encoded). */
function hasControlCharacter(value: string): boolean {
	for (const character of value) {
		const code = character.codePointAt(0) ?? 0;
		if (code < 0x20 || code === 0x7f) return true;
	}
	return false;
}

/**
 * The post-auth landing path: `raw` when it is a safe same-origin relative
 * path, `fallback` otherwise. A non-string reads as "unsafe" (legacy
 * `typeof raw !== 'string'`).
 */
export function authRedirectTarget(raw: unknown, fallback = CALENDAR_LANDING_PATH): string {
	if (typeof raw !== 'string' || !raw.startsWith('/')) return fallback;
	if (raw.startsWith('//') || raw.includes('\\')) return fallback;
	if (hasControlCharacter(raw) || /%0[0-9a-f]|%1[0-9a-f]|%7f/i.test(raw)) return fallback;
	try {
		const base = 'http://same.origin.invalid';
		const url = new URL(raw, base);
		if (url.origin !== base) return fallback;
		return url.pathname + url.search + url.hash;
	} catch {
		return fallback;
	}
}

/** The magic-link callback's landing path; falls back to `/calendar/`. */
export function emailLinkRedirectPath(redirectTo: unknown): string {
	return authRedirectTarget(redirectTo, EMAIL_LINK_LANDING_PATH);
}
