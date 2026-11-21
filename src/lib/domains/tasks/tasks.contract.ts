/**
 * tasks contract: the zod schemas and types for every `/api` request this
 * module answers, the wire rows it returns, and the exact legacy error copy
 * (the goldens pin it: `tasks.http.db.test.ts`, `tasks.update.http.db.test.ts`,
 * `tasks.focus.http.db.test.ts`).
 *
 * Date shapes on the wire are the ones the goldens carry: `mode:'string'`
 * columns (`dueDate`, `completedAt`, `archivedAt`, `eventStart`) are the
 * Postgres render (`2026-02-01 10:00:00+00`), while `mode:'date'` columns
 * (`createdAt`, `focusStartedAt`, session instants) are ISO strings.
 *
 * Absent vs null is modelled explicitly, field by field, because each one
 * means something different on a Task:
 * - POST: absent `familyId` = the caller's family, `null` = personal;
 *   absent `assignedTo` = self; absent `visibility` = `public`;
 *   `focusMinutes` absent/null = `null`; blank `category` = `null`.
 * - PUT: absent `focusMinutes`/`focusStartedAt`/`category`/`assignedTo` =
 *   unchanged; `focusStartedAt: null` and `category: null` clear;
 *   `focusMinutes: null` is still "unchanged" (the phone never knows it).
 *
 * The recurrence frequency's closed set is kernel/time's
 * `RecurrenceFrequency`. That export has not landed in this branch, so the
 * tuple stays PRIVATE here for the two boundaries that must validate it (POST
 * silently nulls an unknown value, PUT answers 400); nothing exports it, so
 * there is still one public vocabulary once kernel/time carries it.
 *
 * Doc: ./README.md#invariants
 */
import { isoInstant, requiredText, z } from '$lib/kernel/validation/validators';
import { focusStartedAtValue } from './tasks.focus.rules';
import {
	isTaskVisibility,
	normalizeTags,
	normalizeTaskPriority,
	TASK_VISIBILITIES
} from './tasks.task.rules';

// --- Wire copy --------------------------------------------------------------

/** POST/PUT: a title is required (POST) and trimmed; a whitespace-only PUT title is refused (Q-054). */
export const TASK_TITLE_REQUIRED = 'Title is required';
/** POST/PUT: a dueDate that is not a parseable date-time (Q-052 validates PUT too). */
export const TASK_INVALID_DUEDATE = 'Invalid dueDate';
/** PUT: the completion stamp has one writer (toggle/undo), never the patch (Q-051). */
export const TASK_COMPLETED_AT_DIRECT = 'completedAt cannot be set directly';
/** POST: a truthy non-text `notes` (Q-061). A falsy non-string still means "none". */
export const TASK_NOTES_NOT_STRING = 'notes must be a string';
/** POST: an eventId that is present but not text. */
export const TASK_INVALID_EVENT_ID = 'Invalid eventId';
/** POST/PUT: an explicit visibility outside the enum. */
export const TASK_INVALID_VISIBILITY = 'Invalid visibility';
/** POST/PUT: focusMinutes is not a whole number ≥ 0. */
export const TASK_INVALID_FOCUS_MINUTES = 'Invalid focusMinutes';
/** POST/PUT: focusStartedAt is neither null nor a parseable date-time. */
export const TASK_INVALID_FOCUS_STARTED_AT = 'Invalid focusStartedAt';
/** POST/PUT: `category` is not text. */
export const TASK_CATEGORY_NOT_STRING = 'category must be a string';
/** POST/PUT: `category` is longer than the 80-character cap. */
export const TASK_CATEGORY_TOO_LONG = 'category is too long';
/** POST/PUT: an explicit frequency outside the closed set. POST silently nulls it instead. */
export const TASK_INVALID_RECURRENCE_FREQUENCY = 'Invalid recurrenceFrequency';
/** PUT: `recurrenceInterval` is not a number. */
export const TASK_INVALID_RECURRENCE_INTERVAL = 'Invalid recurrenceInterval';
/** The category list: a missing/blank `name`. Also the malformed-JSON answer. */
export const TASK_CATEGORY_NAME_REQUIRED = 'name is required';
/** The category list: a `name` longer than the 80-character cap. */
export const TASK_CATEGORY_NAME_TOO_LONG = 'name is too long';
/** PATCH: the new name is owned by another category. */
export const TASK_CATEGORY_NAME_TAKEN = 'A category with that name already exists';
/** Any category route: the id is unknown or another user's. */
export const TASK_CATEGORY_NOT_FOUND = 'Category not found';
/** A command outside the closed set. */
export const FOCUS_COMMAND_INVALID = "Command must be 'start' or 'stop'";
/** A command `taskId` that is present but not a non-empty string. */
export const FOCUS_TASK_ID_INVALID = 'Invalid taskId';
/** A `start` command with no task. */
export const FOCUS_TASK_ID_REQUIRED = 'taskId is required for start';
/** The focus session routes' body guard (not the kernel `Invalid JSON`). */
export const FOCUS_INVALID_JSON = 'Invalid JSON body';
/** `GET /api/taskfocus/sessions` accepts one query. */
export const FOCUS_ONLY_UNABSORBED = 'Only ?unabsorbed=1 is supported';
/** A focus session id that is unknown or another user's. */
export const FOCUS_SESSION_NOT_FOUND = 'Session not found';
/** A session the desktop already absorbed is immutable. */
export const FOCUS_SESSION_ABSORBED = 'Session already absorbed';
/** A running session cannot be absorbed. */
export const FOCUS_SESSION_OPEN = 'Only closed sessions can be absorbed';
/** A running session blocks a second open one. */
export const FOCUS_SESSION_RUNNING = 'A phone focus session is already running';

