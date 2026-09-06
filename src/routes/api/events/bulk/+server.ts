import { json } from '@sveltejs/kit';
import { apiError } from '$lib/server/utils/apiError';
import type { RequestHandler } from './$types';
import { db } from '$lib/server/db';
import {
	calendars,
	events,
	families,
	eventAttendance,
	type CalendarEvent
} from '$lib/server/db/schema';
import { and, eq, inArray, or, sql } from 'drizzle-orm';
import { getUserFamilyId } from '$lib/server/db/actions/families';
import { getAccessibleCalendarIds, eventAccessFilter } from '$lib/server/db/actions/calendarScope';
import { updateEventById, deleteEventInScope } from '$lib/server/db/actions/events';
import { planBulkEdits, parseBulkPlan } from '$lib/server/services/bulkAiService';
import { applyBulkPlan } from '$lib/server/services/bulkApplyService';
import { getUserZone, zonedNow } from '$lib/server/utils/userTimezone';
import { toDateTime } from '$lib/server/utils/eventTimes';
import { resolveMasterId } from '$lib/server/utils/eventIds';
import { requireUserJson } from '$lib/server/utils/requireUser';

type BulkItem = { id: string; occurrenceDate?: string };

type BulkOp =
	| { type: 'delete' }
	| { type: 'calendar'; calendarId: string }
	| { type: 'location'; location: string }
	| { type: 'attendants'; add: string[] }
	| { type: 'smart'; instruction: string };

function isBulkOp(value: unknown): value is BulkOp {
	return (
		typeof value === 'object' && value !== null && 'type' in value && typeof value.type === 'string'
	);
}

/** Per-item result shape: what actually applied vs what failed and why. */
interface BulkResults {
	applied: number;
	failed: { id: string; error: string }[];
}

/** What one per-item apply reports: a deleted count, a truthy row, or a
 *  falsy/undefined "didn't apply" signal. */
type PerItemResult = number | boolean | CalendarEvent | undefined;

/**
 * Apply op to each editable id one-by-one with per-item try/catch. A single
 * failure no longer aborts the batch, and `applied` reflects reality instead
 * of assuming every pre-filtered id succeeded.
 */
async function applyPerItem(
	ids: string[],
	fn: (id: string) => Promise<PerItemResult>
): Promise<BulkResults> {
	const failed: BulkResults['failed'] = [];
	let applied = 0;
	for (const id of ids) {
		try {
			const result = await fn(id);
			// Scoped delete/update actions report 0/undefined when the row
			// vanished mid-batch — that item did NOT apply.
			if (result === 0 || result === undefined) {
				failed.push({ id, error: 'not found' });
			} else {
				applied++;
			}
		} catch (error) {
			failed.push({ id, error: error instanceof Error ? error.message : 'Failed' });
		}
	}
	return { applied, failed };
}

