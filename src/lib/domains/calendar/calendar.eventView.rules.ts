/**
 * The event detail region's pure half: the view shape the module's components
 * take, the words on screen, the attendance buckets, the duplicate payload and
 * the recurring-series facts. Ported from `EventDetailList.svelte`,
 * `EventAttendeeGroups.svelte` (its module half), `EventRecurrenceCard.svelte`
 * (`describeSeries`), `utils/attendance.ts` and `utils/eventDuplicate.ts`.
 *
 * Times and dates print on the viewer's own clock (`DateTime` local), exactly
 * like the legacy components: only the server reasons in a stored zone, and
 * `now` arrives as a parameter so no test reads a clock.
 *
 * Doc: ./README.md#invariants
 */
import { DateTime } from 'luxon';
import { nameColor } from '$lib/kernel/ui/colorHash';

/** The contact swatches (rose, amber, emerald, sky, violet, fuchsia, lime, orange). */
const CONTACT_COLOURS = [
	{ bg: '#ffe4e6', text: '#be123c' },
	{ bg: '#fef3c7', text: '#b45309' },
	{ bg: '#d1fae5', text: '#047857' },
	{ bg: '#e0f2fe', text: '#0369a1' },
	{ bg: '#ede9fe', text: '#6d28d9' },
	{ bg: '#fae8ff', text: '#a21caf' },
	{ bg: '#ecfccb', text: '#4d7c0f' },
	{ bg: '#ffedd5', text: '#c2410c' }
];

/**
 * The avatar pair for a contact: kernel's one name hash over the same eight
 * swatches the legacy `getContactColor` used, so a member keeps their colour
 * wherever the app draws them.
 */
export function calendarContactColor(name: string): { bg: string; text: string } {
	return CONTACT_COLOURS[Math.abs(nameColor(name)) % CONTACT_COLOURS.length];
}

/**
 * An event as the modal draws it. Expanded occurrences carry the composite
 * `id` plus `masterId`/`occurrenceDate`; `startTime`/`endTime`/`date` are the
 * legacy display overrides a day-split row can carry.
 */
export interface CalendarEventView {
	readonly id: string;
	readonly masterId?: string | null;
	readonly occurrenceDate?: string | null;
	readonly title: string;
	readonly start: string | Date;
	readonly end?: string | Date | null;
	readonly date?: string | Date | null;
	readonly description?: string | null;
	readonly location?: string | null;
	readonly allDay?: boolean | null;
	readonly calendarId?: string | null;
	readonly calendar?: { readonly name?: string | null; readonly color?: string | null } | null;
	readonly color?: string | null;
	readonly ownerId?: string | null;
	readonly creatorName?: string | null;
	readonly recurrenceFrequency?: string | null;
	readonly recurrenceInterval?: number | null;
	readonly recurrenceByDay?: readonly string[] | null;
	readonly recurrenceCount?: number | null;
	readonly recurrenceUntil?: string | null;
	readonly reminderMinutes?: number | null;
	readonly isAd?: boolean | null;
	/** Pre-rendered `HH:mm` from a day-split row; falls back to `start`. */
	readonly startTime?: string | null;
	readonly endTime?: string | null;
	readonly rsvpStatus?: string | null;
	/** Structured invites, when the caller already loaded them (#274). */
	readonly attendees?: readonly {
		readonly value: string;
		readonly isUser: boolean;
		readonly inviteType?: string | null;
	}[] | null;
}

/** One attendance row: a member when `userId` is set, otherwise a guest name. */
export interface CalendarAttendanceRow {
	readonly userId: string | null;
	readonly status: string | null;
	readonly firstName?: string | null;
	readonly lastName?: string | null;
	readonly name?: string | null;
	readonly inviteType?: string | null;
}

/** A guest with its own status (a name-only caller falls back to `invited`). */
export interface CalendarGuestRow {
	readonly name: string;
	readonly status: string;
	readonly inviteType?: string | null;
}

export interface CalendarAttendanceSplit {
	readonly going: CalendarAttendanceRow[];
	readonly maybe: CalendarAttendanceRow[];
	readonly notGoing: CalendarAttendanceRow[];
	readonly undecided: CalendarAttendanceRow[];
}

/** The legacy `toDate`: a Date passes through, a string is parsed. */
function asDate(value: string | Date | null | undefined): Date | null {
	if (!value) return null;
	const parsed = value instanceof Date ? value : new Date(value);
	return Number.isNaN(parsed.getTime()) ? null : parsed;
}

/** `HH:mm` of an instant on the viewer's clock, or `undefined` when unreadable. */
export function calendarClockTime(value: string | Date | null | undefined): string | undefined {
	const date = asDate(value);
	if (!date) return undefined;
	const dt = DateTime.fromJSDate(date);
	return dt.isValid ? dt.toFormat('HH:mm') : undefined;
}