// --- Recurrence vocabulary (kernel/time's, validated at the boundary) -------

const RECURRENCE_FREQUENCIES = ['daily', 'weekly', 'monthly', 'yearly'] as const;

type WireRecurrenceFrequency = (typeof RECURRENCE_FREQUENCIES)[number];

function isRecurrenceFrequency(value: unknown): value is WireRecurrenceFrequency {
	return typeof value === 'string' && RECURRENCE_FREQUENCIES.some((candidate) => candidate === value);
}

/** The one method the boundary helpers need from a zod transform's context. */
type IssueContext = {
	addIssue(issue: { code: 'custom'; message: string; input?: unknown }): void;
};

/** An absent/blank/whitespace-only optional id is "none" (legacy `isNonEmptyString`). */
function blankIdToNull(value: unknown): unknown {
	if (value === undefined || value === null) return null;
	if (typeof value === 'string' && value.trim() === '') return null;
	return value;
}

/** POST `category`: absent → unchanged (caller handles), null → null. */
function categoryValue(raw: unknown, ctx: IssueContext): string | null | undefined {
	if (raw === undefined) return undefined;
	if (raw === null) return null;
	if (typeof raw !== 'string') {
		ctx.addIssue({ code: 'custom', message: TASK_CATEGORY_NOT_STRING, input: raw });
		return z.NEVER;
	}
	const value = raw.trim();
	if (!value) return null;
	if (value.length > 80) {
		ctx.addIssue({ code: 'custom', message: TASK_CATEGORY_TOO_LONG, input: raw });
		return z.NEVER;
	}
	return value;
}

/** The category list's `name`: trimmed, 1..80, with the list's own copy. */
function categoryNameValue(raw: unknown, ctx: IssueContext): string {
	const value = typeof raw === 'string' ? raw.trim() : '';
	if (!value) {
		ctx.addIssue({ code: 'custom', message: TASK_CATEGORY_NAME_REQUIRED, input: raw });
		return z.NEVER;
	}
	if (value.length > 80) {
		ctx.addIssue({ code: 'custom', message: TASK_CATEGORY_NAME_TOO_LONG, input: raw });
		return z.NEVER;
	}
	return value;
}

/** `focusMinutes`: a whole number ≥ 0, with the legacy message. */
function focusMinutesValue(raw: unknown, ctx: IssueContext): number {
	if (typeof raw === 'number' && Number.isInteger(raw) && raw >= 0) return raw;
	ctx.addIssue({ code: 'custom', message: TASK_INVALID_FOCUS_MINUTES, input: raw });
	return z.NEVER;
}

/** `focusStartedAt`: the shared rule, lifted into a zod issue. */
function focusStartedAtField(raw: unknown, ctx: IssueContext): Date | null | undefined {
	const parsed = focusStartedAtValue(raw);
	if (!parsed.ok) {
		ctx.addIssue({ code: 'custom', message: TASK_INVALID_FOCUS_STARTED_AT, input: raw });
		return z.NEVER;
	}
	return parsed.value;
}

// --- POST /api/tasks --------------------------------------------------------

