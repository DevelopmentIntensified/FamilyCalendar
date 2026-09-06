/**
 * Plain-text exporters for admin pages (unmatched phrases, bug reports).
 *
 * Both pages render a copyable register (`format...Export`) so the text can be
 * pasted straight into an agent prompt, and offer a `.txt` download via
 * `downloadAsTxt`. Pure functions — usable client-side with no server deps.
 */
import type { UnmatchedPhrase } from '$lib/server/db/schema';
import type { BugReportWithReporter } from '$lib/server/db/actions/bugReports';
import type { UnmatchedSource } from '$lib/server/db/actions/unmatchedPhrases';

export type BugArea = 'calendar' | 'tasks' | 'account' | 'payments' | 'dashboard' | 'other';

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

function isBugArea(area: string): area is BugArea {
	return (
		area === 'calendar' ||
		area === 'tasks' ||
		area === 'account' ||
		area === 'payments' ||
		area === 'dashboard' ||
		area === 'other'
	);
}

function isUnmatchedSource(source: string): source is UnmatchedSource {
	return source === 'event_parse' || source === 'bulk_edit';
}

function isoDate(d: Date): string {
	const date = d instanceof Date && !Number.isNaN(d.getTime()) ? d : new Date(d);
	return date.toISOString().slice(0, 10);
}

function pad(n: number): string {
	return String(n).padStart(2, '0');
}

function humanDate(d: Date): string {
	const date = d instanceof Date && !Number.isNaN(d.getTime()) ? d : new Date(d);
	return (
		`${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ` +
		`${pad(date.getHours())}:${pad(date.getMinutes())}`
	);
}

/** Group a list of rows by a string key, preserving first-seen order. */
function groupBy<T>(rows: T[], key: (row: T) => string): [string, T[]][] {
	const map = new Map<string, T[]>();
	for (const row of rows) {
		const k = key(row);
		const list = map.get(k) ?? [];
		list.push(row);
		map.set(k, list);
	}
	return [...map.entries()];
}

/**
 * JSON value shapes the stored `matched` sample can hold.
 */
type JsonValue = string | number | boolean | null | JsonValue[] | { [key: string]: JsonValue };

/** Scalar JSON field kept in the matched-sample summary. */
type JsonScalar = string | number | boolean;

function isJsonObject(v: unknown): v is Record<string, JsonValue> {
	return typeof v === 'object' && v !== null;
}

function isStringValue(v: JsonValue): v is string {
	return typeof v === 'string';
}

function isNumberValue(v: JsonValue): v is number {
	return typeof v === 'number';
}

function isJsonScalar(v: JsonValue): v is JsonScalar {
	return isStringValue(v) || isNumberValue(v) || v === true || v === false;
}

/**
 * Reduce the stored `matched` JSON string to a small map of non-empty scalar
 * fields, for compact display / export (a single sample per phrase).
 */
export function matchedSummary(matched: string | null): Record<string, JsonScalar> | null {
	if (!matched) return null;
	let parsed: unknown;
	try {
		parsed = JSON.parse(matched);
	} catch {
		return null;
	}
	if (!isJsonObject(parsed)) return null;
	const fields: Record<string, JsonScalar> = {};
	for (const [k, v] of Object.entries(parsed)) {
		if (v === null || v === '' || v === false) continue;
		if (Array.isArray(v)) {
			if (v.length === 0) continue;
			fields[k] = JSON.stringify(v);
		} else if (isJsonScalar(v)) {
			fields[k] = v;
		} else {
			fields[k] = JSON.stringify(v);
		}
	}
	return Object.keys(fields).length ? fields : null;
}

export function reporterName(
	r: Pick<BugReportWithReporter, 'reporterFirstName' | 'reporterLastName'>
): string {
	if (!r.reporterFirstName && !r.reporterLastName) return 'Anonymous / deleted';
	return `${r.reporterFirstName ?? ''} ${r.reporterLastName ?? ''}`.trim() || 'Anonymous / deleted';
}

/**
 * Build a plain-text register of unmatched phrases, grouped by source, ordered
 * by frequency. Intended to be pasted into an agent so it can add parser rules.
 * Open items only — resolved ones stay in the admin UI, not the export.
 */
export function formatUnmatchedPhrasesExport(open: UnmatchedPhrase[]): string {
	const lines: string[] = [];
	lines.push('UNMATCHED PHRASES EXPORT');
	lines.push(`Generated: ${humanDate(new Date())}`);
	lines.push('Instructions the natural-language parsers could not handle.');
	lines.push('');

	const total = open.reduce((n, p) => n + p.count, 0);
	lines.push(`Open: ${open.length} unique (${total} occurrences)`);
	lines.push('='.repeat(60));
	lines.push('');

	for (const [source, phrases] of groupBy(open, (p) => p.source)) {
		lines.push(
			`## ${isUnmatchedSource(source) ? UNMATCHED_SOURCE_LABEL[source] : source} (${phrases.length})`
		);
		for (const p of phrases) {
			const matched = matchedSummary(p.matched);
			const matchedText = matched ? ` matched: ${JSON.stringify(matched)}` : '';
			lines.push(`- "${p.phrase}" — ${p.count}x, first seen ${isoDate(p.createdAt)}${matchedText}`);
		}
		lines.push('');
	}

	return lines.join('\n');
}

/**
 * Build a plain-text register of open bug reports, meant to be handed to an
 * agent for triage / issue filing. Open items only, no reporter names.
 */
export function formatBugReportsExport(open: BugReportWithReporter[]): string {
	const lines: string[] = [];
	lines.push('BUG REPORTS EXPORT');
	lines.push(`Generated: ${humanDate(new Date())}`);
	lines.push('User-submitted bug reports, newest first.');
	lines.push('');
	lines.push(`Open: ${open.length}`);
	lines.push('='.repeat(60));
	lines.push('');

	const render = (r: BugReportWithReporter) => {
		const meta = [r.url ? `page: ${r.url}` : 'page: n/a', humanDate(r.createdAt)];
		return (
			`- [${isBugArea(r.area) ? BUG_AREA_LABEL[r.area] : r.area}] ${r.description.replace(/\s*\n+/g, ' ').trim()}` +
			`  (${meta.join(' · ')})`
		);
	};

	if (open.length > 0) {
		lines.push('## Open');
		for (const r of open) lines.push(render(r));
		lines.push('');
	}

	return lines.join('\n');
}

/** Trigger a client-side download of `content` as a UTF-8 .txt file. */
export function downloadAsTxt(filename: string, content: string): void {
	const blob = new Blob([content], { type: 'text/plain;charset=utf-8' });
	const url = URL.createObjectURL(blob);
	const a = document.createElement('a');
	a.href = url;
	a.download = filename;
	document.body.appendChild(a);
	a.click();
	a.remove();
	URL.revokeObjectURL(url);
}
