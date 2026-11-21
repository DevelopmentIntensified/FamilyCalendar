/**
 * calendar bulk edits: the five operations `POST /api/events/bulk` answers —
 * delete, calendar move, location, attendant merge, and the deterministic
 * smart plan.
 *
 * Ported from the bulk route + `bulkApplyService.ts` (one code path, not two).
 * Every id is scoped twice, as legacy is: the READ leg (`eventAccessFilter`)
 * decides what the batch may target, the WRITE leg (#165) decides what may
 * actually change — an uneditable match fails per item rather than aborting
 * the batch. The smart plan's `delete` op counts as applied even when the
 * owner leg refused it, which `calendar.bulk.http.db.test.ts` pins as today's
 * behaviour.
 *
 * The cloud-AI planner is deliberately absent (Q-050): no provider port means
 * an instruction the deterministic planner cannot match is the 422, not a
 * vendor call. That is also why no billing gate is consulted here — the
 * legacy route had none.
 *
 * Doc: ./README.md#invariants
 */
import { DateTime } from 'luxon';
import type { Actor } from '$lib/kernel/ctx/actor';
import type { Ctx } from '$lib/kernel/ctx/ctx.server';
import { withTx } from '$lib/kernel/db/database.server';
import { forbidden, invalid, unprocessable } from '$lib/kernel/errors/appError';
import type { NewEventRow } from '$lib/kernel/db/tables.server';
import { toInstantString } from '$lib/kernel/time/dates';
import { listFamilies, listPersonFamilyIds } from '$lib/domains/family/index.server';
import { getTimeZone } from '$lib/domains/identity/index.server';
import { CALENDAR_COPY } from './calendar.contract';
import {
	parseBulkPlan,
	planBulkEdits,
	type BulkCalendarRef,
	type BulkEventSummary,
	type BulkPlanOp
} from './calendar.bulkPlan.rules';
import { shiftException } from './calendar.occurrence.rules';
import { resolveMasterId } from './calendar.occurrence.rules';
import {
	deleteEventRow,
	deleteGuestRows,
	deleteMirrorRows,
	findAccessibleCalendarIds,
	findAccessibleEventIds,
	findCalendars,
	findEvent,
	findExceptions,
	findOwnedCalendarIds,
	insertGuestRows,
	listEventPlannerRows,
	listGuestNames,
	updateEventRow,
	updateExceptionRow,
	updateMirrorRows
} from './calendar.repo.server';
import { nudgeCalendarEventsChanged } from './calendar.calendars.service.server';

/** One per-item failure, in the order the items were applied. */
export type CalendarBulkFailure = { readonly id: string; readonly error: string };

/** The applied answer the three simple ops and the smart path share. */
export type CalendarBulkApplied = {
	readonly success: true;
	readonly applied: number;
	/** Present on the per-item ops; the smart path answers just `applied`. */
	readonly failed?: readonly CalendarBulkFailure[];
};

/** The dry-run answer: the plan the user reviews before it runs. */
export type CalendarBulkPlanAnswer = {
	readonly success: true;
	readonly plan: readonly BulkPlanOp[];
};

/** The body `POST /api/events/bulk` posts, read leniently (the flow owns the copy). */
export type CalendarBulkInput = {
	readonly ids?: unknown;
	readonly op?: unknown;
	readonly plan?: unknown;
	readonly dryRun?: unknown;
};

/** The fields of the op actually read, once its tag is known. */
type BulkOpFields = {
	readonly type: string;
	readonly calendarId?: string;
	readonly location?: string;
	readonly add?: unknown;
	readonly instruction?: string;
};

/** A posted item: only `id` matters, and a composite id resolves to its master. */
// oxlint-disable-next-line anti-slop/no-unknown-parameters, anti-slop/no-runtime-typeof -- boundary: the posted bulk body is untyped JSON.
function readBulkItems(ids: unknown): { readonly id: string }[] {
	if (!Array.isArray(ids)) return [];
	const items: { readonly id: string }[] = [];
	for (const item of ids) {
		if (item && typeof item === 'object' && 'id' in item && typeof item.id === 'string') {
			items.push({ id: item.id });
		}
	}
	return items;
}