/**
 * The body of `POST /api/tasks`. Title is trimmed and required; an absent
 * `familyId` is read as the caller's family (the service supplies it) and
 * `null` as personal; an absent `assignedTo` is self; visibility defaults to
 * `public` but an explicit null/unknown value is a 400; an unknown
 * `recurrenceFrequency` is silently `null`.
 *
 * Typed as an object so a non-object body answers `Title is required`, which
 * is what legacy's `body.title` read produced.
 */
export const TaskCreateBody = z.object(
	{
		title: requiredText(TASK_TITLE_REQUIRED),
		/**
		 * Legacy `body.notes || null`: absent and falsy → null, text stored
		 * verbatim (no trim). A truthy non-string is refused (Q-061). Not
		 * `.optional()`: a bare title must still parse `notes` to `null` so the
		 * create seam always writes a value.
		 */
		notes: z.preprocess(
			(value) => value || null,
			z.string({ error: TASK_NOTES_NOT_STRING }).nullable()
		),
		dueDate: z.preprocess(
			// `''` alone is "no date"; whitespace is text and then fails the parse.
			(value) => (value === undefined || value === null || value === '' ? null : value),
			isoInstant(TASK_INVALID_DUEDATE).nullable()
		),
		eventId: z.preprocess(blankIdToNull, z.string({ error: TASK_INVALID_EVENT_ID }).nullable()),
		familyId: z.unknown().optional().transform((value): string | null | undefined => {
			if (value === undefined) return undefined;
			if (value === null) return null;
			return typeof value === 'string' ? value : String(value);
		}),
		assignedTo: z.unknown().optional().transform((value): string | undefined => {
			if (typeof value !== 'string') return undefined;
			return value.trim() ? value : undefined;
		}),
		visibility: z
			.unknown()
			.optional()
			.transform((value, ctx): (typeof TASK_VISIBILITIES)[number] => {
				if (value === undefined) return 'public';
				if (isTaskVisibility(value)) return value;
				ctx.addIssue({ code: 'custom', message: TASK_INVALID_VISIBILITY, input: value });
				return z.NEVER;
			}),
		priority: z.unknown().optional().transform((value) => normalizeTaskPriority(value)),
		recurrenceFrequency: z
			.unknown()
			.optional()
			.transform((value): WireRecurrenceFrequency | null =>
				isRecurrenceFrequency(value) ? value : null
			),
		// Legacy `Math.floor`, tolerating the numeric strings a client may send.
		recurrenceInterval: z
			.unknown()
			.optional()
			.transform((value): number | undefined => {
				if (value === undefined || value === null) return undefined;
				const n = typeof value === 'number' ? value : Number(value);
				return Number.isFinite(n) ? Math.floor(n) : undefined;
			}),
		tags: z
			.unknown()
			.optional()
			.transform((value): string[] | undefined =>
				value === undefined ? undefined : normalizeTags(value)
			),
		focusMinutes: z
			.unknown()
			.optional()
			.transform((value, ctx): number | null =>
				value === undefined || value === null ? null : focusMinutesValue(value, ctx)
			),
		focusStartedAt: z
			.unknown()
			.optional()
			.transform((value, ctx) => focusStartedAtField(value, ctx))
			.transform((value): Date | null => value ?? null),
		category: z
			.unknown()
			.optional()
			.transform((value, ctx) => categoryValue(value, ctx))
			.transform((value): string | null => value ?? null)
	},
	{ error: TASK_TITLE_REQUIRED }
);
export type TaskCreateBody = z.infer<typeof TaskCreateBody>;

/**
 * What a CALLER sends (`POST /api/tasks`'s input side): any subset of the keys
 * the schema reads — the browser sends the fields it has, the schema refines
 * them and refuses what it must. `z.input` alone still marks the preprocessed
 * keys (`notes`, `dueDate`, `eventId`) as present, which no caller sets all of.
 */
export type TaskCreatePayload = Partial<z.input<typeof TaskCreateBody>>;

// --- PUT /api/tasks/[id] ----------------------------------------------------

/**
 * The body of `PUT /api/tasks/[id]`. The route dispatches on the body's shape
 * in this order — `undoComplete` → `advanceToNext` → `toggleComplete` → field
 * patch — and this schema describes the patch branch; the three flags ride
 * along (truthiness decides, like legacy) so S6 can read them from one parse.
 *
 * Field rules (the owner's answers Q-051/Q-052/Q-054): a whitespace-only
 * `title` answers POST's `Title is required`; `dueDate` is validated exactly
 * like POST (`Invalid dueDate`); a raw `completedAt` answers `completedAt
 * cannot be set directly` — the column has one writer (toggle/undo). An
 * assignment response outside accept/decline is still ignored.
 */
