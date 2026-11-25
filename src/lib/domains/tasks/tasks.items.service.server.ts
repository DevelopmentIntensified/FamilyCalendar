/**
 * tasks item service: the Task row use-cases — the two list reads and the
 * Family Task Board read, create, the `PUT` field-patch dispatch (the cursor
 * actions live in `tasks.completion.service.server.ts`), delete, "clear
 * completed", and the `family` port adapter that clears a removed member's
 * assignments.
 *
 * Authorization lives here, never in the repo: every read is scoped by the
 * actor (their own rows plus their family's), every mutation goes through the
 * one rule `canMutateTask` with family's membership answer, and a caller
 * without rights gets the same `Task not found` an unknown id gets. The event
 * access check is calendar's public service — an unknown Event is
 * `400 Event not found`, an unreadable one `403 No access to this event`.
 *
 * Names come from identity's id-batch read (family supplies the board's
 * member ids), so this module joins neither `users` nor `familyMembers`
 * (rule R3); the repo returns ids and the helpers turn them into names.
 *
 * Time is `ctx.clock`; ids ride the table defaults from the kernel id port.
 *
 * Doc: ./README.md#invariants
 */
import type { Actor } from '$lib/kernel/ctx/actor';
import type { Ctx } from '$lib/kernel/ctx/ctx.server';
import { withTx } from '$lib/kernel/db/database.server';
import type { TaskRow } from '$lib/kernel/db/tables.server';
import { AppError, forbidden, invalid, notFound } from '$lib/kernel/errors/appError';
import { createAlert } from '$lib/domains/alerts/index.server';
import { getEventForViewer } from '$lib/domains/calendar/index.server';
import {
	listFamilyRoster,
	listPersonFamilyIds,
	resolveMembershipFamilyId
} from '$lib/domains/family/index.server';
import { getPerson, listPersonNames } from '$lib/domains/identity/index.server';
import { ensureTaskCategory } from './tasks.categories.service.server';
import type { TaskCreateBody, TaskUpdateBody } from './tasks.contract';
import { needsOverduePin, pinnedDueFor } from './tasks.cursor.rules';
import { getPhoneFocusOverlay } from './tasks.focus.service.server';
import {
	archiveViewerCompletedTasks,
	archiveTaskById,
	deleteTaskById,
	findOwnedTask,
	findTask,
	insertTask,
	insertTaskTags,
	listDueTaskRows,
	listFamilyTaskRows,
	listMyTasks,
	listPendingAssignments,
	listPinnableTasks,
	listPublicFamilyTasks,
	listRequestedByMe,
	listTagsForTasks,
	listTasksForEvent,
	listTasksForUser,
	pinDueDates,
	replaceTaskTags,
	updateTaskById,
	updateTaskInFamily,
	type TaskRowWithEvent,
	type TaskWritePatch
} from './tasks.repo.server';
import { canMutateTask, canReadTask, nextAssignmentPatch, normalizeTags } from './tasks.task.rules';
import {
	skipTaskOccurrence,
	toggleTaskCompletion,
	undoTaskCompletion,
	viewerZone,
	type TaskUpdatedRow
} from './tasks.completion.service.server';

// --- Wire copy --------------------------------------------------------------

/** An unknown Task and a Task the caller may not touch answer the same thing. */
const TASK_NOT_FOUND = 'Task not found';
/** A visibility patch from anyone but the owner. */
const TASK_VISIBILITY_OWNER_ONLY = 'Only the task owner can change visibility';
/** An assignee who is neither the creator nor a member of the target family. */
const TASK_ASSIGNEE_NOT_MEMBER = 'Assignee is not a member of this family';
/** A non-owner trying to reassign or release someone else's assignment. */
const TASK_ONLY_OWN_ASSIGNMENTS = 'You can only respond to your own assignments';
/** An explicit `familyId` the caller does not belong to. */
const TASK_NOT_FAMILY_MEMBER = 'Not a member of this family';
/** An `eventId` no Event carries (legacy POST's 400). */
const TASK_EVENT_NOT_FOUND = 'Event not found';
/** An `eventId` the caller cannot read (legacy POST's 403). */
const TASK_EVENT_NO_ACCESS = 'No access to this event';
/** One Family Task Board read for a family the caller is not in (the board's 404). */
const TASK_FAMILY_NOT_FOUND = 'Family not found';

const TASKS_ALERT_LINK = '/calendar/tasks';