// oxlint-disable-next-line anti-slop/no-unknown-parameters, anti-slop/no-runtime-typeof -- boundary: the posted bulk body is untyped JSON.
function readBulkOp(op: unknown): BulkOpFields | null {
	if (typeof op !== 'object' || op === null) return null;
	if (!('type' in op) || typeof op.type !== 'string') return null;
	const fields: {
		type: string;
		calendarId?: string;
		location?: string;
		add?: unknown;
		instruction?: string;
	} = { type: op.type };
	if ('calendarId' in op && typeof op.calendarId === 'string') fields.calendarId = op.calendarId;
	if ('location' in op && typeof op.location === 'string') fields.location = op.location;
	if ('add' in op) fields.add = op.add;
	if ('instruction' in op && typeof op.instruction === 'string') {
		fields.instruction = op.instruction;
	}
	return fields;
}

/** The two scope sets the write legs need, resolved once per request. */
type BulkScope = {
	readonly accessibleCalendarIds: readonly string[];
	readonly ownedCalendarIds: readonly string[];
};

/** The viewer's read scope: own calendars plus every family's (#098). */
async function accessibleCalendarIdsFor(ctx: Ctx, userId: string): Promise<string[]> {
	const familyIds = await listPersonFamilyIds(ctx, userId);
	return await findAccessibleCalendarIds(ctx.db, userId, familyIds);
}

/** The #165 write leg: own the Event, or own the Calendar it sits on. */
function mayMutate(
	row: { readonly ownerId: string; readonly calendarId: string | null },
	actorId: string,
	ownedCalendarIds: readonly string[]
): boolean {
	return (
		row.ownerId === actorId ||
		(row.calendarId !== null && ownedCalendarIds.includes(row.calendarId))
	);
}

/** The read leg: own the Event, or see its Calendar. */
function mayRead(
	row: { readonly ownerId: string; readonly calendarId: string | null },
	actorId: string,
	accessibleCalendarIds: readonly string[]
): boolean {
	return (
		row.ownerId === actorId ||
		(row.calendarId !== null && accessibleCalendarIds.includes(row.calendarId))
	);
}

/** The columns a master edit copies onto its family-mirror rows (no calendar move). */
function mirrorPatch(patch: Partial<NewEventRow>): Partial<NewEventRow> {
	const mirrored: Partial<NewEventRow> = {};
	if (patch.title !== undefined) mirrored.title = patch.title;
	if (patch.start !== undefined) mirrored.start = patch.start;
	if (patch.end !== undefined) mirrored.end = patch.end;
	if (patch.allDay !== undefined) mirrored.allDay = patch.allDay;
	if (patch.location !== undefined) mirrored.location = patch.location;
	if (patch.description !== undefined) mirrored.description = patch.description;
	if (patch.recurrenceFrequency !== undefined) {
		mirrored.recurrenceFrequency = patch.recurrenceFrequency;
	}
	if (patch.recurrenceInterval !== undefined) mirrored.recurrenceInterval = patch.recurrenceInterval;
	if (patch.recurrenceByDay !== undefined) mirrored.recurrenceByDay = patch.recurrenceByDay;
	if (patch.recurrenceCount !== undefined) mirrored.recurrenceCount = patch.recurrenceCount;
	if (patch.recurrenceUntil !== undefined) mirrored.recurrenceUntil = patch.recurrenceUntil;
	return mirrored;
}

/**
 * Legacy `updateEventById`: scoped read, write leg, the whole-series
 * Exception Override shift, then mirror propagation — all one transaction.
 * Returns false when the row vanished or the caller may not rewrite it.
 */