export const TaskUpdateBody = z.object({
	undoComplete: z
		.unknown()
		.optional()
		.transform((value) => value !== undefined && Boolean(value)),
	advanceToNext: z
		.unknown()
		.optional()
		.transform((value) => value !== undefined && Boolean(value)),
	toggleComplete: z
		.unknown()
		.optional()
		.transform((value) => value !== undefined && Boolean(value)),
	previousDueDate: z
		.unknown()
		.optional()
		.transform((value): string | null => (typeof value === 'string' ? value : null)),
	title: z.unknown().optional().transform((value, ctx): string | undefined => {
		if (value === undefined) return undefined;
		if (typeof value !== 'string') return undefined;
		const trimmed = value.trim();
		// Q-054: a whitespace-only title is a refusal, with POST's own copy.
		if (!trimmed) {
			ctx.addIssue({ code: 'custom', message: TASK_TITLE_REQUIRED, input: value });
			return z.NEVER;
		}
		return trimmed;
	}),
	notes: z
		.preprocess(
			(value) => (value === undefined ? undefined : value || null),
			z.string().nullable().optional()
		),
	dueDate: z
		.unknown()
		.optional()
		.transform((value, ctx): string | null | undefined => {
			if (value === undefined) return undefined;
			if (value === null || value === '') return null;
			if (typeof value !== 'string') return undefined;
			// Q-052: same rule and same copy as POST.
			if (!isoInstant(TASK_INVALID_DUEDATE).safeParse(value).success) {
				ctx.addIssue({ code: 'custom', message: TASK_INVALID_DUEDATE, input: value });
				return z.NEVER;
			}
			return value;
		}),
	priority: z
		.unknown()
		.optional()
		.transform((value) => (value === undefined ? undefined : normalizeTaskPriority(value))),
	recurrenceFrequency: z
		.unknown()
		.optional()
		.transform((value, ctx): WireRecurrenceFrequency | null | undefined => {
			if (value === undefined) return undefined;
			if (value === null) return null;
			if (isRecurrenceFrequency(value)) return value;
			ctx.addIssue({
				code: 'custom',
				message: TASK_INVALID_RECURRENCE_FREQUENCY,
				input: value
			});
			return z.NEVER;
		}),
	recurrenceInterval: z
		.unknown()
		.optional()
		.transform((value, ctx): number | undefined => {
			if (value === undefined || value === null) return undefined;
			if (typeof value === 'number' && Number.isFinite(value)) return value;
			ctx.addIssue({ code: 'custom', message: TASK_INVALID_RECURRENCE_INTERVAL, input: value });
			return z.NEVER;
		}),
	visibility: z
		.unknown()
		.optional()
		.transform((value, ctx): (typeof TASK_VISIBILITIES)[number] | undefined => {
			if (value === undefined) return undefined;
			if (isTaskVisibility(value)) return value;
			ctx.addIssue({ code: 'custom', message: TASK_INVALID_VISIBILITY, input: value });
			return z.NEVER;
		}),
	assignedTo: z.unknown().optional().transform((value): string | null | undefined => {
		if (value === undefined) return undefined;
		if (value === null) return null;
		return typeof value === 'string' && value.length > 0 ? value : undefined;
	}),
	assignmentStatus: z
		.unknown()
		.optional()
		.transform((value): 'accepted' | 'declined' | undefined =>
			value === 'accepted' || value === 'declined' ? value : undefined
		),
	focusMinutes: z
		.unknown()
		.optional()
		.transform((value, ctx): number | undefined =>
			value === undefined || value === null ? undefined : focusMinutesValue(value, ctx)
		),
	focusStartedAt: z
		.unknown()
		.optional()
		.transform((value, ctx) => focusStartedAtField(value, ctx)),
	category: z
		.unknown()
		.optional()
		.transform((value, ctx) => categoryValue(value, ctx)),
	completedAt: z.unknown().optional().transform((value, ctx): undefined => {
		if (value === undefined) return undefined;
		// Q-051: the completion stamp is written only by toggle/undo.
		ctx.addIssue({ code: 'custom', message: TASK_COMPLETED_AT_DIRECT, input: value });
		return z.NEVER;
	}),
	tags: z.unknown().optional()
});
export type TaskUpdateBody = z.infer<typeof TaskUpdateBody>;