// --- Row shapes -------------------------------------------------------------

/** A Task row plus its sorted tag set (the create and field-patch answers). */
export type TaskWithTagsRow = TaskRow & { readonly tags: readonly string[] };

/** A main-list row: the Task, its Event attribution, names, tags and the caller's phone overlay. */
export type TaskListRow = TaskRowWithEvent & {
	readonly tags: readonly string[];
	readonly assigneeFirstName: string | null;
	readonly assigneeLastName: string | null;
	readonly phoneFocusMinutes: number;
	readonly phoneFocusStartedAt: Date | null;
};

/** A section row: names and the Event's title/start, NEVER `eventCalendarId` or the overlay. */
export type TaskSectionRow = Omit<TaskRowWithEvent, 'eventCalendarId'> & {
	readonly tags: readonly string[];
	readonly assigneeFirstName: string | null;
	readonly assigneeLastName: string | null;
	readonly creatorFirstName: string | null;
};

/** The Family Task Board's two lists (familyHub composes them with the roster and the categories). */
export type TaskFamilyBoardRows = {
	readonly familyTasks: readonly TaskSectionRow[];
	readonly publicTasks: readonly TaskSectionRow[];
};

// --- Shared helpers ---------------------------------------------------------

/**
 * The viewer's family membership of ONE family, the flag the mutation rule
 * takes (family owns the roster; this module never joins `familyMembers`).
 */
async function isMemberOf(ctx: Ctx, actor: Actor, familyId: string | null): Promise<boolean> {
	if (!familyId) return false;
	return (await listPersonFamilyIds(ctx, actor.id)).includes(familyId);
}

/** The one mutation rule, with family's answer filled in. */
async function canMutateTaskAs(ctx: Ctx, actor: Actor, task: TaskRow): Promise<boolean> {
	if (task.userId === actor.id) return true;
	return canMutateTask(task, actor.id, await isMemberOf(ctx, actor, task.familyId));
}

/** The acting person's first name as an Alert names it (`Someone` when the row has none). */
async function actorNameOf(ctx: Ctx, actor: Actor): Promise<string> {
	const person = await getPerson(ctx, actor);
	return person.firstName || 'Someone';
}

/** A person's display names, keyed by id — the two fields every list row carries. */
type PersonName = { readonly firstName: string; readonly lastName: string };

/**
 * The names of the ids a list row already holds, keyed by person id. Identity
 * owns the Users table and this read, so tasks never joins it (rule R3); an id
 * with no row (a removed account) reads as absent → the wire's `null`.
 */
async function nameMap(
	ctx: Ctx,
	ids: Iterable<string>
): Promise<Map<string, PersonName>> {
	const unique = [...new Set(ids)];
	if (unique.length === 0) return new Map();
	const rows = await listPersonNames(ctx, unique);
	return new Map(rows.map((row) => [row.id, { firstName: row.firstName, lastName: row.lastName }]));
}

/** One id's names, or the two nulls the wire carries when nobody knows the id. */
function namesOf(
	names: ReadonlyMap<string, PersonName>,
	id: string | null
): { firstName: string | null; lastName: string | null } {
	const found = id ? names.get(id) : undefined;
	return { firstName: found?.firstName ?? null, lastName: found?.lastName ?? null };
}

/** The tag map's list for one id, sorted (the wire's order; the store claims none). */
function tagsOf(tagMap: ReadonlyMap<string, string[]>, taskId: string): string[] {
	return [...(tagMap.get(taskId) ?? [])].sort();
}

/**
 * Pin every overdue open Recurring Task of the actor's own scope (their rows
 * plus their family's) to today-end in the actor's zone, in one batched UPDATE
 * (legacy `syncRecurringCursors`, #110/#214; moved out of every read by Q-092).
 * The scope's row selection is the repo's; the "is it stale" test is the rule's.
 */
async function pinOverdue(
	ctx: Ctx,
	actor: Actor,
	scope: { readonly userId: string | null; readonly familyId: string | null }
): Promise<void> {
	const zone = await viewerZone(ctx, actor);
	const now = ctx.clock.now();
	const rows = await listPinnableTasks(ctx.db, scope);
	const stale = rows.filter((row) => needsOverduePin(row.dueDate, now, zone)).map((row) => row.id);
	if (stale.length === 0) return;
	await pinDueDates(ctx.db, { taskIds: stale, dueDate: pinnedDueFor(now, zone) });
}

