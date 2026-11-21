/**
 * The agent-ready export text for the two admin registers, plus the small
 * display reductions behind it (`matchedSummary`, `reporterName`).
 *
 * Dates come from `kernel/time` (K-06), never from a private formatter: the
 * caller passes `now` and the zone (rule R5), so the text is reproducible and
 * the API and the page produce byte-identical output.
 *
 * Both exporters cover **open items only** — the resolved rows stay in the
 * admin UI — and neither ever prints a reporter name.
 *
 * Doc: ./README.md#invariants
 */
import { dayKey, formatDateTimeMinute } from '$lib/kernel/time/dates';
import type { BugReportWithReporter, UnmatchedPhraseView } from './feedback.contract';
import { bugAreaLabel, unmatchedSourceLabel } from './feedback.rules';

const RULE = '='.repeat(60);

/** Scalar JSON field kept in the matched-sample summary. */
type JsonScalar = string | number | boolean;

function isJsonObject(value: unknown): value is Record<string, unknown> {
	return typeof value === 'object' && value !== null;
}

function isJsonScalar(value: unknown): value is JsonScalar {
	return (
		typeof value === 'string' ||
		typeof value === 'number' ||
		value === true ||
		value === false
	);
}

/** Group rows by a string key, preserving first-appearance order. */
function groupBy<T>(rows: readonly T[], keyOf: (row: T) => string): [string, T[]][] {
	const groups = new Map<string, T[]>();
	for (const row of rows) {
		const key = keyOf(row);
		const group = groups.get(key);
		if (group) group.push(row);
		else groups.set(key, [row]);
	}
	return [...groups.entries()];
}

/**
 * Reduce the stored `matched` JSON text to a small map of non-empty scalar
 * fields, for compact display and export. Nested values are stringified;
 * `null`, `''`, `false` and empty arrays are dropped. Null for absent or
 * invalid JSON, and for a sample with nothing populated.
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
	for (const [key, value] of Object.entries(parsed)) {
		if (value === null || value === '' || value === false) continue;
		if (Array.isArray(value)) {
			if (value.length === 0) continue;
			fields[key] = JSON.stringify(value);
		} else if (isJsonScalar(value)) {
			fields[key] = value;
		} else {
			fields[key] = JSON.stringify(value);
		}
	}
	return Object.keys(fields).length ? fields : null;
}

/** The reporter's display name; a reporter with no names (or deleted) is Anonymous. */
export function reporterName(
	row: Pick<BugReportWithReporter, 'reporterFirstName' | 'reporterLastName'>
): string {
	if (!row.reporterFirstName && !row.reporterLastName) return 'Anonymous / deleted';
	return `${row.reporterFirstName ?? ''} ${row.reporterLastName ?? ''}`.trim() || 'Anonymous / deleted';
}

/**
 * Build the plain-text register of unmatched phrases: grouped by source,
 * one line per phrase with its frequency, first-seen date and match sample.
 * Intended to be pasted into an agent so it can add parser rules.
 */
export function formatUnmatchedPhrasesExport(
	open: readonly UnmatchedPhraseView[],
	now: Date,
	zone: string
): string {
	const lines: string[] = [];
	lines.push('UNMATCHED PHRASES EXPORT');
	lines.push(`Generated: ${formatDateTimeMinute(now, zone)}`);
	lines.push('Instructions the natural-language parsers could not handle.');
	lines.push('');

	const total = open.reduce((count, phrase) => count + phrase.count, 0);
	lines.push(`Open: ${open.length} unique (${total} occurrences)`);
	lines.push(RULE);
	lines.push('');

	for (const [source, phrases] of groupBy(open, (phrase) => phrase.source)) {
		const label = unmatchedSourceLabel(source);
		lines.push(`## ${label} (${phrases.length})`);
		for (const phrase of phrases) {
			const matched = matchedSummary(phrase.matched);
			const matchedText = matched ? ` matched: ${JSON.stringify(matched)}` : '';
			const firstSeen = dayKey(phrase.createdAt, zone);
			lines.push(`- "${phrase.phrase}" — ${phrase.count}x, first seen ${firstSeen}${matchedText}`);
		}
		lines.push('');
	}

	return lines.join('\n');
}

/**
 * Build the plain-text register of open bug reports, newest first as the query
 * returned them. Newlines in a description collapse to spaces, and the page is
 * printed as `n/a` when absent.
 */
export function formatBugReportsExport(
	open: readonly BugReportWithReporter[],
	now: Date,
	zone: string
): string {
	const lines: string[] = [];
	lines.push('BUG REPORTS EXPORT');
	lines.push(`Generated: ${formatDateTimeMinute(now, zone)}`);
	lines.push('User-submitted bug reports, newest first.');
	lines.push('');
	lines.push(`Open: ${open.length}`);
	lines.push(RULE);
	lines.push('');

	if (open.length > 0) {
		lines.push('## Open');
		for (const report of open) {
			const area = bugAreaLabel(report.area);
			const description = report.description.replace(/\s*\n+/g, ' ').trim();
			const page = report.url ? `page: ${report.url}` : 'page: n/a';
			const date = formatDateTimeMinute(report.createdAt, zone);
			lines.push(`- [${area}] ${description}  (${page} · ${date})`);
		}
		lines.push('');
	}

	return lines.join('\n');
}