/**
 * What a CALLER sends (`PUT /api/tasks/[id]`'s input side): one flag, one
 * assignment answer or a field patch — any subset, which the schema above fills
 * in (and refuses where it must).
 */
export type TaskUpdatePayload = Partial<z.input<typeof TaskUpdateBody>>;

// --- Route parameters -------------------------------------------------------

/** The `[id]` parameter every one-row route reads. */
export const TaskRouteParams = z.object({ id: z.string() });
export type TaskRouteParams = z.infer<typeof TaskRouteParams>;

// --- Task category bodies ---------------------------------------------------

/** `POST|PATCH /api/task-categories[...]` — a name, trimmed, 1..80. */
export const TaskCategoryNameBody = z.object(
	{
		name: z
			.unknown()
			.optional()
			.transform((value, ctx) => categoryNameValue(value, ctx))
	},
	{ error: TASK_CATEGORY_NAME_REQUIRED }
);
export type TaskCategoryNameBody = z.infer<typeof TaskCategoryNameBody>;

// --- TaskFocus command bodies ----------------------------------------------

/**
 * `POST /api/taskfocus/commands`: `start|stop`, with an optional own task id.
 * One transform, because the three refusals are ordered: an unknown command,
 * then a taskId that is present but not a non-empty string, then a `start`
 * with no task (`stop` may carry none).
 */
export const FocusCommandBody = z
	.unknown()
	.transform((body, ctx): { command: 'start' | 'stop'; taskId: string | null } => {
		const commandRaw =
			body !== null && typeof body === 'object' && 'command' in body ? body.command : undefined;
		const command =
			commandRaw === 'start' || commandRaw === 'stop' ? (commandRaw as 'start' | 'stop') : null;
		if (!command) {
			ctx.addIssue({ code: 'custom', message: FOCUS_COMMAND_INVALID, input: body });
			return z.NEVER;
		}
		const taskIdRaw =
			body !== null && typeof body === 'object' && 'taskId' in body ? body.taskId : undefined;
		if (taskIdRaw !== undefined && taskIdRaw !== null) {
			if (typeof taskIdRaw !== 'string' || taskIdRaw.length === 0) {
				ctx.addIssue({ code: 'custom', message: FOCUS_TASK_ID_INVALID, input: taskIdRaw });
				return z.NEVER;
			}
			return { command, taskId: taskIdRaw };
		}
		if (command === 'start') {
			ctx.addIssue({ code: 'custom', message: FOCUS_TASK_ID_REQUIRED, input: body });
			return z.NEVER;
		}
		return { command, taskId: null };
	});
export type FocusCommandBody = z.infer<typeof FocusCommandBody>;

// --- TaskFocus session bodies ----------------------------------------------

/** An instant field that must be a `Date.parse`-able string, in the legacy order of messages. */
function instantField(raw: unknown, field: 'startedAt' | 'endedAt', ctx: IssueContext): Date {
	if (typeof raw !== 'string' || raw.trim() === '') {
		ctx.addIssue({ code: 'custom', message: `${field} is required`, input: raw });
		return z.NEVER;
	}
	const ms = Date.parse(raw);
	if (Number.isNaN(ms)) {
		ctx.addIssue({ code: 'custom', message: `Invalid ${field}`, input: raw });
		return z.NEVER;
	}
	return new Date(ms);
}

/**
 * `POST /api/taskfocus/sessions`: `{taskId, startedAt, endedAt?}`. A non-object
 * body answers the focus routes' own copy (`Invalid JSON body`), never the
 * kernel's.
 */
export const FocusSessionStartBody = z.object(
	{
		taskId: z.unknown().optional().transform((value, ctx): string => {
			if (typeof value === 'string' && value.trim() !== '') return value;
			ctx.addIssue({ code: 'custom', message: 'taskId is required', input: value });
			return z.NEVER;
		}),
		startedAt: z
			.unknown()
			.optional()
			.transform((value, ctx) => instantField(value, 'startedAt', ctx)),
		endedAt: z
			.unknown()
			.optional()
			.transform((value, ctx): Date | null =>
				value === undefined || value === null ? null : instantField(value, 'endedAt', ctx)
			)
	},
	{ error: FOCUS_INVALID_JSON }
);
export type FocusSessionStartBody = z.infer<typeof FocusSessionStartBody>;

