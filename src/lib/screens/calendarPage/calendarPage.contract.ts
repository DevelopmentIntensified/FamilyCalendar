/**
 * calendarPage contract: the page's query-string schema and the one typed load
 * model (`CalendarPageModel`).
 *
 * The screen owns no `/api` route, so there is no wire and no golden here: the
 * Event/Task/Sponsored shapes below are the fields the screen RENDERS, mapped
 * from each domain's own contract by the service. The query-string schema is
 * deliberately forgiving — an invalid `?date=`/`?view=` is IGNORED, never a
 * 400, because these params seed a page rather than describe a request.
 *
 * Doc: ./README.md#public-interface
 */
import { isoDate, oneOf, z } from '$lib/kernel/validation/validators';
import { CALENDAR_VIEWS, type CalendarView } from './calendarPage.view.rules';

/** A param whose invalid value means "not supplied" (legacy `if (editId && …)`). */
function ignoredCalendarParam<S extends z.ZodType>(schema: S) {
	return z.preprocess(
		(value) => (schema.safeParse(value).success ? value : undefined),
		schema.optional()
	);
}

/**
 * The params the page load reads. Presence-only `dashboardView` is handled by
 * the redirect rule; here it is simply carried.
 */
export const calendarSearchParamsSchema = z.object({
	date: ignoredCalendarParam(isoDate()),
	view: ignoredCalendarParam(oneOf(CALENDAR_VIEWS, 'Unknown view')),
	quickadd: z.string().optional(),
	title: z.string().optional(),
	text: z.string().optional(),
	url: z.string().optional(),
	edit: z.string().optional(),
	dashboardView: z.string().optional()
});

export type CalendarSearchParams = z.infer<typeof calendarSearchParamsSchema>;

/** The create modal's consumed deep-link seed: the Quick Add text and its ack. */
export interface CalendarCreateSeed {
	quickAdd: string;
	note: string;
}

/** One calendar in the list; colour is a calendar fact, not a page fact. */
export interface CalendarPageCalendar {
	id: string;
	name: string;
	color: string;
	kind: 'personal' | 'family';
}

/** A family member the edit modal's roster and the person filter both use. */
export interface CalendarPageRosterMember {
	userId: string;
	firstName: string;
	lastName: string | null;
}

/** The settings facts the page composes its first render from. */
export interface CalendarPageSettings {
	weekStart: string;
	defaultView: string;
	timeZone: string;
	color: string | null;
	showAdsAsEvents: boolean;
}

/** The compact "who's going" summary the attendance badge draws. */
export interface CalendarPageAttendance {
	going: number;
	invited: number;
	required: number;
	requiredPending: number;
	goingNames: string[];
}

/**
 * An Event occurrence as the grid draws it. `date` is the instant the day
 * bucket keys on; a recurring occurrence also carries its master's id and the
 * occurrence day so `?edit=` can resolve either.
 */
export interface CalendarPageEventRow {
	id: string;
	masterId: string | null;
	occurrenceDate: string | null;
	title: string | null;
	description: string | null;
	location: string | null;
	/** Display instant the day bucket and the item sort use. */
	date: string;
	start: string | null;
	end: string | null;
	allDay: boolean;
	calendarId: string | null;
	ownerId: string | null;
	creatorName: string | null;
	rsvpStatus: 'going' | 'maybe' | 'declined' | 'undecided' | null;
	attendance: CalendarPageAttendance | null;
	recurrenceFrequency: string | null;
}

/** A due Task as the grid draws it on its due day. */
export interface CalendarPageTaskRow {
	id: string;
	title: string | null;
	dueDate: string;
	calendarId: string | null;
	assignedTo: string | null;
	assigneeFirstName: string | null;
	assigneeLastName: string | null;
	recurrenceFrequency: string | null;
}

/**
 * A Sponsored Event is an Event row on no calendar, rendered amber. Kept apart
 * so the first-run card can weigh family content without ads (owner question 1
 * / Q-097) and no filter can mistake one for a plan.
 */
export type CalendarPageAdRow = CalendarPageEventRow;

/** The streamed half: the visible month's rows, already bounded by the grid window. */
export interface CalendarPageGrid {
	events: CalendarPageEventRow[];
	tasks: CalendarPageTaskRow[];
	ads: CalendarPageAdRow[];
}

/** The deep-link seeds the page consumed once, resolved in the shell. */
export interface CalendarPageSeeds {
	date: string | null;
	view: CalendarView | null;
	edit: string | null;
	create: CalendarCreateSeed | null;
}

/** The facts that render before the grid lands. */
export interface CalendarPageShell {
	viewerId: string | null;
	/** The viewer's date (`yyyy-MM-dd`) and zone, so no render reads a clock. */
	today: string;
	zone: string;
	weekStart: string;
	settings: CalendarPageSettings;
	calendars: CalendarPageCalendar[];
	roster: CalendarPageRosterMember[];
	seeds: CalendarPageSeeds;
	/** Section labels that failed and degraded to their fallback. */
	warnings: string[];
}

/**
 * The one typed load model: the shell plus `grid`, the streamed promise that
 * carries the visible month's Events, Sponsored Events and due Tasks.
 * Components type their props as `CalendarPageModel['grid']`-style slices.
 */
export interface CalendarPageModel {
	shell: CalendarPageShell;
	grid: Promise<CalendarPageGrid>;
}