/**
 * The pin a cursor-moving write (check-off, skip) runs AFTER it committed
 * (Q-092). Best-effort: the write already answered its caller's intent, so a
 * failed pin is logged, never turned into a failed request that a retry would
 * apply twice; the scheduled sweep catches whatever it missed.
 */
async function pinAfterWrite(ctx: Ctx, actor: Actor): Promise<void> {
	try {
		const familyId = await resolveMembershipFamilyId(ctx, actor.id);
		await pinOverdue(ctx, actor, { userId: actor.id, familyId });
	} catch (error) {
		ctx.log.error('tasks_pin_failed', {
			message: error instanceof Error ? error.message : String(error)
		});
	}
}

/** Drop the keys a patch did not set, so a repo UPDATE never writes `undefined`. */
function definedPatch(patch: Partial<TaskWritePatch>): TaskWritePatch {
	const out: Record<string, unknown> = {};
	for (const [key, value] of Object.entries(patch)) {
		if (value !== undefined) out[key] = value;
	}
	return out as unknown as TaskWritePatch;
}

// --- Lists ------------------------------------------------------------------

/** What the list read was asked for: a parent Event's checklist, or the caller's own list. */
export type TaskListInput = { readonly eventId?: string | null };

/**
 * The list read — ONE row shape on both legs (Q-055):
 *
 * - no `eventId`: the caller's own rows plus the family rows the Task
 *   Visibility rule allows, newest first, archived excluded, tags sorted, the
 *   parent Event's calendar always present and the phone overlay applied.
 *   Reads never write (Q-092): a stale recurring cursor keeps its stored due
 *   date until the owner's next check-off / skip or the scheduled sweep.
 * - `?eventId=`: the same list shape for the Event's readable rows (Q-005a's
 *   private rule, #164), oldest first. An unknown Event is `{tasks: []}`.
 */
export async function listTasks(
	ctx: Ctx,
	actor: Actor,
	input: TaskListInput = {}
): Promise<readonly TaskListRow[]> {
	const eventId = input.eventId ?? null;
	if (eventId) return await listEventTasks(ctx, actor, eventId);
	const familyId = await resolveMembershipFamilyId(ctx, actor.id);
	return await loadTaskList(ctx, actor, familyId);
}

/** The Event that names a Task, and whether the caller may read it. */
type EventAccess =
	| { readonly kind: 'missing' }
	| { readonly kind: 'denied' }
	| { readonly kind: 'ok' };

/**
 * Calendar's own read answers the access question: a missing Event is
 * `notFound` and an unreadable one `forbidden`, so the wire's `403 No access
 * to this event` comes from one call without tasks reading `calendars` or
 * `calendarShares` (the row's own calendar arrives on the list projection).
 */
async function eventAccess(ctx: Ctx, actor: Actor, eventId: string): Promise<EventAccess> {
	try {
		await getEventForViewer(ctx, actor, eventId);
		return { kind: 'ok' };
	} catch (error) {
		if (error instanceof AppError) {
			if (error.code === 'notFound') return { kind: 'missing' };
			if (error.code === 'forbidden') return { kind: 'denied' };
		}
		throw error;
	}
}

/** The `?eventId=` leg: the list shape, the private read rule and no pin (Q-055). */
async function listEventTasks(
	ctx: Ctx,
	actor: Actor,
	eventId: string
): Promise<readonly TaskListRow[]> {
	const access = await eventAccess(ctx, actor, eventId);
	if (access.kind === 'missing') return [];
	if (access.kind === 'denied') throw forbidden(TASK_EVENT_NO_ACCESS);

	const rows = (await listTasksForEvent(ctx.db, eventId)).filter((task) =>
		canReadTask(task, actor.id)
	);
	return await attachListFields(ctx, actor, rows);
}

/** The main list for one already-resolved family: read, then the shared enrichment. */
async function loadTaskList(
	ctx: Ctx,
	actor: Actor,
	familyId: string | null
): Promise<readonly TaskListRow[]> {
	const rows = (await listTasksForUser(ctx.db, { userId: actor.id, familyId })).filter((row) =>
		canReadTask(row, actor.id)
	);
	return await attachListFields(ctx, actor, rows);
}

/**
 * The list row's derived fields over any Task rows: sorted tags, the
 * assignee's names and the caller's phone overlay. Both list legs share it, so
 * the two shapes can never drift again (Q-055).
 */