/** The start time the detail region prints: the row's own override first. */
export function calendarEventStartTime(event: CalendarEventView): string | undefined {
	return event.startTime || calendarClockTime(event.start);
}

/** The end time the detail region prints. */
export function calendarEventEndTime(event: CalendarEventView): string | undefined {
	return event.endTime || calendarClockTime(event.end);
}

/** The day the detail region prints: `date` when the row was split onto one. */
export function calendarEventDay(event: CalendarEventView): Date | undefined {
	if (event.date) return asDate(event.date) ?? undefined;
	return asDate(event.start) ?? undefined;
}

/** `09:00` → `9:00 AM` (the legacy `formatTime`; 12:00 stays PM, 00:00 is 12 AM). */
export function calendarFormatTime(time: string | null | undefined): string {
	if (!time) return '';
	const [hours, minutes] = time.split(':').map(Number);
	const meridiem = hours >= 12 ? 'PM' : 'AM';
	const hour = hours > 12 ? hours - 12 : hours === 0 ? 12 : hours;
	return `${hour}:${String(minutes).padStart(2, '0')} ${meridiem}`;
}

/** `Reminder: 1 hour before` — days, then hours, then minutes; null under 1. */
export function calendarReminderLabel(minutes: number | null | undefined): string | null {
	if (minutes == null || minutes <= 0) return null;
	if (minutes % 1440 === 0) {
		const days = minutes / 1440;
		return days === 1 ? '1 day before' : `${days} days before`;
	}
	if (minutes % 60 === 0) {
		const hours = minutes / 60;
		return hours === 1 ? '1 hour before' : `${hours} hours before`;
	}
	return minutes === 1 ? '1 minute before' : `${minutes} minutes before`;
}

/** The calendar name the detail region prints: the event's own copy first. */
export function calendarNameForEvent(
	event: CalendarEventView,
	calendars: readonly { readonly id: string; readonly name: string }[]
): string {
	return (
		event.calendar?.name ||
		calendars.find((calendar) => calendar.id === event.calendarId)?.name ||
		(event.calendarId ? 'Calendar' : '')
	);
}

/** Bucket attendance rows; an unknown status counts as undecided (#039). */
export function calendarAttendanceSplit(
	rows: readonly CalendarAttendanceRow[]
): CalendarAttendanceSplit {
	const split: {
		going: CalendarAttendanceRow[];
		maybe: CalendarAttendanceRow[];
		notGoing: CalendarAttendanceRow[];
		undecided: CalendarAttendanceRow[];
	} = { going: [], maybe: [], notGoing: [], undecided: [] };
	for (const row of rows) {
		if (row.status === 'going') split.going.push(row);
		else if (row.status === 'maybe') split.maybe.push(row);
		else if (row.status === 'declined' || row.status === 'not_going') split.notGoing.push(row);
		else split.undecided.push(row);
	}
	return split;
}

/**
 * Guests as the attendance region draws them: one row each, carrying its own
 * status. A caller that only knows names falls back to one `invited` row per
 * name, which is what the region rendered before guests had statuses.
 */
export function calendarGuestAttendance(
	guests: readonly CalendarGuestRow[] | null,
	names: readonly string[]
): CalendarGuestRow[] {
	if (guests) {
		return guests.map((guest) => ({
			name: guest.name,
			status: guest.status,
			inviteType: guest.inviteType ?? null
		}));
	}
	return names.map((name) => ({ name, status: 'invited', inviteType: null }));
}

/**
 * Series facts in the prototype's words: the rule being repeated, how far it
 * has got, and the occurrence count. Null when the event does not repeat, its
 * frequency is outside the closed set, or its start cannot be read.
 */
export function calendarSeriesFacts(
	event: CalendarEventView,
	now: DateTime
): { rule: string; since: string; count: number } | null {
	const words = seriesUnit(event.recurrenceFrequency);
	if (!words) return null;
	const start = asDate(event.start);
	if (!start) return null;
	const startDt = DateTime.fromJSDate(start);
	if (!startDt.isValid) return null;

	const interval = Math.max(1, event.recurrenceInterval ?? 1);
	const weekday = startDt.toFormat('cccc');
	const lead = interval === 1 ? `Every ${words.singular}` : `Every ${interval} ${words.plural}`;
	const elapsed = Math.floor(now.diff(startDt, words.unit)[words.unit]);
	const count = elapsed < 0 ? 0 : Math.floor(elapsed / interval) + 1;

	return {
		rule: `${lead} on ${weekday}s`,
		since:
			count === 0
				? `Starts ${startDt.toFormat('LLL d, yyyy')}`
				: `${count} occurrence${count === 1 ? '' : 's'} since ${startDt.toFormat('LLL yyyy')}`,
		count
	};
}

