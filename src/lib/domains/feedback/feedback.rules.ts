/**
 * feedback rules: the two closed vocabularies and their labels, the phrase
 * normalizer, the auto-filing policy (`buildAutoBugReport`) and the issue-257
 * reported-page normalizer.
 *
 * Nothing here reads the clock, the environment or the database: "now" and the
 * origin are parameters (rule R5/R4). The 10-minute auto-file throttle is not
 * a rule — it is `ctx.limiter` in the service — because a module-scope map is
 * unbounded and resets on every deploy (legacy `autoBugReport.ts:10`).
 *
 * Doc: ./README.md#invariants
 */
import type { BugArea, BugReportInput, UnmatchedSource } from './feedback.contract';

/**
 * The bug areas in wire order. The admin export text and the `/report-bug`
 * form both follow this order; the wire error copy lists it verbatim.
 */
export const BUG_AREAS = ['calendar', 'tasks', 'account', 'payments', 'dashboard', 'other'] as const;

/** The parsers that report phrases they could not match. */
export const UNMATCHED_SOURCES = ['event_parse', 'bulk_edit'] as const;

/** The plain labels the export text and the register chips use. */
export const BUG_AREA_LABEL: Record<BugArea, string> = {
	calendar: 'Calendar',
	tasks: 'Tasks',
	account: 'Account',
	payments: 'Payments',
	dashboard: 'Dashboard',
	other: 'Other'
};

export const UNMATCHED_SOURCE_LABEL: Record<UnmatchedSource, string> = {
	event_parse: 'Event parse',
	bulk_edit: 'Bulk edit'
};

const MAX_DESCRIPTION = 5000;
const MAX_URL = 2000;
const MAX_PHRASE = 280;
const MAX_REPORTED_PATH = 500;
const REPORT_PATH = '/report-bug';

/** Case-sensitive: `Tasks` is not an area, and must not be folded into one. */
export function isBugArea(area: string): area is BugArea {
	return BUG_AREAS.some((candidate) => candidate === area);
}

export function isUnmatchedSource(source: string): source is UnmatchedSource {
	return source === 'event_parse' || source === 'bulk_edit';
}

/**
 * Deduplication key for a reported phrase: lowercase, collapse whitespace
 * runs, trim, then cap at 280. Empty means "nothing to store".
 */
export function normalizePhrase(phrase: string): string {
	return phrase.toLowerCase().replace(/\s+/g, ' ').trim().slice(0, MAX_PHRASE);
}

/** An area the writer can store: anything outside the vocabulary becomes `other`. */
export function bugAreaOf(area: string): BugArea {
	return isBugArea(area) ? area : 'other';
}

/**
 * The write shape of a bug report as a second line of defence behind the
 * boundary schemas: an unknown area becomes `other`, the description is
 * trimmed and capped at 5000 (blank → nothing), the url is trimmed, capped at
 * 2000 and blank → `null`.
 */
export function bugReportDraft(input: {
	readonly area: string;
	readonly description: string;
	readonly url?: string | null;
}): BugReportInput | null {
	const description = input.description.trim().slice(0, MAX_DESCRIPTION);
	if (!description) return null;
	const url = (input.url ?? '').trim().slice(0, MAX_URL);
	return { area: bugAreaOf(input.area), description, url: url || null };
}

/** What the fault port knows about the failure that was caught. */
export type AutoBugReportInput = {
	readonly status: number;
	/** The thrown error's `name`; `AbortError` is a client cancel, never filed (#049). */
	readonly name: string | null;
	readonly message: string;
	readonly path: string;
};

/**
 * The auto-filed report for a truly unexpected failure, or null when it is not
 * worth an admin's time: 404s, blank messages and client aborts are skipped.
 * The description is `[auto-filed <status>] <message>` capped at 5000, the url
 * is the path capped at 2000, and the area comes from the path.
 */
export function buildAutoBugReport(input: AutoBugReportInput): BugReportInput | null {
	if (input.status === 404) return null;
	if (input.name === 'AbortError') return null;
	const message = input.message.trim();
	if (!message) return null;
	return bugReportDraft({
		area: areaForPath(input.path),
		description: `[auto-filed ${input.status}] ${message}`,
		url: input.path
	});
}

/**
 * The area an auto-filed report belongs to, by the path that failed.
 * First match wins, in the legacy order: dashboard, calendar, tasks, account.
 */
export function areaForPath(path: string): BugArea {
	if (path.includes('/dashboard')) return 'dashboard';
	if (path.includes('/calendar') || path.startsWith('/api/events')) return 'calendar';
	if (path.includes('/tasks') || path.startsWith('/api/tasks')) return 'tasks';
	if (path.includes('/account') || path.includes('/claim') || path.includes('/login')) {
		return 'account';
	}
	return 'other';
}

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