async function attachListFields(
	ctx: Ctx,
	actor: Actor,
	rows: readonly TaskRowWithEvent[]
): Promise<readonly TaskListRow[]> {
	const tagMap = await listTagsForTasks(
		ctx.db,
		rows.map((row) => row.id)
	);
	const names = await nameMap(
		ctx,
		rows.map((row) => row.assignedTo).filter((id): id is string => id !== null)
	);
	const overlay = await getPhoneFocusOverlay(ctx, actor);
	return rows.map((row) => {
		const assignee = namesOf(names, row.assignedTo);
		return {
			...row,
			tags: tagsOf(tagMap, row.id),
			assigneeFirstName: assignee.firstName,
			assigneeLastName: assignee.lastName,
			phoneFocusMinutes: overlay.get(row.id)?.phoneFocusMinutes ?? 0,
			phoneFocusStartedAt: overlay.get(row.id)?.phoneFocusStartedAt ?? null
		};
	});
}

/** One section leg's outcome: its rows, and the warning label when the leg failed. */
type SectionLeg<T> = { readonly value: T; readonly warning: string | null };

/** Run one list leg; a failure degrades to its fallback and records its label. */
async function leg<T>(
	ctx: Ctx,
	label: string,
	work: () => Promise<T>,
	fallback: T
): Promise<SectionLeg<T>> {
	try {
		return { value: await work(), warning: null };
	} catch (error) {
		ctx.log.error('tasks_leg_failed', {
			label,
			message: error instanceof Error ? error.message : String(error)
		});
		return { value: fallback, warning: label };
	}
}

/** Enrich one section's rows: names, sorted tags, and no `eventCalendarId` (the section shape). */
async function loadSection(
	ctx: Ctx,
	actor: Actor,
	read: () => Promise<TaskRowWithEvent[]>
): Promise<readonly TaskSectionRow[]> {
	const rows = await read();
	const tagMap = await listTagsForTasks(
		ctx.db,
		rows.map((row) => row.id)
	);
	const names = await nameMap(
		ctx,
		rows.flatMap((row) => [row.assignedTo, row.userId]).filter((id): id is string => id !== null)
	);
	return rows.map((row) => {
		const { eventCalendarId: _dropped, ...rest } = row;
		const assignee = namesOf(names, row.assignedTo);
		const creator = namesOf(names, row.userId);
		return {
			...rest,
			tags: tagsOf(tagMap, row.id),
			assigneeFirstName: assignee.firstName,
			assigneeLastName: assignee.lastName,
			creatorFirstName: creator.firstName
		};
	});
}

/**
 * The three assignment queues: MY TASKS (personal rows plus accepted
 * assignments), TO ACCEPT (pending handoffs to the caller) and REQUESTED (the
 * caller's rows carrying any assignee). The read writes nothing (Q-092); each
 * leg degrades to `[]` with its label in `warnings` instead of failing the
 * whole read.
 */
export async function listTaskSections(ctx: Ctx, actor: Actor): Promise<{
	readonly myTasks: readonly TaskSectionRow[];
	readonly pendingAssignments: readonly TaskSectionRow[];
	readonly requestedByMe: readonly TaskSectionRow[];
	readonly warnings: readonly string[];
}> {
	const myTasks = await leg(
		ctx,
		'myTasks',
		async () => await loadSection(ctx, actor, async () => await listMyTasks(ctx.db, actor.id)),
		[]
	);
	const pending = await leg(
		ctx,
		'pending',
		async () =>
			await loadSection(ctx, actor, async () => await listPendingAssignments(ctx.db, actor.id)),
		[]
	);
	const requested = await leg(
		ctx,
		'requested',
		async () => await loadSection(ctx, actor, async () => await listRequestedByMe(ctx.db, actor.id)),
		[]
	);
	const warnings = [myTasks.warning, pending.warning, requested.warning].filter(
		(warning): warning is string => warning !== null
	);
	return {
		myTasks: myTasks.value,
		pendingAssignments: pending.value,
		requestedByMe: requested.value,
		warnings
	};
}

/** The calendar page's due window: ISO instants bounding one month's grid. */
export type TaskDueWindowInput = { readonly fromIso: string; readonly toIso: string };

/**
 * The due-window read (`calendarPage` composes it): open Tasks whose due date
 * falls inside the window — own rows plus the family's readable ones — with
 * the same list-row fields the main list carries (tags, assignee names, phone
 * overlay), so a calendar chip and the tasks page never disagree about a row.
 * Reads write nothing (Q-092): a stale recurring cursor keeps its stored due date.
 */
