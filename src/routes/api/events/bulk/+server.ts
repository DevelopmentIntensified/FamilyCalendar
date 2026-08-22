import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { DateTime } from 'luxon';
import { db } from '$lib/server/db';
import { events } from '$lib/server/db/schema';
import { and, eq, inArray } from 'drizzle-orm';
import {
	updateEventById,
	deleteEventById,
	getEvent,
	getEventAttendance,
	syncEventAttendants
} from '$lib/server/db/actions/events';
import { planBulkEdits, type BulkPlanOp } from '$lib/server/services/bulkAiService';
import { llmConfigured } from '$lib/server/services/llm';

type BulkItem = { id: string; occurrenceDate?: string };

type BulkOp =
	| { type: 'delete' }
	| { type: 'calendar'; calendarId: string }
	| { type: 'location'; location: string }
	| { type: 'attendants'; add: string[] }
	| { type: 'smart'; instruction: string };

function resolveMasterId(rawId: string): string | null {
	const master = String(rawId).split('~')[0].trim();
	return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(master) ? master : null;
}

// postgres.js returns Date objects despite drizzle's mode:'string' typing.
function toDateTime(v: unknown): DateTime | null {
	if (v instanceof Date) return DateTime.fromJSDate(v);
	const dt = DateTime.fromISO(String(v ?? ''));
	return dt.isValid ? dt : null;
}

async function applySmartOp(op: BulkPlanOp, userId: string): Promise<boolean> {
	const ev = await getEvent(op.id);
	if (!ev) return false;

	const startDt = toDateTime(ev.start);
	if (!startDt) return false;

	const date = op.date ?? startDt.toISODate()!;
	const allDay = typeof op.allDay === 'boolean' ? op.allDay : ev.allDay;

	let startTime: string | null = allDay ? '00:00' : op.startTime ?? startDt.toFormat('HH:mm');
	const endDt = toDateTime(ev.end);
	let endTime: string | null = allDay
		? '23:59'
		: op.endTime ?? (endDt && endDt.toISODate() === date ? endDt.toFormat('HH:mm') : null);

	if (startTime && !endTime) endTime = DateTime.fromFormat(startTime, 'HH:mm').plus({ hours: 1 }).toFormat('HH:mm');

	const start = DateTime.fromFormat(`${date} ${startTime}`, 'yyyy-MM-dd HH:mm').toISO();
	const end = endTime ? DateTime.fromFormat(`${date} ${endTime}`, 'yyyy-MM-dd HH:mm').toISO() : null;
	if (!start) return false;

	const updated = await updateEventById(
		op.id,
		{
			title: op.title ?? ev.title,
			start,
			end,
			allDay,
			location: op.location ?? ev.location
		},
		userId
	);
	return !!updated;
}

export const POST: RequestHandler = async ({ request, locals }) => {
	if (!locals.user) {
		return json({ error: 'Unauthorized' }, { status: 401 });
	}
	const userId = locals.user.id;

	const body = await request.json();
	const items: BulkItem[] = Array.isArray(body.ids) ? body.ids : [];
	const op = body.op as BulkOp | undefined;

	if (items.length === 0 || !op || typeof op.type !== 'string') {
		return json({ error: 'ids and op are required' }, { status: 400 });
	}

	const masterIds = [...new Set(items.map((i) => resolveMasterId(i?.id ?? '')).filter((id): id is string => !!id))];
	if (masterIds.length === 0) {
		return json({ error: 'No valid event ids' }, { status: 400 });
	}

	// Only touch rows the caller owns.
	const ownedRows = await db
		.select({ id: events.id })
		.from(events)
		.where(and(inArray(events.id, masterIds), eq(events.ownerId, userId)));
	const ownedIds = ownedRows.map((r) => r.id);

	if (ownedIds.length === 0) {
		return json({ error: 'No editable events matched' }, { status: 403 });
	}

	try {
		if (op.type === 'delete') {
			for (const id of ownedIds) {
				await deleteEventById(id, userId);
			}
			return json({ success: true, applied: ownedIds.length });
		}

		if (op.type === 'calendar') {
			if (!op.calendarId) return json({ error: 'calendarId required' }, { status: 400 });
			for (const id of ownedIds) {
				await updateEventById(id, { calendarId: op.calendarId }, userId);
			}
			return json({ success: true, applied: ownedIds.length });
		}

		if (op.type === 'location') {
			const location = String(op.location ?? '').trim();
			for (const id of ownedIds) {
				await updateEventById(id, { location: location || null }, userId);
			}
			return json({ success: true, applied: ownedIds.length });
		}

		if (op.type === 'attendants') {
			const add = Array.isArray(op.add) ? op.add.map((n: unknown) => String(n).trim()).filter(Boolean) : [];
			if (add.length === 0) return json({ error: 'add names required' }, { status: 400 });

			let applied = 0;
			for (const id of ownedIds) {
				// Read-merge-write so each event keeps its own attendant list.
				const attendance = await getEventAttendance(id);
				const existing = attendance.filter((a) => a.name).map((a) => a.name!);
				const mergedSet = new Set(existing.map((n) => n.toLowerCase()));
				const merged = [...existing];
				for (const name of add) {
					if (!mergedSet.has(name.toLowerCase())) {
						merged.push(name);
						mergedSet.add(name.toLowerCase());
					}
				}
				await syncEventAttendants(id, merged);
				applied++;
			}
			return json({ success: true, applied });
		}

		if (op.type === 'smart') {
			const instruction = String(op.instruction ?? '').trim();
			if (!instruction) return json({ error: 'instruction required' }, { status: 400 });
			if (!llmConfigured()) return json({ error: 'AI features not configured' }, { status: 503 });

			const rows = await db
				.select({ id: events.id, title: events.title, start: events.start, location: events.location })
				.from(events)
				.where(inArray(events.id, ownedIds));
			const summaries = rows.map((r) => {
				const dt = toDateTime(r.start);
				return {
					id: r.id,
					title: r.title,
					start: (dt ?? DateTime.now()).toISO()!,
					location: r.location
				};
			});

			const plan = await planBulkEdits(instruction, summaries, DateTime.now().toISODate()!);
			if (plan.length === 0) {
				return json({ error: 'AI returned no applicable changes' }, { status: 422 });
			}

			let applied = 0;
			for (const planOp of plan) {
				if (await applySmartOp(planOp, userId)) applied++;
			}
			return json({ success: true, applied });
		}

		return json({ error: 'Unknown op type' }, { status: 400 });
	} catch (error) {
		console.error('Bulk edit failed:', error);
		return json({ error: 'Bulk edit failed' }, { status: 500 });
	}
};