function seriesUnit(
	frequency: string | null | undefined
): { unit: 'days' | 'weeks' | 'months' | 'years'; singular: string; plural: string } | null {
	switch (frequency) {
		case 'daily':
			return { unit: 'days', singular: 'day', plural: 'days' };
		case 'weekly':
			return { unit: 'weeks', singular: 'week', plural: 'weeks' };
		case 'monthly':
			return { unit: 'months', singular: 'month', plural: 'months' };
		case 'yearly':
			return { unit: 'years', singular: 'year', plural: 'years' };
		default:
			return null;
	}
}

/** The delete offer's scope vocabulary: a series opened whole can only go whole. */
export function calendarDeleteScopes(canScopeOccurrence: boolean): ('this' | 'all')[] {
	return canScopeOccurrence ? ['this', 'all'] : ['all'];
}

/**
 * The duplicate payload: `"<title> (copy)"` with the loaded invitation rows —
 * members keep required/optional, guests by name (the server stores guests
 * optional). Ported from `utils/eventDuplicate.ts`.
 */
export function calendarDuplicateBody(
	event: CalendarEventView,
	attendees: readonly CalendarAttendanceRow[],
	guests: readonly string[]
): Record<string, unknown> {
	const attendeePayload = [
		...attendees.flatMap((row) =>
			row.userId
				? [
						{
							value: row.userId,
							isUser: true,
							inviteType: row.inviteType === 'required' ? 'required' : 'optional'
						}
					]
				: []
		),
		...guests.map((name) => ({ value: name, isUser: false, inviteType: 'optional' }))
	];
	const iso = (value: string | Date | null | undefined) =>
		value ? (asDate(value)?.toISOString() ?? null) : null;
	return {
		title: `${event.title} (copy)`,
		start: iso(event.start),
		end: iso(event.end),
		description: event.description || null,
		location: event.location || null,
		allDay: !!event.allDay,
		calendarId: event.calendarId || null,
		recurrenceFrequency: event.recurrenceFrequency ?? null,
		recurrenceInterval: event.recurrenceInterval ?? null,
		recurrenceByDay: event.recurrenceByDay ?? null,
		recurrenceCount: event.recurrenceCount ?? null,
		recurrenceUntil: event.recurrenceUntil ?? null,
		reminderMinutes: event.reminderMinutes ?? null,
		attendees: attendeePayload
	};
}

/** One attendance person as the groups list draws it, bucket included. */
export interface CalendarPerson {
	readonly row: CalendarAttendanceRow;
	readonly name: string;
	readonly bucket: 'going' | 'maybe' | 'declined' | 'pending';
}

/** Everyone the attendance list shows, in the prototype's order. */
export function calendarAttendancePeople(
	split: CalendarAttendanceSplit,
	guests: readonly CalendarGuestRow[]
): CalendarPerson[] {
	const fromBucket = (
		rows: readonly CalendarAttendanceRow[],
		bucket: CalendarPerson['bucket']
	): CalendarPerson[] =>
		rows.map((row) => ({ row, name: calendarPersonName(row), bucket }));
	return [
		...fromBucket(split.going, 'going'),
		...fromBucket(split.maybe, 'maybe'),
		...fromBucket(split.notGoing, 'declined'),
		...fromBucket(split.undecided, 'pending'),
		...guests.map((guest) => ({
			row: { userId: null, status: guest.status, inviteType: guest.inviteType ?? null },
			name: guest.name,
			bucket: 'pending' as const
		}))
	];
}

/** The four states the attendance list labels. `invited` and `pending` stay
 * distinct: an invited person owes an answer, a member with no answer was never
 * asked in the same way (issue 126). */
export type CalendarAttendanceStatus = 'going' | 'maybe' | 'declined' | 'invited' | 'pending';

export const CALENDAR_ATTENDANCE_LABEL: Record<CalendarAttendanceStatus, string> = {
	going: 'Going',
	maybe: 'Maybe',
	declined: 'Can\u2019t go',
	invited: 'Not yet answered',
	pending: 'No answer'
};

/**
 * The label state for one attendance row: the column's own word first, and the
 * bucket the row arrived in when that word is outside the vocabulary.
 */
export function calendarAttendanceStatus(
	raw: string | null | undefined,
	bucket: CalendarPerson['bucket']
): CalendarAttendanceStatus {
	switch (raw) {
		case 'going':
			return 'going';
		case 'maybe':
			return 'maybe';
		case 'declined':
		case 'not_going':
			return 'declined';
		case 'undecided':
		case 'invited':
			return 'invited';
		default:
			return bucket;
	}
}

/** The name a row prints: first + last, else the account id, else "Unknown". */
export function calendarPersonName(row: CalendarAttendanceRow): string {
	const joined = `${row.firstName ?? ''} ${row.lastName ?? ''}`.trim();
	return joined || row.name || row.userId || 'Unknown';
}