export const POST: RequestHandler = async ({ request, locals }) => {
	const auth = requireUserJson(locals);
	if (auth.response) return auth.response;
	const userId = auth.user.id;

	const body = await request.json();
	const items: BulkItem[] = Array.isArray(body.ids) ? body.ids : [];
	const op: unknown = body.op;

	if (items.length === 0 || !isBulkOp(op)) {
		return json({ error: 'ids and op are required' }, { status: 400 });
	}

	const masterIds = [
		...new Set(items.map((i) => resolveMasterId(i?.id ?? '')).filter((id): id is string => !!id))
	];
	if (masterIds.length === 0) {
		return json({ error: 'No valid event ids' }, { status: 400 });
	}

	// Editable = events the caller owns OR events on a calendar they can
	// see (personal or their family's) — mirrors the calendar read scope.
	const accessibleCalIds = await getAccessibleCalendarIds(userId);

	const editableRows = await db
		.select({ id: events.id })
		.from(events)
		.where(and(inArray(events.id, masterIds), eventAccessFilter(userId, accessibleCalIds)));
	const ownedIds = editableRows.map((r) => r.id);

	if (ownedIds.length === 0) {
		return json({ error: 'No editable events matched' }, { status: 403 });
	}

	try {
		if (op.type === 'delete') {
			const results = await applyPerItem(ownedIds, (id) =>
				deleteEventInScope(id, userId, accessibleCalIds)
			);
			return json({ success: true, ...results });
		}

		if (op.type === 'calendar') {
			if (!op.calendarId) return json({ error: 'calendarId required' }, { status: 400 });
			if (!accessibleCalIds.includes(op.calendarId))
				return json({ error: 'Calendar not accessible' }, { status: 403 });
			const results = await applyPerItem(ownedIds, (id) =>
				updateEventById(id, { calendarId: op.calendarId }, userId)
			);
			return json({ success: true, ...results });
		}

		if (op.type === 'location') {
			const location = String(op.location ?? '').trim();
			const results = await applyPerItem(ownedIds, (id) =>
				updateEventById(id, { location: location || null }, userId)
			);
			return json({ success: true, ...results });
		}

		if (op.type === 'attendants') {
			const add = Array.isArray(op.add) ? op.add.map((n) => String(n).trim()).filter(Boolean) : [];
			if (add.length === 0) return json({ error: 'add names required' }, { status: 400 });

			const results = await applyPerItem(ownedIds, async (id) => {
				await db.transaction(async (tx) => {
					// Read-merge-write inside one transaction so concurrent
					// merges can't lose attendant names.
					const attendance = await tx
						.select({ name: eventAttendance.name })
						.from(eventAttendance)
						.where(eq(eventAttendance.eventId, id));
					const existing = attendance.filter((a) => a.name).map((a) => a.name!);
					const mergedSet = new Set(existing.map((n) => n.toLowerCase()));
					const merged = [...existing];
					for (const name of add) {
						if (!mergedSet.has(name.toLowerCase())) {
							merged.push(name);
							mergedSet.add(name.toLowerCase());
						}
					}
					// Inline syncEventAttendants so the delete + insert share tx.
					await tx
						.delete(eventAttendance)
						.where(and(eq(eventAttendance.eventId, id), sql`${eventAttendance.name} IS NOT NULL`));
					if (merged.length > 0) {
						await tx.insert(eventAttendance).values(
							merged.map((name) => ({
								eventId: id,
								name,
								status: 'undecided' as const
							}))
						);
					}
				});
				return true;
			});
			return json({ success: true, ...results });
		}

		if (op.type === 'smart') {
			const instruction = String(op.instruction ?? '').trim();
			if (!instruction) return json({ error: 'instruction required' }, { status: 400 });

			// All relative dates resolve and land in the user's timezone.
			const zone = await getUserZone(userId);
			const now = zonedNow(zone);

			let rawOps: unknown[];
			if (Array.isArray(body.plan)) {
				// Phase 2: client echoes the reviewed plan - execute it exactly.
				rawOps = body.plan;
			} else {
				const rows = await db
					.select({
						id: events.id,
						title: events.title,
						start: events.start,
						location: events.location
					})
					.from(events)
					.where(inArray(events.id, ownedIds));
				const summaries = rows.map((r) => {
					const dt = toDateTime(r.start)?.setZone(zone ?? 'system');
					return {
						id: r.id,
						title: r.title,
						start: (dt ?? now).toISO()!,
						location: r.location
					};
				});

				const memberFamilyId = await getUserFamilyId(userId);
				const calWhere = memberFamilyId
					? or(eq(calendars.ownerId, userId), eq(calendars.familyId, memberFamilyId))
					: eq(calendars.ownerId, userId);
				const calRows = await db
					.select({
						id: calendars.id,
						familyId: calendars.familyId,
						familyName: families.name
					})
					.from(calendars)
					.leftJoin(families, eq(calendars.familyId, families.id))
					.where(calWhere);
				const calRefs = calRows.map((c) => ({
					id: c.id,
					name: c.familyId ? c.familyName || 'Family Calendar' : 'Personal Calendar'
				}));

				rawOps = planBulkEdits(instruction, summaries, now.toISODate()!, calRefs);
				if (rawOps.length === 0) {
					return json(
						{ error: 'Could not match that instruction. Try naming a date or the events.' },
						{ status: 422 }
					);
				}
				if (body.dryRun) {
					return json({ success: true, plan: rawOps });
				}
			}

			// Re-validate whatever plan we have against editable ids only.
			const plan = parseBulkPlan(JSON.stringify({ ops: rawOps }), ownedIds);
			if (plan.length === 0) {
				return json({ error: 'No valid changes in plan' }, { status: 422 });
			}

			const applied = await applyBulkPlan(plan, userId, accessibleCalIds, zone);
			return json({ success: true, applied });
		}

		return json({ error: 'Unknown op type' }, { status: 400 });
	} catch (error) {
		console.error('Bulk edit failed:', error);
		return apiError(
			new URL(request.url).pathname,
			500,
			'Bulk edit failed',
			locals.user?.id ?? null
		);
	}
};
