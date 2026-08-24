import { DateTime } from 'luxon';
import { updateEventById, deleteEventInScope, getEvent } from '$lib/server/db/actions/events';
import { toDateTime } from '$lib/server/utils/eventTimes';
import type { BulkPlanOp } from './bulkAiService';

export async function applySmartOp(
	op: BulkPlanOp,
	userId: string,
	allowedCalIds?: Set<string>,
	zone?: string
): Promise<boolean> {
	const ev = await getEvent(op.id);
	if (!ev) return false;

	const calendarId =
		op.calendarId && allowedCalIds?.has(op.calendarId) ? op.calendarId : undefined;

	if (
		calendarId &&
		!op.title &&
		!op.date &&
		!op.startTime &&
		!op.endTime &&
		!op.location &&
		typeof op.allDay !== 'boolean'
	) {
		const moved = await updateEventById(op.id, { calendarId }, userId);
		return !!moved;
	}

	const startDt = toDateTime(ev.start)?.setZone(zone ?? 'system');
	if (!startDt) return false;

	// The plan's date is a user-zone calendar date; interpret it in the
	// same zone so the stored instant lands on the user's intended day.
	const date = op.date ?? startDt.toISODate()!;
	const allDay = typeof op.allDay === 'boolean' ? op.allDay : ev.allDay;

	let startTime: string | null = allDay ? '00:00' : op.startTime ?? startDt.toFormat('HH:mm');
	const endDt = toDateTime(ev.end)?.setZone(zone ?? 'system');
	let endTime: string | null = allDay
		? '23:59'
		: op.endTime ?? (endDt && endDt.toISODate() === date ? endDt.toFormat('HH:mm') : null);

	if (startTime && !endTime) {
		endTime = DateTime.fromFormat(startTime, 'HH:mm', { zone }).plus({ hours: 1 }).toFormat('HH:mm');
	}

	const start = DateTime.fromFormat(`${date} ${startTime}`, 'yyyy-MM-dd HH:mm', { zone }).toISO();
	const end = endTime
		? DateTime.fromFormat(`${date} ${endTime}`, 'yyyy-MM-dd HH:mm', { zone }).toISO()
		: null;
	if (!start) return false;

	const updated = await updateEventById(
		op.id,
		{
			title: op.title ?? ev.title,
			start,
			end,
			allDay,
			location: op.location ?? ev.location,
			calendarId: calendarId ?? ev.calendarId
		},
		userId
	);
	return !!updated;
}

export async function applyBulkPlan(
	plan: BulkPlanOp[],
	userId: string,
	accessibleCalIds: string[],
	zone?: string
): Promise<number> {
	const allowedCalIds = new Set(accessibleCalIds);

	let applied = 0;
	for (const planOp of plan) {
		if (planOp.delete) {
			await deleteEventInScope(planOp.id, userId, accessibleCalIds);
			applied++;
			continue;
		}
		if (await applySmartOp(planOp, userId, allowedCalIds, zone)) applied++;
	}
	return applied;
}
