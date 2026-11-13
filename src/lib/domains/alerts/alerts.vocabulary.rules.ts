/**
 * alerts vocabulary rules: the closed Alert type set and everything that is a
 * property of a type — its group, label, tone and glyph — plus the boundary
 * that turns a stored row into a feed row.
 *
 * `notifications.type` is free text, so every function here takes a plain
 * `string` and must cope with a value nobody wrote: an unrecognised type is
 * kept as news, labelled "Update", and never claims a decision.
 *
 * Nothing here reads the clock, the environment or the database. The words are
 * CONTEXT.md's: an Alert, the needs-you / news split, a closed type set.
 *
 * Doc: ./README.md#invariants
 */
import type { AlertGroup, AlertRow, AlertType, StoredAlertRow } from './alerts.contract';

/** The five types the app writes. Anything else in the column is unrecognised. */
export const ALERT_TYPES = [
	'assignment_pending',
	'assignment_accepted',
	'assignment_declined',
	'task_completed',
	'added_to_family'
] as const;

/**
 * The guard for the free-text `type` column: rejects non-strings, case
 * variants and anything outside the five. Nothing reads `type` without it.
 */
export function isAlertType(value: unknown): value is AlertType {
	return ALERT_TYPES.some((type) => type === value);
}

/**
 * The only two types that want a decision from the reader: someone asked them
 * to take a task, or someone turned one down. The rest just report.
 */
export const DECISION_TYPES: readonly AlertType[] = [
	'assignment_pending',
	'assignment_declined'
];

/** The two feed sections, in the order the page renders them. */
export const ALERT_GROUPS = ['needs_you', 'news'] as const;

/** Which group a type belongs to. An unrecognised type is news, never a decision. */
export function alertGroup(type: string): AlertGroup {
	return DECISION_TYPES.some((decision) => decision === type) ? 'needs_you' : 'news';
}

const LABELS: Record<AlertType, string> = {
	assignment_pending: 'Asked you',
	assignment_accepted: 'Accepted',
	assignment_declined: 'Declined',
	task_completed: 'Completed',
	added_to_family: 'Added to family'
};

/** Shown instead of a raw column value, so an unknown type reads as an update. */
export const UNKNOWN_ALERT_LABEL = 'Update';

export function alertLabel(type: string): string {
	// oxlint-disable-next-line anti-slop/no-known-value-widening -- this IS the I/O boundary; free text is what the guard exists for.
	return isAlertType(type) ? LABELS[type] : UNKNOWN_ALERT_LABEL;
}

const TONES: Record<AlertType, string> = {
	assignment_pending: 'bg-blue-100 text-blue-800',
	assignment_accepted: 'bg-emerald-100 text-emerald-800',
	assignment_declined: 'bg-red-100 text-red-800',
	task_completed: 'bg-emerald-100 text-emerald-800',
	added_to_family: 'bg-orange-100 text-orange-800'
};

const GLYPHS: Record<AlertType, string> = {
	assignment_pending: '?',
	assignment_accepted: '✓',
	assignment_declined: '✕',
	task_completed: '✓',
	added_to_family: '+'
};

export function alertTone(type: string): string {
	// oxlint-disable-next-line anti-slop/no-known-value-widening -- this IS the I/O boundary; free text is what the guard exists for.
	return isAlertType(type) ? TONES[type] : 'bg-slate-100 text-slate-600';
}

export function alertGlyph(type: string): string {
	// oxlint-disable-next-line anti-slop/no-known-value-widening -- this IS the I/O boundary; free text is what the guard exists for.
	return isAlertType(type) ? GLYPHS[type] : '•';
}

/**
 * The guard's boundary: narrow `type` for the rest of the app while keeping the
 * row itself. An unrecognised type is kept — dropping a real Alert is worse
 * than labelling it vaguely — and lands in news with a generic label.
 */
export function toAlertRow(row: StoredAlertRow): AlertRow {
	const type = isAlertType(row.type) ? row.type : null;
	return {
		id: row.id,
		type,
		rawType: row.type,
		group: alertGroup(row.type),
		actorName: row.actorName,
		message: row.message,
		link: row.link ?? null,
		readAt: row.readAt ?? null,
		createdAt: row.createdAt
	};
}

/**
 * Raw `type` values this feed could not name — logged server-side so a bad
 * write shows up in the server log, not just as a vague chip in the UI.
 */
export function unrecognisedAlertTypes(rows: readonly AlertRow[]): string[] {
	return [...new Set(rows.filter((row) => row.type === null).map((row) => row.rawType))];
}