export async function listDueTasks(
	ctx: Ctx,
	actor: Actor,
	input: TaskDueWindowInput
): Promise<readonly TaskListRow[]> {
	const familyId = await resolveMembershipFamilyId(ctx, actor.id);
	const rows = (await listDueTaskRows(ctx.db, {
		userId: actor.id,
		familyId,
		fromIso: input.fromIso,
		toIso: input.toIso
	})).filter((row) => canReadTask(row, actor.id));
	return await attachListFields(ctx, actor, rows);
}

/**
 * The Family Task Board for one family: every READABLE family Task (a private
 * one only for its owner or its assignee, Q-005a) plus the members' PUBLIC
 * personal Tasks, both with names and tags and neither with
 * `eventCalendarId`. A caller outside the family gets the board's one 404. The
 * read writes nothing (Q-092): it used to pin the roster's cursors first.
 */
export async function listFamilyTasks(
	ctx: Ctx,
	actor: Actor,
	input: { readonly familyId: string }
): Promise<TaskFamilyBoardRows> {
	if (!(await isMemberOf(ctx, actor, input.familyId))) throw notFound(TASK_FAMILY_NOT_FOUND);
	const roster = await listFamilyRoster(ctx, actor, input.familyId);
	const memberIds = roster.members.map((member) => member.userId);

	const familyRows = (await listFamilyTaskRows(ctx.db, input.familyId)).filter((row) =>
		canReadTask(row, actor.id)
	);
	const publicRows = await listPublicFamilyTasks(ctx.db, memberIds);
	const names = await nameMap(
		ctx,
		[...familyRows, ...publicRows]
			.flatMap((row) => [row.assignedTo, row.userId])
			.filter((id): id is string => id !== null)
	);
	const enrich = async (rows: TaskRowWithEvent[]): Promise<TaskSectionRow[]> => {
		const tagMap = await listTagsForTasks(
			ctx.db,
			rows.map((row) => row.id)
		);
		return rows.map((row) => {
			const { eventCalendarId: _dropped, ...rest } = row;
			const assignee = namesOf(names, row.assignedTo);
			const creator = namesOf(names, row.userId);
			return {
				...rest,
				tags: tagsOf(tagMap, row.id),
				assigneeFirstName: assignee.firstName,
				assigneeLastName: assignee.lastName,
				creatorFirstName: creator.firstName
			};
		});
	};
	return {
		familyTasks: await enrich(familyRows),
		publicTasks: await enrich(publicRows)
	};
}

// --- Mutations --------------------------------------------------------------

/** The assignment columns a request may patch (the rule's own shape). */
type AssignmentPatch = { readonly assignedTo?: string | null; readonly assignmentStatus?: string };

/**
 * `POST /api/tasks`: defaults, the event/family/assignee checks, category
 * auto-add and the pending handoff's Alert, then one transaction for the row
 * and its tag rows.
 *
 * Defaults kept from legacy: absent `familyId` is the caller's family (`null`
 * is personal), absent `assignedTo` is the creator with an ACCEPTED status,
 * `visibility` defaults to public, an unknown frequency is already `null`, the
 * interval floors to ≥ 1 only when the row recurs, and `focusMinutes` /
 * `focusStartedAt` are accepted for the desktop's own pushes.
 */
