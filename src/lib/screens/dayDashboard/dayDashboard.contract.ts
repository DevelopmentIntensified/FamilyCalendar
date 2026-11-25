/**
 * dayDashboard contract: the zod schema of `GET /api/dashboard?date=`, the one
 * payload the Android app and the web page share (G8).
 *
 * The response schema IS the wire, field for field as the frozen golden
 * (`dayDashboard.http.db.test.ts`) pins it: the ten `data` legs, the header,
 * and `warnings`. A field exists here only because the golden carries it, and
 * the two task legs stay separate shapes because the legacy reads select
 * different columns on purpose (`userTasks` joins the parent Event's calendar,
 * `familyTasks` joins the creator's name).
 *
 * `?date=` is validated by the regex alone, exactly as the legacy route did:
 * ten-digit `YYYY-MM-DD` or nothing. A well-formed but impossible date
 * (`2026-02-31`) passes here and falls back to today in the service — kernel
 * `isoDate()` would 400 it, which the golden forbids.
 *
 * Doc: ./README.md#invariants
 */
import { z } from '$lib/kernel/validation/validators';

// --- Wire copy --------------------------------------------------------------

/** The 400 body `GET /api/dashboard` uses for a `date` that is not `YYYY-MM-DD`. */
export const DASHBOARD_INVALID_DATE = 'Invalid date';

// --- `GET /api/dashboard?date=` ---------------------------------------------

/**
 * The query: `date` is optional; when present it must be ten digits in
 * `YYYY-MM-DD` form (`?date=` itself is a 400, as legacy's `!== null` check
 * made it). Absent means the viewed day is today in the viewer's zone.
 */
export const DashboardDayQuery = z.object({
	date: z
		.string({ error: DASHBOARD_INVALID_DATE })
		.regex(/^\d{4}-\d{2}-\d{2}$/, { error: DASHBOARD_INVALID_DATE })
		.optional()
});
export type DashboardDayQuery = z.infer<typeof DashboardDayQuery>;

// --- The two task legs ------------------------------------------------------

/**
 * The columns both task reads select. `dueDate`/`completedAt`/`archivedAt` are
 * `timestamptz` declared `mode:'string'`, so the wire carries Postgres's own
 * render (`2026-11-02 08:00:00+00`), not ISO; `createdAt`/`focusStartedAt`
 * are `Date` columns and serialize as ISO.
 */
const dashboardTaskFields = {
	id: z.string(),
	title: z.string(),
	notes: z.string().nullable(),
	dueDate: z.string().nullable(),
	completedAt: z.string().nullable(),
	archivedAt: z.string().nullable(),
	recurrenceFrequency: z.string().nullable(),
	recurrenceInterval: z.number().int().nullable(),
	completionCount: z.number().int(),
	assignedTo: z.string().nullable(),
	assignmentStatus: z.string().nullable(),
	priority: z.string(),
	visibility: z.string(),
	focusMinutes: z.number().int().nullable(),
	focusStartedAt: z.string().nullable(),
	category: z.string().nullable(),
	assigneeFirstName: z.string().nullable(),
	assigneeLastName: z.string().nullable(),
	userId: z.string(),
	familyId: z.string().nullable(),
	eventId: z.string().nullable(),
	createdAt: z.string(),
	eventTitle: z.string().nullable(),
	eventStart: z.string().nullable(),
	tags: z.array(z.string())
};

/**
 * One `userTasks` row (and one Top-3 row: the ranking returns the same rows by
 * reference). It carries the parent Event's calendar — a Task is filtered by
 * its Event's calendar (#069) — and no phone-focus overlay: that read is the
 * tasks list's, not this payload's.
 */
export const DashboardUserTaskRow = z.object({
	...dashboardTaskFields,
	eventCalendarId: z.string().nullable()
});
export type DashboardUserTaskRow = z.infer<typeof DashboardUserTaskRow>;

/**
 * One Family Task Board row: the family's open Tasks with the creator's first
 * name joined. It has no `eventCalendarId` (the board never attributes one)
 * but does carry `creatorFirstName`, which the user list does not.
 */
export const DashboardFamilyTaskRow = z.object({
	...dashboardTaskFields,
	creatorFirstName: z.string().nullable()
});
export type DashboardFamilyTaskRow = z.infer<typeof DashboardFamilyTaskRow>;

// --- The other legs ---------------------------------------------------------

/** One roster row: the family's members, as the layout read them. */
export const DashboardRosterRow = z.object({
	userId: z.string(),
	firstName: z.string(),
	lastName: z.string(),
	email: z.string().nullable(),
	role: z.string().nullable(),
	memberType: z.string().nullable()
});
export type DashboardRosterRow = z.infer<typeof DashboardRosterRow>;

/** The compact "who's going" summary attached to a family event (#285). */
export const DashboardAttendanceSummary = z.object({
	going: z.number().int(),
	invited: z.number().int(),
	required: z.number().int(),
	requiredPending: z.number().int(),
	goingNames: z.array(z.string())
});
export type DashboardAttendanceSummary = z.infer<typeof DashboardAttendanceSummary>;