async function updateScopedEvent(
	ctx: Ctx,
	actorId: string,
	scope: BulkScope,
	id: string,
	patch: Partial<NewEventRow>
): Promise<boolean> {
	return await withTx(ctx, async (txCtx) => {
		const existing = await findEvent(txCtx.db, id);
		if (!existing || !mayRead(existing, actorId, scope.accessibleCalendarIds)) return false;
		if (!mayMutate(existing, actorId, scope.ownedCalendarIds)) return false;

		const updated = await updateEventRow(txCtx.db, id, patch);
		if (!updated) return false;

		// A whole-series move re-anchors every occurrence slot, so the
		// overrides keyed to the ORIGINAL slot shift by the same delta.
		if (patch.start !== undefined && existing.recurrenceFrequency) {
			const deltaMs = new Date(patch.start).getTime() - new Date(existing.start).getTime();
			if (deltaMs !== 0) {
				for (const exception of await findExceptions(txCtx.db, [id])) {
					await updateExceptionRow(
						txCtx.db,
						exception.id,
						shiftException(exception, deltaMs)
					);
				}
			}
		}

		const mirrored = mirrorPatch(patch);
		if (Object.keys(mirrored).length > 0) await updateMirrorRows(txCtx.db, id, mirrored);
		return true;
	});
}

/**
 * Legacy `deleteEventInScope`: the read leg, the write leg, then the row and
 * its mirror copies. Returns the number of masters removed (0 when refused).
 */
async function deleteScopedEvent(
	ctx: Ctx,
	actorId: string,
	scope: BulkScope,
	id: string
): Promise<number> {
	return await withTx(ctx, async (txCtx) => {
		const existing = await findEvent(txCtx.db, id);
		if (!existing || !mayRead(existing, actorId, scope.accessibleCalendarIds)) return 0;
		if (!mayMutate(existing, actorId, scope.ownedCalendarIds)) return 0;
		const removed = await deleteEventRow(txCtx.db, id);
		if (removed > 0) await deleteMirrorRows(txCtx.db, id);
		return removed;
	});
}

/** Merge guest names case-insensitively, read and write in one transaction. */
async function mergeAttendants(
	ctx: Ctx,
	id: string,
	add: readonly string[]
): Promise<boolean> {
	await withTx(ctx, async (txCtx) => {
		const existing = await listGuestNames(txCtx.db, id);
		const merged = [...existing];
		const seen = new Set(existing.map((name) => name.toLowerCase()));
		for (const name of add) {
			if (!seen.has(name.toLowerCase())) {
				merged.push(name);
				seen.add(name.toLowerCase());
			}
		}
		await deleteGuestRows(txCtx.db, id);
		await insertGuestRows(txCtx.db, id, merged);
	});
	return true;
}

/**
 * Legacy `applySmartOp`: one planned change, or false when the row is gone or
 * the caller may not rewrite it. `zone` is where the plan's calendar dates are
 * read; the hour of day survives a date-only move.
 */