export async function createTask(
	ctx: Ctx,
	actor: Actor,
	body: TaskCreateBody
): Promise<TaskWithTagsRow> {
	if (body.eventId) {
		const access = await eventAccess(ctx, actor, body.eventId);
		if (access.kind === 'missing') throw invalid(TASK_EVENT_NOT_FOUND);
		if (access.kind === 'denied') throw forbidden(TASK_EVENT_NO_ACCESS);
	}

	let familyId: string | null;
	if (body.familyId === undefined) {
		familyId = await resolveMembershipFamilyId(ctx, actor.id);
	} else if (body.familyId === null) {
		familyId = null;
	} else {
		if (!(await isMemberOf(ctx, actor, body.familyId))) throw forbidden(TASK_NOT_FAMILY_MEMBER);
		familyId = body.familyId;
	}

	const assignedTo = body.assignedTo ?? actor.id;
	if (assignedTo !== actor.id) {
		// A second person may only be assigned when THIS family reaches them.
		const targetIsMember = familyId
			? (await listPersonFamilyIds(ctx, assignedTo)).includes(familyId)
			: false;
		if (!targetIsMember) throw invalid(TASK_ASSIGNEE_NOT_MEMBER);
	}
	const assignmentStatus = assignedTo === actor.id ? 'accepted' : 'pending';

	const category = body.category
		? (await ensureTaskCategory(ctx, actor, body.category)).name
		: null;
	const tags = normalizeTags(body.tags);

	const created = await withTx(ctx, async (txCtx) => {
		const row = await insertTask(txCtx.db, {
			title: body.title,
			notes: body.notes ?? null,
			dueDate: body.dueDate ?? null,
			recurrenceFrequency: body.recurrenceFrequency ?? null,
			recurrenceInterval: body.recurrenceFrequency
				? Math.max(1, Math.floor(body.recurrenceInterval ?? 1))
				: null,
			assignedTo,
			assignmentStatus,
			priority: body.priority,
			visibility: body.visibility,
			userId: actor.id,
			familyId,
			eventId: body.eventId ?? null,
			focusMinutes: body.focusMinutes ?? null,
			focusStartedAt: body.focusStartedAt ?? null,
			category
		});
		await insertTaskTags(txCtx.db, row.id, tags);
		return row;
	});

	if (assignmentStatus === 'pending' && assignedTo !== actor.id) {
		const actorName = await actorNameOf(ctx, actor);
		await createAlert(ctx, actor, {
			userId: assignedTo,
			type: 'assignment_pending',
			actorName,
			message: `${actorName} assigned you '${created.title}'`,
			link: TASKS_ALERT_LINK
		});
	}
	return { ...created, tags };
}

/**
 * `PUT /api/tasks/[id]`: the body dispatch in legacy order — `undoComplete`,
 * `advanceToNext`, `toggleComplete`, then the field patch. The three cursor
 * actions answer the bare row; the field patch answers the row plus tags.
 * A check-off or a skip then pins the actor's other overdue Recurring Tasks
 * (Q-092: the pin runs on writes and the sweep, never on a read); an undo
 * restores its exact previous cursor and does not pin.
 */
export async function updateTask(
	ctx: Ctx,
	actor: Actor,
	input: { readonly taskId: string; readonly body: TaskUpdateBody }
): Promise<TaskUpdatedRow> {
	const body = input.body;
	if (body.undoComplete) {
		return await undoTaskCompletion(ctx, actor, {
			taskId: input.taskId,
			previousDueDate: body.previousDueDate
		});
	}
	if (body.advanceToNext) {
		const row = await skipTaskOccurrence(ctx, actor, { taskId: input.taskId });
		await pinAfterWrite(ctx, actor);
		return row;
	}
	if (body.toggleComplete) {
		const row = await toggleTaskCompletion(ctx, actor, { taskId: input.taskId });
		await pinAfterWrite(ctx, actor);
		return row;
	}
	return await patchTaskFields(ctx, actor, input.taskId, body);
}