/** `PATCH /api/taskfocus/sessions/[id]`: `{endedAt}`. */
export const FocusSessionEndBody = z.object(
	{
		endedAt: z
			.unknown()
			.optional()
			.transform((value, ctx) => instantField(value, 'endedAt', ctx))
	},
	{ error: FOCUS_INVALID_JSON }
);
export type FocusSessionEndBody = z.infer<typeof FocusSessionEndBody>;

// --- Wire rows --------------------------------------------------------------

/**
 * One Task row as the wire carries it — the table's columns, no joins.
 * `dueDate`/`completedAt`/`archivedAt` are `timestamptz` `mode:'string'`, so
 * they render as Postgres does (`2026-02-01 10:00:00+00`); `createdAt` and
 * `focusStartedAt` are `Date`s and serialize as ISO.
 */
export const TaskWire = z.object({
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
	userId: z.string(),
	familyId: z.string().nullable(),
	eventId: z.string().nullable(),
	focusMinutes: z.number().int().nullable(),
	focusStartedAt: isoInstant().nullable(),
	category: z.string().nullable(),
	createdAt: isoInstant()
});
export type TaskWire = z.infer<typeof TaskWire>;

/** A mutated Task answers its row plus the tag set (POST create, PUT field patch). */
export const TaskWithTagsWire = TaskWire.extend({ tags: z.array(z.string()) });
export type TaskWithTagsWire = z.infer<typeof TaskWithTagsWire>;

/**
 * A main-list row: the row plus the parent Event's attribution, the assignee's
 * names, the tags and the caller's phone overlay. `eventCalendarId` is always
 * present (`null` = standalone, #292).
 */
export const TaskListRowWire = TaskWithTagsWire.extend({
	assigneeFirstName: z.string().nullable(),
	assigneeLastName: z.string().nullable(),
	eventTitle: z.string().nullable(),
	eventStart: z.string().nullable(),
	eventCalendarId: z.string().nullable(),
	phoneFocusMinutes: z.number().int(),
	phoneFocusStartedAt: isoInstant().nullable()
});
export type TaskListRowWire = z.infer<typeof TaskListRowWire>;

/**
 * A section row (my Tasks / To Accept / Requested): the row plus assignee and
 * creator names and the parent Event's title/start. It carries NEITHER
 * `eventCalendarId` NOR the phone overlay — the section shape never does.
 */
export const TaskSectionRowWire = TaskWithTagsWire.extend({
	assigneeFirstName: z.string().nullable(),
	assigneeLastName: z.string().nullable(),
	creatorFirstName: z.string().nullable(),
	eventTitle: z.string().nullable(),
	eventStart: z.string().nullable()
});
export type TaskSectionRowWire = z.infer<typeof TaskSectionRowWire>;

// --- Responses --------------------------------------------------------------

/**
 * `GET /api/tasks` — both legs (the caller's list and `?eventId=…`, including
 * the unknown-event `{tasks:[]}` answer) carry the ONE list shape (Q-055).
 */
export const TaskListResponse = z.object({ tasks: z.array(TaskListRowWire) });
export type TaskListResponse = z.infer<typeof TaskListResponse>;

/** `201` from `POST /api/tasks`. */
export const TaskCreatedResponse = z.object({ success: z.literal(true), task: TaskWithTagsWire });
export type TaskCreatedResponse = z.infer<typeof TaskCreatedResponse>;

/**
 * `200` from `PUT /api/tasks/[id]`: a field patch answers the row plus its
 * tags, while undo/skip/toggle answer the bare row (no `tags` key).
 */
export const TaskUpdatedResponse = z.object({
	success: z.literal(true),
	task: z.union([TaskWithTagsWire, TaskWire])
});
export type TaskUpdatedResponse = z.infer<typeof TaskUpdatedResponse>;

/** `DELETE /api/tasks/[id]` and `DELETE /api/tasks/completed`. */
export const TaskDeletedResponse = z.object({ success: z.literal(true) });
export type TaskDeletedResponse = z.infer<typeof TaskDeletedResponse>;

/** `GET /api/tasks/sections`: the three queues plus the labels of any leg that failed. */
export const TaskSectionsResponse = z.object({
	myTasks: z.array(TaskSectionRowWire),
	pendingAssignments: z.array(TaskSectionRowWire),
	requestedByMe: z.array(TaskSectionRowWire),
	warnings: z.array(z.string())
});
export type TaskSectionsResponse = z.infer<typeof TaskSectionsResponse>;

