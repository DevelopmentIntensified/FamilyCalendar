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
import type { JsonValue } from '$lib/kernel/validation/validators';
import type {
	BugArea,
	BugReportInput,
	FeedbackBugRegister,
	FeedbackPhraseRegister,
	UnmatchedPhraseView,
	UnmatchedSource
} from './feedback.contract';

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
	return UNMATCHED_SOURCES.some((candidate) => candidate === source);
}

/** The chip and export label for an area; a row outside the vocabulary keeps its raw value. */
export function bugAreaLabel(area: string): string {
	return isBugArea(area) ? BUG_AREA_LABEL[area] : area;
}

/** The section label for a phrase source; an unknown source keeps its raw value. */
export function unmatchedSourceLabel(source: string): string {
	return isUnmatchedSource(source) ? UNMATCHED_SOURCE_LABEL[source] : source;
}

/** Lowercase, collapse whitespace runs, trim — the text the 280 cap applies to. */
function normalizedText(phrase: string): string {
	return phrase.toLowerCase().replace(/\s+/g, ' ').trim();
}

/**
 * Deduplication key for a reported phrase: lowercase, collapse whitespace
 * runs, trim, then cap at 280. Empty means "nothing to store".
 */
export function normalizePhrase(phrase: string): string {
	return normalizedText(phrase).slice(0, MAX_PHRASE);
}

/**
 * Whether a phrase is too long AFTER normalizing (Q-006 answer B): the cap
 * applies to the text that would be stored, so `a` + 280 spaces + `b` fits
 * (it stores `a b`) while 281 letters do not.
 */
export function isPhraseOverCap(phrase: string): boolean {
	return normalizedText(phrase).length > MAX_PHRASE;
}

/** The deduplicated write shape of a reported phrase. */
export type UnmatchedPhraseUpsert = {
	readonly source: UnmatchedSource;
	/** Already normalized: the dedup key with `source`, and the first sample. */
	readonly phrase: string;
	/** JSON text of the parse sample, or null when there is no usable sample. */
	readonly matched: string | null;
};

/**
 * What to store for one reported phrase, or null when the phrase is blank
 * after normalization. Legacy `if (matched)`: a falsy sample — `null`, `0`,
 * `false` and `''` — is "no sample", so it stores `NULL` and a repeat leaves
 * any previously stored sample alone.
 */
export function unmatchedPhraseUpsert(
	source: UnmatchedSource,
	phrase: string,
	matched?: JsonValue | null
): UnmatchedPhraseUpsert | null {
	const normalized = normalizePhrase(phrase);
	if (!normalized) return null;
	return { source, phrase: normalized, matched: matched ? JSON.stringify(matched) : null };
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
	const message = input.message.trim();
	if (!message) return null;
	// Client-cancelled navigations/fetches surface as errors mentioning "abort"
	// with status 500 — not app bugs. Never file them (#049). Legacy parity:
	// the match is the message, because #049's noise came through as `Error`.
	if (/abort/i.test(message)) return null;
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

/**
 * Group a phrase register by source, first-seen order kept: the admin tables
 * render one section per source, as legacy `groupBySource` did.
 */
export function groupUnmatchedPhrases(
	phrases: readonly UnmatchedPhraseView[]
): [string, UnmatchedPhraseView[]][] {
	const groups = new Map<string, UnmatchedPhraseView[]>();
	for (const phrase of phrases) {
		const list = groups.get(phrase.source) ?? [];
		list.push(phrase);
		groups.set(phrase.source, list);
	}
	return [...groups.entries()];
}

/**
 * Optimistic resolve for the bug register: the row leaves `open` and appears
 * at the top of `resolved` as `resolved` at the caller's `now`. An id that is
 * not open changes nothing (the server's 404 is the caller's to report).
 */
export function markBugReportResolved(
	register: FeedbackBugRegister,
	id: string,
	now: Date
): FeedbackBugRegister {
	const row = register.open.find((report) => report.id === id);
	if (!row) return register;
	return {
		open: register.open.filter((report) => report.id !== id),
		resolved: [{ ...row, status: 'resolved', resolvedAt: now }, ...register.resolved]
	};
}

/** The phrase-register twin: `resolved: true` and `updatedAt` at the caller's `now`. */
export function markUnmatchedPhraseResolved(
	register: FeedbackPhraseRegister,
	id: string,
	now: Date
): FeedbackPhraseRegister {
	const row = register.open.find((phrase) => phrase.id === id);
	if (!row) return register;
	return {
		open: register.open.filter((phrase) => phrase.id !== id),
		resolved: [{ ...row, resolved: true, updatedAt: now }, ...register.resolved]
	};
}