async function applySmartOp(
	ctx: Ctx,
	actorId: string,
	scope: BulkScope,
	op: BulkPlanOp,
	zone: string
): Promise<boolean> {
	const event = await findEvent(ctx.db, op.id);
	if (!event) return false;

	const accessible = new Set(scope.accessibleCalendarIds);
	const calendarId =
		op.calendarId && accessible.has(op.calendarId) ? op.calendarId : undefined;

	if (
		calendarId &&
		!op.title &&
		!op.date &&
		!op.startTime &&
		!op.endTime &&
		!op.location &&
		op.allDay === undefined
	) {
		return await updateScopedEvent(ctx, actorId, scope, op.id, { calendarId });
	}

	const startIso = toInstantString(event.start);
	if (!startIso) return false;
	const startDt = DateTime.fromISO(startIso, { zone });
	if (!startDt.isValid) return false;

	// The plan's date is a viewer-zone calendar date; interpret it in the same
	// zone so the stored instant lands on the intended day.
	const date = op.date ?? startDt.toISODate();
	if (!date) return false;
	const allDay = op.allDay ?? event.allDay;

	const startTime: string = allDay ? '00:00' : (op.startTime ?? startDt.toFormat('HH:mm'));
	const rawEnd = toInstantString(event.end);
	const endDt = rawEnd ? DateTime.fromISO(rawEnd, { zone }) : null;
	let endTime: string | null = allDay
		? '23:59'
		: (op.endTime ??
			(endDt?.isValid && endDt.toISODate() === date ? endDt.toFormat('HH:mm') : null));

	if (!endTime && startTime) {
		endTime = DateTime.fromFormat(startTime, 'HH:mm', { zone })
			.plus({ hours: 1 })
			.toFormat('HH:mm');
	}

	const start = DateTime.fromFormat(`${date} ${startTime}`, 'yyyy-MM-dd HH:mm', { zone }).toISO();
	const end = endTime
		? DateTime.fromFormat(`${date} ${endTime}`, 'yyyy-MM-dd HH:mm', { zone }).toISO()
		: null;
	if (!start) return false;

	return await updateScopedEvent(ctx, actorId, scope, op.id, {
		title: op.title ?? event.title,
		start,
		end,
		allDay,
		location: op.location ?? event.location,
		calendarId: calendarId ?? event.calendarId
	});
}

/** Per-item apply: one failure never aborts the batch, and `applied` is real. */
async function applyPerItem(
	ids: readonly string[],
	apply: (id: string) => Promise<number | boolean>
): Promise<{ readonly applied: number; readonly failed: CalendarBulkFailure[] }> {
	const failed: CalendarBulkFailure[] = [];
	let applied = 0;
	for (const id of ids) {
		try {
			const result = await apply(id);
			// Scoped actions report 0 when the row vanished mid-batch — that item
			// did NOT apply.
			if (result === 0 || result === false) failed.push({ id, error: 'not found' });
			else applied++;
		} catch (error) {
			failed.push({ id, error: error instanceof Error ? error.message : 'Failed' });
		}
	}
	return { applied, failed };
}

/** The calendars the planner may name, labelled as the page shows them. */
async function plannerCalendarRefs(
	ctx: Ctx,
	actor: Actor,
	scope: BulkScope
): Promise<BulkCalendarRef[]> {
	// Sequential, not Promise.all: the ctx db may be one transaction session.
	const rows = await findCalendars(ctx.db, scope.accessibleCalendarIds);
	const family = await listFamilies(ctx, actor);
	const familyNames = new Map(family.families.map((card) => [card.id, card.name]));
	return rows.map((calendar) => ({
		id: calendar.id,
		name: calendar.familyId
			? familyNames.get(calendar.familyId) || 'Family Calendar'
			: 'Personal Calendar'
	}));
}

/**
 * `POST /api/events/bulk`. `ids` are scoped once, then the op decides what
 * each id gets; a smart edit may be posted as a reviewed `plan` (the client's
 * echo) or planned here from the instruction.
 */