/** A category on the wire: no `userId`. */
export const TaskCategoryWire = z.object({
	id: z.string(),
	name: z.string(),
	createdAt: isoInstant(),
	updatedAt: isoInstant()
});
export type TaskCategoryWire = z.infer<typeof TaskCategoryWire>;

/** `GET /api/task-categories`. */
export const TaskCategoriesResponse = z.object({ categories: z.array(TaskCategoryWire) });
export type TaskCategoriesResponse = z.infer<typeof TaskCategoriesResponse>;

/** `POST|PATCH /api/task-categories[...]`. */
export const TaskCategoryResponse = z.object({ category: TaskCategoryWire });
export type TaskCategoryResponse = z.infer<typeof TaskCategoryResponse>;

/** One queued device command on the wire. */
export const FocusCommandWire = z.object({
	id: z.string(),
	command: z.string(),
	taskId: z.string().nullable(),
	issuedAt: isoInstant()
});
export type FocusCommandWire = z.infer<typeof FocusCommandWire>;

/** `GET /api/taskfocus/commands`. */
export const FocusCommandsResponse = z.object({ commands: z.array(FocusCommandWire) });
export type FocusCommandsResponse = z.infer<typeof FocusCommandsResponse>;

/** `POST /api/taskfocus/commands` answers the stored command's four fields at the top level. */
export const FocusCommandResponse = FocusCommandWire;
export type FocusCommandResponse = z.infer<typeof FocusCommandResponse>;

/** A phone focus session on the wire (POST / PATCH / absorb). */
export const FocusSessionWire = z.object({
	id: z.string(),
	taskId: z.string(),
	startedAt: isoInstant(),
	endedAt: isoInstant().nullable(),
	source: z.string(),
	absorbedAt: isoInstant().nullable(),
	createdAt: isoInstant()
});
export type FocusSessionWire = z.infer<typeof FocusSessionWire>;

/** `GET ?unabsorbed=1` item: exactly these five fields. */
export const FocusSessionListItemWire = FocusSessionWire.pick({
	id: true,
	taskId: true,
	startedAt: true,
	endedAt: true,
	source: true
});
export type FocusSessionListItemWire = z.infer<typeof FocusSessionListItemWire>;

/** `GET /api/taskfocus/sessions?unabsorbed=1`. */
export const FocusSessionsResponse = z.object({
	sessions: z.array(FocusSessionListItemWire)
});
export type FocusSessionsResponse = z.infer<typeof FocusSessionsResponse>;

/** `POST /api/taskfocus/sessions`, `PATCH`, and `absorb` answer the session. */
export const FocusSessionResponse = z.object({ session: FocusSessionWire });
export type FocusSessionResponse = z.infer<typeof FocusSessionResponse>;

/** `DELETE /api/taskfocus/sessions/[id]`. */
export const FocusSessionDeletedResponse = z.object({ success: z.literal(true) });
export type FocusSessionDeletedResponse = z.infer<typeof FocusSessionDeletedResponse>;

/** A named person figure in the stats body. */
const StatsNameCount = z.object({ name: z.string(), total: z.number().int() });

/** One recently completed row. */
const RecentlyCompleted = z.object({
	title: z.string(),
	completedAt: z.string(),
	recurring: z.boolean()
});

/** The counting path's snapshot (legacy `TaskStats`). */
export const TaskStatsWire = z.object({
	completedOnce: z.number().int(),
	recurringTasks: z.number().int(),
	recurringCompletions: z.number().int(),
	topAssigners: z.array(StatsNameCount),
	topAssignees: z.array(StatsNameCount),
	recentlyCompleted: z.array(RecentlyCompleted),
	month: z.object({ completed: z.number().int(), recurring: z.number().int() }),
	doneBy: z.array(z.object({ name: z.string(), count: z.number().int() }))
});
export type TaskStatsWire = z.infer<typeof TaskStatsWire>;

