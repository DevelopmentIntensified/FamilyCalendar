/**
 * calendarPage bulk-plan rules: how a smart dry-run's plan reads on screen and
 * when it is worth a second look.
 *
 * The dry-run is calendar's (`POST /api/events/bulk` with `dryRun: true`); the
 * plan's PRESENTATION was the legacy page's own (`$lib/utils/bulkPlan.ts`), and
 * its decision — "this plan moves Events into the past, ask before applying" —
 * is a rule, not a component's business. `now`/`todayKey` are passed in, so
 * nothing here reads a clock (R5).
 *
 * Ported from legacy `src/lib/utils/bulkPlan.ts:31-57` (its `new Date()` reads
 * became parameters).
 *
 * Doc: ./README.md#selection-bulk-edit-and-the-modals
 */
import type { CalendarBulkPlanOpWire as CalendarBulkPlanOp } from '$lib/domains/calendar/index';

/** The plan row's wire shape, under the name this screen's rules use. */
export type { CalendarBulkPlanOpWire as CalendarBulkPlanOp } from '$lib/domains/calendar/index';

/** The calendar a plan's `→` clause names; page-owned, so only id and name. */
export interface CalendarBulkPlanCalendar {
	readonly id: string;
	readonly name: string;
}

/** The Event a plan row speaks about: its own or its master's id, and title. */
export interface CalendarBulkPlanEvent {
	readonly id: string;
	readonly masterId?: string | null;
	readonly title?: string | null;
}

/** Is this `YYYY-MM-DD` before the viewer's today? (legacy `isPastDate`). */
export function calendarBulkPlanDateIsPast(dateIso: string, todayKey: string): boolean {
	return dateIso < todayKey;
}

/**
 * One reviewed change, in words: `Delete "Piano"`, or
 * `Piano: move to Wed, Mar 4 (past), start 09:00, → School`.
 * A plan row that changes nothing reads as its own name.
 */
export function calendarBulkPlanLabel(
	op: CalendarBulkPlanOp,
	events: readonly CalendarBulkPlanEvent[],
	calendars: readonly CalendarBulkPlanCalendar[],
	todayKey: string
): string {
	const event = events.find((row) => (row.masterId || row.id) === op.id || row.id === op.id);
	const name = event?.title || op.title || 'Event';
	if (op.delete) return `Delete "${name}"`;

	const parts: string[] = [];
	if (op.title && op.title !== event?.title) parts.push(`rename to "${op.title}"`);
	if (op.date) {
		const marker = calendarBulkPlanDateIsPast(op.date, todayKey) ? ' (past)' : '';
		// The date as the plan carries it (`YYYY-MM-DD`), spelled the way the
		// legacy review list spelled it.
		const [year, month, day] = op.date.split('-').map(Number);
		const weekday = new Date(Date.UTC(year ?? 1970, (month ?? 1) - 1, day ?? 1)).getUTCDay();
		const weekdayName = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][weekday] ?? '';
		const monthName = [
			'Jan',
			'Feb',
			'Mar',
			'Apr',
			'May',
			'Jun',
			'Jul',
			'Aug',
			'Sep',
			'Oct',
			'Nov',
			'Dec'
		][(month ?? 1) - 1];
		parts.push(`move to ${weekdayName}, ${monthName} ${day}${marker}`);
	}
	if (op.startTime) parts.push(`start ${op.startTime}`);
	if (op.endTime) parts.push(`end ${op.endTime}`);
	if (op.location) parts.push(`at ${op.location}`);
	if (typeof op.allDay === 'boolean') parts.push(op.allDay ? 'all day' : 'timed');
	if (op.calendarId) {
		const calendar = calendars.find((row) => row.id === op.calendarId);
		if (calendar) parts.push(`→ ${calendar.name}`);
	}
	return parts.length > 0 ? `${name}: ${parts.join(', ')}` : name;
}

/** Does any planned change land on a day before today? (legacy `planMovesToPast`). */
export function calendarBulkPlanMovesToPast(
	plan: readonly CalendarBulkPlanOp[] | null | undefined,
	todayKey: string
): boolean {
	return (plan ?? []).some(
		(op) => typeof op.date === 'string' && calendarBulkPlanDateIsPast(op.date, todayKey)
	);
}