/** The field patch: per-caller layering, the collaborator write, and the two assignment Alerts. */
async function patchTaskFields(
	ctx: Ctx,
	actor: Actor,
	taskId: string,
	body: TaskUpdateBody
): Promise<TaskWithTagsRow> {
	const existing = await findTask(ctx.db, taskId);

	// Recurrence (#231): an interval may be patched alone only while the STORED
	// task recurs; with a frequency it rides along (default 1); a null frequency
	// clears both.
	const frequency = body.recurrenceFrequency;
	const rawInterval = body.recurrenceInterval;
	const toInterval = (value: number | undefined): number => Math.max(1, Math.floor(value ?? 1));
	let recurrenceInterval: number | null | undefined;
	if (frequency === null) recurrenceInterval = null;
	else if (frequency !== undefined) recurrenceInterval = toInterval(rawInterval);
	else if (typeof rawInterval === 'number' && existing?.recurrenceFrequency) {
		recurrenceInterval = toInterval(rawInterval);
	}

	// Visibility is owner-only, checked BEFORE any mutation so a non-owner's
	// request can neither change it nor ride along with it.
	if (body.visibility !== undefined) {
		if (!existing) throw notFound(TASK_NOT_FOUND);
		if (existing.userId !== actor.id) throw forbidden(TASK_VISIBILITY_OWNER_ONLY);
	}

	// Assignment transitions: only the current assignee may accept or decline;
	// reassignment and clearing stay owner-only (the rule answers `null`).
	let assignmentPatch: AssignmentPatch = {};
	if (body.assignedTo === null) {
		assignmentPatch = { assignedTo: null, assignmentStatus: 'none' };
	} else if (body.assignedTo !== undefined && existing?.assignedTo === body.assignedTo) {
		// Unchanged assignee (#233): edit dialogs re-send the current value on
		// every save — not an assignment change, no reset and no Alert.
	} else if (body.assignedTo !== undefined) {
		// A missing row skips the check (legacy guards it with `target &&`) and
		// falls through to the 404, exactly like an unknown id.
		if (body.assignedTo !== actor.id && existing) {
			const targetIsMember = existing.familyId
				? (await listPersonFamilyIds(ctx, body.assignedTo)).includes(existing.familyId)
				: false;
			if (!targetIsMember) throw invalid(TASK_ASSIGNEE_NOT_MEMBER);
		}
		assignmentPatch = {
			assignedTo: body.assignedTo,
			assignmentStatus: body.assignedTo === actor.id ? 'accepted' : 'pending'
		};
	} else if (body.assignmentStatus === 'accepted') {
		assignmentPatch = { assignmentStatus: 'accepted' };
	} else if (body.assignmentStatus === 'declined') {
		assignmentPatch = { assignedTo: null, assignmentStatus: 'none' };
	}

	const category = body.category
		? (await ensureTaskCategory(ctx, actor, body.category)).name
		: body.category === null
			? null
			: undefined;
	const tags = body.tags === undefined ? undefined : normalizeTags(body.tags);

	const fieldPatch = definedPatch({
		title: body.title,
		notes: body.notes,
		dueDate: body.dueDate,
		priority: body.priority,
		recurrenceFrequency: frequency,
		recurrenceInterval,
		focusMinutes: body.focusMinutes,
		focusStartedAt: body.focusStartedAt,
		category
	});

	// The owner's patch is the plain fields plus visibility and the assignment
	// transition; the collaborator path below re-scopes the assignment first.
	const ownerPatch = definedPatch({
		...fieldPatch,
		visibility: body.visibility,
		...assignmentPatch
	});
	let updated = await writeOwned(ctx, actor, taskId, ownerPatch, tags);

	// Non-owner collaborators (#232): a live assignee, or any member of a
	// Family Task, may edit the plain fields and tags, and answer their own
	// assignment. No rights -> the same 404 as an unknown id.
	if (!updated && existing && existing.userId !== actor.id) {
		if (await canMutateTaskAs(ctx, actor, existing)) {
			const scoped = nextAssignmentPatch(existing, actor.id, assignmentPatch);
			if (!scoped) throw forbidden(TASK_ONLY_OWN_ASSIGNMENTS);
			updated = await writeCollaborator(ctx, taskId, existing.familyId, {
				...fieldPatch,
				...scoped
			}, tags);
		}
	}
	if (!updated) throw notFound(TASK_NOT_FOUND);

	const accepted = assignmentPatch.assignmentStatus === 'accepted';
	const declined = body.assignmentStatus === 'declined';
	if (updated.row.userId !== actor.id && (accepted || declined)) {
		const actorName = await actorNameOf(ctx, actor);
		await createAlert(ctx, actor, {
			userId: updated.row.userId,
			type: accepted ? 'assignment_accepted' : 'assignment_declined',
			actorName,
			message: accepted
				? `${actorName} accepted '${updated.row.title}'`
				: `${actorName} declined '${updated.row.title}'`,
			link: TASKS_ALERT_LINK
		});
	}

	// Owner-initiated reassignment: the NEW assignee is told; a self-assign is
	// 'accepted' and never notifies.
	const pendingAssignee =
		assignmentPatch.assignmentStatus === 'pending' &&
		assignmentPatch.assignedTo !== undefined &&
		updated.row.assignedTo === assignmentPatch.assignedTo
			? assignmentPatch.assignedTo
			: null;
	if (pendingAssignee && pendingAssignee !== actor.id) {
		const actorName = await actorNameOf(ctx, actor);
		await createAlert(ctx, actor, {
			userId: pendingAssignee,
			type: 'assignment_pending',
			actorName,
			message: `${actorName} assigned you '${updated.row.title}'`,
			link: TASKS_ALERT_LINK
		});
	}
	return { ...updated.row, tags: updated.tags };
}