/** `GET /api/stats`: the counting path plus the streak, the instant list and the roster. */
export const TaskStatsResponse = z.object({
	stats: TaskStatsWire,
	streak: z.object({
		current: z.number().int(),
		best: z.number().int(),
		freezeUsedInCurrentGap: z.boolean(),
		lastCompletedWeek: z.string().nullable()
	}),
	completionIso: z.array(isoInstant()),
	todayIso: isoInstant(),
	month: z.object({ completed: z.number().int(), recurring: z.number().int() }),
	doneBy: z.array(z.object({ name: z.string(), count: z.number().int() })),
	roster: z.array(z.object({ firstName: z.string(), memberType: z.string() }))
});
export type TaskStatsResponse = z.infer<typeof TaskStatsResponse>;

// --- Page data shapes (not the wire) -----------------------------------------

/**
 * A Task row as the `/calendar/tasks` load hands it to the browser: the
 * `TaskSectionRow` read (`tasks.items.service.server.ts`) after devalue, so the
 * one `mode:'default'` column may arrive as a Date instead of an ISO string.
 * The page's api client and components type on this, never on a `.server` file.
 */
export type TaskPageRow = {
	readonly id: string;
	readonly title: string;
	readonly notes: string | null;
	readonly dueDate: string | null;
	readonly completedAt: string | null;
	readonly recurrenceFrequency: string | null;
	readonly recurrenceInterval: number | null;
	readonly completionCount: number;
	readonly assignedTo: string | null;
	readonly assignmentStatus: string | null;
	readonly priority: string;
	readonly visibility: string;
	readonly userId: string;
	readonly familyId: string | null;
	readonly eventId: string | null;
	readonly focusMinutes: number | null;
	readonly focusStartedAt: string | Date | null;
	readonly category: string | null;
	readonly createdAt: string | Date;
	readonly tags: readonly string[];
	readonly assigneeFirstName: string | null;
	readonly assigneeLastName: string | null;
	readonly creatorFirstName: string | null;
	readonly eventTitle: string | null;
	readonly eventStart: string | null;
};

/** One member of the viewer's family roster, as the group layout supplies it. */
export type TaskRosterMember = {
	readonly userId: string;
	readonly firstName: string;
	readonly lastName: string;
};

/** A category option: the id for the manage list, the name for the combobox. */
export type TaskCategoryItem = { readonly id: string; readonly name: string };

/** The three queues and the labels of the legs that degraded (the list read). */
export type TaskSections = {
	readonly myTasks: readonly TaskPageRow[];
	readonly pendingAssignments: readonly TaskPageRow[];
	readonly requestedByMe: readonly TaskPageRow[];
	readonly warnings: readonly string[];
};

/**
 * One archived Event as `GET /api/archive` (and the archive page) carries it:
 * the `events` row verbatim, with `start`/`end` parsed and the calendar's label.
 *
 * `end` is the epoch when the Event has none — what the page has always
 * printed, and what the Android spec pins. `calendar` is the badge: 'Personal
 * calendar', the family's name, or null for a row with no calendar at all.
 */
export type TaskArchiveEvent = {
	readonly id: string;
	readonly calendarId: string | null;
	readonly ownerId: string;
	readonly title: string;
	readonly start: Date;
	readonly end: Date;
	readonly description: string | null;
	readonly location: string | null;
	readonly allDay: boolean;
	readonly recurrenceFrequency: string | null;
	readonly recurrenceInterval: number | null;
	readonly recurrenceByDay: readonly string[] | null;
	readonly recurrenceCount: number | null;
	readonly recurrenceUntil: string | null;
	readonly reminderMinutes: number | null;
	readonly mirrorOf: string | null;
	readonly created_at: string | Date;
	readonly calendar: string | null;
};

/**
 * The `/calendar/archive` data (and the `GET /api/archive` body): the rows —
 * none when the plan has no archive — and the gate's own facts either way.
 * `reason` is present only on the refusal.
 */
export type TaskArchivePage = {
	readonly events: readonly TaskArchiveEvent[];
	readonly archiveAllowed: boolean;
	readonly reason?: string;
	readonly planName: string;
	readonly familyCount: number;
	readonly retentionDays: number;
	readonly archivedRetentionDays: number;
};

/** Everything the `/calendar/tasks` page (and its Screen) reads from `data`. */
export type TaskPageData = {
	readonly user?: { readonly id: string } | null;
	readonly userSettings?: { readonly timeZone?: string | null } | null;
	readonly familyId: string | null;
	readonly familyMembers: readonly TaskRosterMember[];
	readonly taskCategories: readonly TaskCategoryItem[];
	readonly taskLists: TaskSections;
	readonly loadWarnings: readonly string[];
};