export async function bulkEditEvents(
	ctx: Ctx,
	actor: Actor,
	input: CalendarBulkInput
): Promise<CalendarBulkApplied | CalendarBulkPlanAnswer> {
	const items = readBulkItems(input.ids);
	const op = readBulkOp(input.op);
	if (items.length === 0 || !op) throw invalid(CALENDAR_COPY.bulkIdsAndOpRequired);

	const masterIds = [
		...new Set(items.map((item) => resolveMasterId(item.id)).filter((id): id is string => !!id))
	];
	if (masterIds.length === 0) throw invalid(CALENDAR_COPY.bulkNoValidIds);

	const accessibleCalendarIds = await findAccessibleCalendarIdsFor(ctx, actor.id);
	const ownedCalendarIds = await findOwnedCalendarIds(ctx.db, actor.id);
	const scope: BulkScope = { accessibleCalendarIds, ownedCalendarIds };
	const editableIds = await findAccessibleEventIds(
		ctx.db,
		masterIds,
		actor.id,
		accessibleCalendarIds
	);
	if (editableIds.length === 0) throw forbidden(CALENDAR_COPY.bulkNoEditableEvents);

	// ONE nudge per request, never awaited, only when something applied; the
	// audience is the accessible scope, so moves are included.
	const nudge = (applied: number) => {
		if (applied > 0) void nudgeCalendarEventsChanged(ctx, actor, accessibleCalendarIds);
	};

	if (op.type === 'delete') {
		const results = await applyPerItem(editableIds, (id) =>
			deleteScopedEvent(ctx, actor.id, scope, id)
		);
		nudge(results.applied);
		return { success: true, ...results };
	}

	if (op.type === 'calendar') {
		if (!op.calendarId) throw invalid(CALENDAR_COPY.bulkCalendarIdRequired);
		if (!accessibleCalendarIds.includes(op.calendarId)) {
			throw forbidden(CALENDAR_COPY.calendarNotAccessible);
		}
		const calendarId = op.calendarId;
		const results = await applyPerItem(editableIds, (id) =>
			updateScopedEvent(ctx, actor.id, scope, id, { calendarId })
		);
		nudge(results.applied);
		return { success: true, ...results };
	}

	if (op.type === 'location') {
		const location = String(op.location ?? '').trim() || null;
		const results = await applyPerItem(editableIds, (id) =>
			updateScopedEvent(ctx, actor.id, scope, id, { location })
		);
		nudge(results.applied);
		return { success: true, ...results };
	}

	if (op.type === 'attendants') {
		const add = Array.isArray(op.add)
			? op.add.map((name) => String(name).trim()).filter(Boolean)
			: [];
		if (add.length === 0) throw invalid(CALENDAR_COPY.bulkAddNamesRequired);
		const results = await applyPerItem(editableIds, (id) => mergeAttendants(ctx, id, add));
		nudge(results.applied);
		return { success: true, ...results };
	}

	if (op.type === 'smart') {
		const instruction = String(op.instruction ?? '').trim();
		if (!instruction) throw invalid(CALENDAR_COPY.bulkInstructionRequired);

		const zone = (await getTimeZone(ctx, actor.id)) ?? 'utc';
		const now = ctx.clock.now();

		let rawOps: readonly unknown[];
		if (Array.isArray(input.plan)) {
			// Phase 2: the client echoes the reviewed plan — execute it exactly.
			rawOps = input.plan;
		} else {
			const rows = await listEventPlannerRows(ctx.db, editableIds);
			const summaries: BulkEventSummary[] = rows.map((row) => ({
				id: row.id,
				title: row.title,
				start: new Date(row.start).toISOString(),
				location: row.location
			}));
			const planned = planBulkEdits(
				instruction,
				summaries,
				DateTime.fromJSDate(now, { zone }).toISODate() ?? '',
				await plannerCalendarRefs(ctx, actor, scope)
			);
			// The vocabulary's one 422: the request is fine, the instruction is
			// not actionable. Thrown so the endpoint's AppError mapping answers it.
			if (planned.length === 0) throw unprocessable(CALENDAR_COPY.bulkNoMatch);
			if (input.dryRun === true) return { success: true, plan: planned };
			rawOps = planned;
		}

		// Re-validate whatever plan we have against the editable ids only.
		const plan = parseBulkPlan(JSON.stringify({ ops: rawOps }), editableIds);
		if (plan.length === 0) throw unprocessable(CALENDAR_COPY.bulkNoValidChanges);

		let applied = 0;
		for (const planOp of plan) {
			// Legacy counts a plan delete as applied without looking at what the
			// scoped delete returned (pinned by the bulk golden).
			if (planOp.delete) {
				await deleteScopedEvent(ctx, actor.id, scope, planOp.id);
				applied++;
				continue;
			}
			if (await applySmartOp(ctx, actor.id, scope, planOp, zone)) applied++;
		}
		nudge(applied);
		return { success: true, applied };
	}

	throw invalid(CALENDAR_COPY.bulkUnknownOp);
}