/** One written row and its tag set. */
type WrittenTask = { readonly row: TaskRow; readonly tags: readonly string[] };

/**
 * The owner's write: patch their row, replace the tag set when the body sent
 * one (an absent `tags` keeps the stored set), and answer the row plus tags. A
 * patch with nothing in it still answers the row (legacy read-back), `null` only
 * when the row is missing or not theirs.
 */
async function writeOwned(
	ctx: Ctx,
	actor: Actor,
	taskId: string,
	patch: TaskWritePatch,
	tags: readonly string[] | undefined
): Promise<WrittenTask | null> {
	return await withTx(ctx, async (txCtx) => {
		// Owner-scoped first: `updateTaskById` is unscoped, so the read that
		// proves ownership must precede it (legacy `updateTask`'s WHERE userId).
		const owned = await findOwnedTask(txCtx.db, taskId, actor.id);
		if (!owned) return null;
		const row =
			Object.keys(patch).length > 0
				? await updateTaskById(txCtx.db, taskId, patch)
				: owned;
		if (!row) return null;
		if (tags !== undefined) {
			await replaceTaskTags(txCtx.db, row.id, tags);
			return { row, tags: [...tags].sort() };
		}
		return { row, tags: tagsOf(await listTagsForTasks(txCtx.db, [row.id]), row.id) };
	});
}

/**
 * The collaborator's write (#232): scoped by the STORED family (`null` scopes
 * to personal rows), visibility is never written here, and an empty patch with
 * no tags is a miss (legacy `updateTaskInFamily`).
 */
async function writeCollaborator(
	ctx: Ctx,
	taskId: string,
	familyId: string | null,
	patch: TaskWritePatch,
	tags: readonly string[] | undefined
): Promise<WrittenTask | null> {
	const hasPatch = Object.keys(patch).length > 0;
	if (!hasPatch && tags === undefined) return null;
	return await withTx(ctx, async (txCtx) => {
		let row: TaskRow | null = null;
		if (hasPatch) {
			row = await updateTaskInFamily(txCtx.db, taskId, familyId, patch);
		} else {
			// A tags-only collaborator edit reads its row under the same family scope.
			const found = await findTask(txCtx.db, taskId);
			row = found && found.familyId === familyId ? found : null;
		}
		if (!row) return null;
		if (tags !== undefined) {
			await replaceTaskTags(txCtx.db, row.id, tags);
			return { row, tags: [...tags].sort() };
		}
		return { row, tags: tagsOf(await listTagsForTasks(txCtx.db, [row.id]), row.id) };
	});
}

/**
 * `DELETE /api/tasks/[id]`: an open Task is hard-deleted, a completed one is
 * archived (its row backs stats and the streak). Unknown or no rights is the
 * same 404.
 */
export async function deleteTask(
	ctx: Ctx,
	actor: Actor,
	input: { readonly taskId: string }
): Promise<void> {
	const task = await findTask(ctx.db, input.taskId);
	if (!task || !(await canMutateTaskAs(ctx, actor, task))) throw notFound(TASK_NOT_FOUND);
	if (task.completedAt) {
		await archiveTaskById(ctx.db, task.id, ctx.clock.now().toISOString());
	} else {
		await deleteTaskById(ctx.db, task.id);
	}
}

/**
 * `DELETE /api/tasks/completed`: archive the caller's OWN completed rows plus
 * the completed assignments they ACCEPTED (Q-059), and report how many moved.
 */
export async function clearCompletedTasks(ctx: Ctx, actor: Actor): Promise<number> {
	return await archiveViewerCompletedTasks(ctx.db, actor.id, ctx.clock.now().toISOString());
}

/**
 * The `family` module's `MemberTasksPort.unassignMemberTasks`: clear a removed
 * member's Family Task assignments (`assignedTo = null`,
 * `assignmentStatus = 'none'`) so no pending handoff strands on someone who
 * left. family calls this inside its removal transaction, so it writes through
 * the caller's `ctx.db` and opens no transaction of its own.
 */
export async function unassignMemberTasks(
	ctx: Ctx,
	familyId: string,
	userId: string
): Promise<void> {
	const rows = await listFamilyTaskRows(ctx.db, familyId);
	for (const row of rows) {
		if (row.assignedTo !== userId) continue;
		await updateTaskById(ctx.db, row.id, { assignedTo: null, assignmentStatus: 'none' });
	}
}
