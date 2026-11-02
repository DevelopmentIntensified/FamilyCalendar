/** Issue 257: bug reports must record the page the bug was on, not /report-bug. */

const REPORT_PATH = '/report-bug';
const MAX_LEN = 500;

/** Link to the bug form carrying the current in-app path as `?from=`. */
export function reportBugHref(currentPath: string | null | undefined): string {
	const from = safeReportedPath(currentPath);
	return from ? `${REPORT_PATH}?from=${encodeURIComponent(from)}` : REPORT_PATH;
}

/**
 * Normalise a reported location to a same-origin path (+search). Accepts a
 * path or an absolute URL on `origin`; anything else (other origins,
 * protocol-relative, the bug form itself, junk) yields ''.
 */
export function safeReportedPath(raw: string | null | undefined, origin?: string): string {
	if (!raw) return '';
	const value = raw.trim();
	if (!value) return '';
	let path: string;
	if (value.startsWith('/') && !value.startsWith('//') && !value.startsWith('/\\')) {
		path = value;
	} else if (origin) {
		try {
			const u = new URL(value);
			if (u.origin !== origin) return '';
			path = u.pathname + u.search;
		} catch {
			return '';
		}
	} else {
		return '';
	}
	if (
		path === REPORT_PATH ||
		path.startsWith(`${REPORT_PATH}?`) ||
		path.startsWith(`${REPORT_PATH}/`)
	)
		return '';
	return path.slice(0, MAX_LEN);
}
