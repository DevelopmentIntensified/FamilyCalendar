/**
 * The "report this page" link (issue 257): one rule for the three surfaces
 * that render it — the app chrome (`ShellNavbar`, `ShellErrorView`) and the
 * marketing header — plus the `?from=` normalizer the feedback routes and the
 * bug form's own state read.
 *
 * It lives in kernel, not in feedback, for one measured reason: a module entry
 * is loaded as a whole, and feedback's entry also carries the two register
 * exporters (which format dates, so they import `kernel/time/dates`). Asking
 * for this one sentence through that entry shipped the date library to every
 * page that renders the chrome (ADR 0010). Kernel files are imported directly
 * (R2), so the link costs the two functions it needs.
 *
 * No clock, no environment, no DOM: every input is a parameter (R4/R5).
 *
 * Doc: src/lib/kernel/README.md#ui
 */

/** Where the bug form lives; a reported path already pointing here is refused. */
const REPORT_PATH = '/report-bug';

/** Longest recorded path, so a runaway URL cannot fill the column. */
const MAX_REPORTED_PATH = 500;

/**
 * Link to the bug form carrying the current in-app path as `?from=`.
 * Issue 257: a report must record the page the bug was on, not the form.
 */
export function reportBugHref(currentPath: string | null | undefined): string {
	const from = safeReportedPath(currentPath);
	return from ? `${REPORT_PATH}?from=${encodeURIComponent(from)}` : REPORT_PATH;
}

/**
 * Normalize a reported location to a same-origin path (+search). Accepts a
 * rooted path or an absolute URL on `origin`; rejects other origins,
 * protocol-relative paths, `/\` tricks, bare paths, `javascript:` and the bug
 * form itself. The result is capped at 500 chars.
 */
export function safeReportedPath(raw: string | null | undefined, origin?: string): string {
	if (!raw) return '';
	const value = raw.trim();
	if (!value) return '';
	let path: string;
	if (value.startsWith('/') && !value.startsWith('//') && !value.startsWith('/\\')) {
		path = value;
	} else if (origin) {
		const url = tryAbsoluteUrl(value);
		if (!url || url.origin !== origin) return '';
		path = url.pathname + url.search;
	} else {
		return '';
	}
	if (
		path === REPORT_PATH ||
		path.startsWith(`${REPORT_PATH}?`) ||
		path.startsWith(`${REPORT_PATH}/`)
	) {
		return '';
	}
	return path.slice(0, MAX_REPORTED_PATH);
}

function tryAbsoluteUrl(value: string): URL | null {
	try {
		return new URL(value);
	} catch {
		return null;
	}
}