/**
 * One day event on the wire: the expanded occurrence (composite `id`,
 * `masterId`, `occurrenceDate`) plus the viewer-zone `date` it was split onto,
 * the own/family `color` and `source`, and — when the event has one — the
 * viewer's RSVP and the attendance summary. `created_at` is timestamp WITHOUT
 * time zone, so its text is the server's, never an exact instant.
 */
export const DashboardDayEventRow = z.object({
	id: z.string(),
	masterId: z.string(),
	calendarId: z.string().nullable(),
	ownerId: z.string(),
	title: z.string(),
	description: z.string().nullable(),
	location: z.string().nullable(),
	allDay: z.boolean(),
	start: z.string(),
	end: z.string().nullable(),
	occurrenceDate: z.string(),
	date: z.string(),
	recurrenceFrequency: z.string().nullable(),
	recurrenceInterval: z.number().int().nullable(),
	recurrenceByDay: z.array(z.string()).nullable(),
	recurrenceCount: z.number().int().nullable(),
	recurrenceUntil: z.string().nullable(),
	reminderMinutes: z.number().int().nullable(),
	mirrorOf: z.string().nullable(),
	created_at: z.string(),
	color: z.string(),
	source: z.enum(['own', 'family']),
	// The RSVP vocabulary is calendar's; a viewer without an attendance row has
	// none, and JSON drops the key.
	rsvpStatus: z.string().optional(),
	attendance: DashboardAttendanceSummary.optional()
});
export type DashboardDayEventRow = z.infer<typeof DashboardDayEventRow>;

/** The viewer's day counts: wins, open work due inside the viewed day (Q-093), streak. */
export const DashboardGlance = z.object({
	doneToday: z.number().int(),
	openToday: z.number().int(),
	weekStreak: z.number().int()
});
export type DashboardGlance = z.infer<typeof DashboardGlance>;

/** One Completed Today row; both instants are rebuilt to ISO on the way out. */
export const DashboardCompletedRow = z.object({
	id: z.string(),
	title: z.string(),
	completedAt: z.string().nullable()
});
export type DashboardCompletedRow = z.infer<typeof DashboardCompletedRow>;

/** One Kids' Schedule event, with its attending children by id and name (072). */
export const DashboardKidsEventRow = z.object({
	id: z.string(),
	title: z.string(),
	start: z.string(),
	end: z.string().nullable(),
	allDay: z.boolean(),
	location: z.string().nullable(),
	kids: z.array(z.object({ id: z.string(), name: z.string() }))
});
export type DashboardKidsEventRow = z.infer<typeof DashboardKidsEventRow>;

/** One grocery card row: the two fields the card reads. */
export const DashboardGroceryRow = z.object({
	name: z.string(),
	stores: z.array(z.string())
});
export type DashboardGroceryRow = z.infer<typeof DashboardGroceryRow>;

/** One board quick-add category option. */
export const DashboardTaskCategoryRow = z.object({ id: z.string(), name: z.string() });
export type DashboardTaskCategoryRow = z.infer<typeof DashboardTaskCategoryRow>;

// --- The payload ------------------------------------------------------------

/** The ten streamed legs, exactly the keys the golden pins. */
export const DashboardData = z.object({
	userTasks: z.array(DashboardUserTaskRow),
	familyTasks: z.array(DashboardFamilyTaskRow),
	familyMembers: z.array(DashboardRosterRow),
	dayEvents: z.array(DashboardDayEventRow),
	top3: z.array(DashboardUserTaskRow),
	glance: DashboardGlance,
	completedToday: z.array(DashboardCompletedRow),
	kidsSchedule: z.array(DashboardKidsEventRow),
	familyGroceries: z.array(DashboardGroceryRow),
	mineGroceries: z.array(DashboardGroceryRow)
});
export type DashboardData = z.infer<typeof DashboardData>;

/**
 * The resolved `/api/dashboard` body: the header, the ten legs and the warning
 * labels (the page's labels first, then the legs'). Cards type their props from
 * this (`DashboardModel['data']['kidsSchedule']`), so no card owns a second
 * wire shape.
 */
export const DashboardModel = z.object({
	zone: z.string(),
	dayISO: z.string(),
	isToday: z.boolean(),
	meId: z.string(),
	familyId: z.string().nullable(),
	modules: z.record(z.string(), z.boolean()),
	taskCategories: z.array(DashboardTaskCategoryRow),
	data: DashboardData,
	warnings: z.array(z.string())
});
export type DashboardModel = z.infer<typeof DashboardModel>;

/**
 * What the page load returns while the band streams: the header and the
 * warning labels, with `data` still a promise. One derivation of the model, so
 * the page cannot drift from the API: the streamed promise resolves the same
 * ten legs the wire carries, plus the legs' own warning labels (the API strips
 * them into `warnings`, after the page's labels — legacy's merge order).
 */
export type DashboardLoadedData = DashboardData & { readonly warnings: string[] };

export type DashboardPageData = Omit<DashboardModel, 'data' | 'warnings'> & {
	data: Promise<DashboardLoadedData>;
	loadWarnings: string[];
};

/** The page's own payload: the streamed model plus the one header-only fact it needs. */
export type DayDashboardPageData = DashboardPageData & {
	/** The viewer's Default View; `'dashboard'` sends "Back to Calendar" to the board. */
	readonly defaultView: string | null;
};
