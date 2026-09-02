/**
 * Plain-text exporters for admin pages (unmatched phrases, bug reports).
 *
 * Both pages render a copyable register (`format...Export`) so the text can be
 * pasted straight into an agent prompt, and offer a `.txt` download via
 * `downloadAsTxt`. Pure functions — usable client-side with no server deps.
 */
import type { UnmatchedPhrase } from '$lib/server/db/schema';
import type { BugReportWithReporter } from '$lib/server/db/actions/bugReports';

export const BUG_AREA_LABEL: Record<string, string> = {
	calendar: 'Calendar',
	tasks: 'Tasks',
	account: 'Account',
	payments: 'Payments',
	dashboard: 'Dashboard',
	other: 'Other'
};

export const UNMATCHED_SOURCE_LABEL: Record<string, string> = {
	event_parse: 'Event parse',
	bulk_edit: 'Bulk edit'
};

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
function groupBy<K, T>(rows: T[], key: (row: T) => string): [string, T[]][] {
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
 * Reduce the stored `matched` JSON string to a small map of non-empty scalar
 * fields, for compact display / export (a single sample per phrase).
 */
export function matchedSummary(matched: string | null): Record<string, unknown> | null {
	if (!matched) return null;
	try {
		const parsed = JSON.parse(matched) as Record<string, unknown>;
		const fields: Record<string, unknown> = {};
		for (const [k, v] of Object.entries(parsed)) {
			if (v === null || v === undefined || v === '' || v === false) continue;
			if (Array.isArray(v) && v.length === 0) continue;
			fields[k] = typeof v === 'object' ? JSON.stringify(v) : v;
		}
		return Object.keys(fields).length ? fields : null;
	} catch {
		return null;
	}
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
 */
export function formatUnmatchedPhrasesExport(
	open: UnmatchedPhrase[],
	resolved: UnmatchedPhrase[]
): string {
	const lines: string[] = [];
	lines.push('UNMATCHED PHRASES EXPORT');
	lines.push(`Generated: ${humanDate(new Date())}`);
	lines.push('Instructions the natural-language parsers could not handle.');
	lines.push('');

	const total = open.reduce((n, p) => n + p.count, 0);
	lines.push(`Open: ${open.length} unique (${total} occurrences)`);
	lines.push(`Resolved: ${resolved.length}`);
	lines.push('='.repeat(60));
	lines.push('');

	for (const [source, phrases] of groupBy(open, (p) => p.source)) {
		lines.push(`## ${UNMATCHED_SOURCE_LABEL[source] ?? source} (${phrases.length})`);
		for (const p of phrases) {
			const matched = matchedSummary(p.matched);
			const matchedText = matched ? ` matched: ${JSON.stringify(matched)}` : '';
			lines.push(`- "${p.phrase}" — ${p.count}x, first seen ${isoDate(p.createdAt)}${matchedText}`);
		}
		lines.push('');
	}

	if (resolved.length > 0) {
		lines.push('## Resolved');
		for (const p of resolved) {
			lines.push(`- "${p.phrase}" — ${p.count}x (${UNMATCHED_SOURCE_LABEL[p.source] ?? p.source})`);
		}
	}

	return lines.join('\n');
}

/**
 * Build a plain-text register of bug reports (open then resolved), meant to be
 * handed to an agent for triage / issue filing.
 */
export function formatBugReportsExport(
	open: BugReportWithReporter[],
	resolved: BugReportWithReporter[]
): string {
	const lines: string[] = [];
	lines.push('BUG REPORTS EXPORT');
	lines.push(`Generated: ${humanDate(new Date())}`);
	lines.push('User-submitted bug reports, newest first.');
	lines.push('');
	lines.push(`Open: ${open.length}`);
	lines.push(`Resolved: ${resolved.length}`);
	lines.push('='.repeat(60));
	lines.push('');

	const render = (r: BugReportWithReporter) => {
		const meta = [
			`by ${reporterName(r)}`,
			r.url ? `page: ${r.url}` : 'page: n/a',
			humanDate(r.createdAt)
		];
		return (
			`- [${BUG_AREA_LABEL[r.area] ?? r.area}] ${r.description.replace(/\s*\n+/g, ' ').trim()}` +
			`  (${meta.join(' · ')})`
		);
	};

	if (open.length > 0) {
		lines.push('## Open');
		for (const r of open) lines.push(render(r));
		lines.push('');
	}

	if (resolved.length > 0) {
		lines.push('## Resolved');
		for (const r of resolved) lines.push(render(r));
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
