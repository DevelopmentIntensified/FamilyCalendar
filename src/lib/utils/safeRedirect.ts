/**
 * Post-auth `?redirect=` target (#244), open-redirect safe: only a
 * same-origin relative path — starts with a single `/`, no `//` or
 * backslash (browsers treat `/\` as `//`), no control characters or
 * encoded CR/LF. Anything else falls back.
 */
export function safeRedirectPath(raw: string | null | undefined, fallback = '/calendar'): string {
	if (typeof raw !== 'string' || !raw.startsWith('/')) return fallback;
	if (raw.startsWith('//') || raw.includes('\\')) return fallback;
	// eslint-disable-next-line no-control-regex -- rejecting control chars is the point.
	if (/[\u0000-\u001f\u007f]/.test(raw) || /%0[0-9a-f]|%1[0-9a-f]|%7f/i.test(raw)) return fallback;
	try {
		const base = 'http://same.origin.invalid';
		const url = new URL(raw, base);
		if (url.origin !== base) return fallback;
		return url.pathname + url.search + url.hash;
	} catch {
		return fallback;
	}
}
