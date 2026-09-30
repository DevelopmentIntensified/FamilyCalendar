/**
 * The notification vocabulary: the five types the app writes to the
 * free-text `notifications.type` column, their human labels, and the
 * needs-you / just-news split the Alerts feed groups on.
 *
 * Lives outside `$lib/server` on purpose — the type guard runs where rows are
 * decoded (the page load and the API), while the labels and glyphs render in
 * the browser (nav bell and the Alerts page). Both surfaces read the same
 * tables here, so a type cannot be named one way in the bell and another way
 * on the page.
 */

/** The five types the app writes. Anything else in the column is unrecognised. */
export const NOTIFICATION_TYPES = [
	'assignment_pending',
	'assignment_accepted',
	'assignment_declined',
	'task_completed',
	'added_to_family'
] as const;

export type NotificationType = (typeof NOTIFICATION_TYPES)[number];

/**
 * Server-side type guard for the `type` column. The column is free text, so
 * an unrecognised value is a live possibility (a typo from an old deploy, a
 * row written by a newer build) rather than a type error. Nothing downstream
 * reads `type` without passing it through here first.
 */
const KNOWN_TYPES: ReadonlySet<string> = new Set(NOTIFICATION_TYPES);

export function isNotificationType(value: unknown): value is NotificationType {
	return typeof value === 'string' && KNOWN_TYPES.has(value);
}

/**
 * The only two types that want a decision from the reader: someone asked them
 * to take a task, or someone turned one down. The rest just report.
 */
export const DECISION_TYPES: readonly NotificationType[] = [
	'assignment_pending',
	'assignment_declined'
];

const DECISION_TYPE_SET: ReadonlySet<string> = new Set(DECISION_TYPES);

export type NotificationGroup = 'needs_you' | 'news';

/** Which group a type belongs to. An unrecognised type is news, never a decision. */
export function notificationGroup(type: string): NotificationGroup {
	return DECISION_TYPE_SET.has(type) ? 'needs_you' : 'news';
}

const LABELS: Record<NotificationType, string> = {
	assignment_pending: 'Asked you',
	assignment_accepted: 'Accepted',
	assignment_declined: 'Declined',
	task_completed: 'Completed',
	added_to_family: 'Added to family'
};

/** Shown instead of a raw column value, so an unknown type reads as an update. */
export const UNKNOWN_TYPE_LABEL = 'Update';

export function notificationLabel(type: string): string {
	// oxlint-disable-next-line anti-slop/no-known-value-widening -- this IS the I/O boundary; free text is what the guard exists for.
	return isNotificationType(type) ? LABELS[type] : UNKNOWN_TYPE_LABEL;
}

const TONES: Record<NotificationType, string> = {
	assignment_pending: 'bg-blue-100 text-blue-800',
	assignment_accepted: 'bg-emerald-100 text-emerald-800',
	assignment_declined: 'bg-red-100 text-red-800',
	task_completed: 'bg-emerald-100 text-emerald-800',
	added_to_family: 'bg-orange-100 text-orange-800'
};

const GLYPHS: Record<NotificationType, string> = {
	assignment_pending: '?',
	assignment_accepted: '✓',
	assignment_declined: '✕',
	task_completed: '✓',
	added_to_family: '+'
};

export function notificationTone(type: string): string {
	// oxlint-disable-next-line anti-slop/no-known-value-widening -- this IS the I/O boundary; free text is what the guard exists for.
	return isNotificationType(type) ? TONES[type] : 'bg-slate-100 text-slate-600';
}

export function notificationGlyph(type: string): string {
	// oxlint-disable-next-line anti-slop/no-known-value-widening -- this IS the I/O boundary; free text is what the guard exists for.
	return isNotificationType(type) ? GLYPHS[type] : '•';
}

/** A decoded notification row, guarded and ready to render. */
export interface NotificationRow {
	id: string;
	/** The known type, or null when the column held something unrecognised. */
	type: NotificationType | null;
	/** Exactly what the column said — kept so a bad row renders honestly. */
	rawType: string;
	/** Carried on the row so no surface can group it differently. */
	group: NotificationGroup;
	actorName: string;
	message: string;
	link: string | null;
	readAt: string | null;
	createdAt: string;
}

interface DecodedRow {
	id: string;
	type: string;
	actorName: string;
	message: string;
	link?: string | null;
	readAt?: string | null;
	createdAt: string;
}

/**
 * The guard's boundary: narrow `type` for the rest of the app while keeping the
 * row itself. An unrecognised type is kept (dropping a real notification is
 * worse than labelling it vaguely) and lands in news with a generic label.
 */
export function toNotificationRow(row: DecodedRow): NotificationRow {
	const type = isNotificationType(row.type) ? row.type : null;
	return {
		id: row.id,
		type,
		rawType: row.type,
		group: notificationGroup(row.type),
		actorName: row.actorName,
		message: row.message,
		link: row.link ?? null,
		readAt: row.readAt ?? null,
		createdAt: row.createdAt
	};
}

/** Raw `type` values this feed could not name — logged server-side so a bad
 *  write shows up in the server log, not just as a vague chip in the UI. */
export function unrecognisedTypes(rows: NotificationRow[]): string[] {
	return [...new Set(rows.filter((r) => r.type === null).map((r) => r.rawType))];
}

export type NotificationFilter = 'all' | 'needs_you' | 'unread';

export function filterNotifications(
	rows: NotificationRow[],
	filter: NotificationFilter
): NotificationRow[] {
	if (filter === 'all') return rows;
	if (filter === 'needs_you') return rows.filter((r) => r.group === 'needs_you');
	return rows.filter((r) => !r.readAt);
}

export interface NotificationGroups {
	needsYou: NotificationRow[];
	news: NotificationRow[];
}

/** Split a filtered feed into the two sections the page renders, order kept. */
export function groupNotifications(rows: NotificationRow[]): NotificationGroups {
	return {
		needsYou: rows.filter((r) => r.group === 'needs_you'),
		news: rows.filter((r) => r.group === 'news')
	};
}

export interface NotificationCounts {
	all: number;
	needsYou: number;
	unread: number;
}

/** Counts for the filter chips — always over the whole loaded feed, never over
 *  the active filter, so a chip's number does not move when it is tapped. */
export function notificationCounts(rows: NotificationRow[]): NotificationCounts {
	return {
		all: rows.length,
		needsYou: rows.filter((r) => r.group === 'needs_you').length,
		unread: rows.filter((r) => !r.readAt).length
	};
}
