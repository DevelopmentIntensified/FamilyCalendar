import { DateTime } from 'luxon';

/** Bulk-plan presentation logic (#039, extracted from the calendar page). */

export interface PlanOp {
	id: string;
	title?: string;
	date?: string;
	startTime?: string;
	endTime?: string;
	location?: string;
	allDay?: boolean;
	calendarId?: string;
	delete?: boolean;
}

interface PlanEvent {
	id: string;
	title?: string;
	masterId?: string;
}

interface PlanCalendar {
	id: string;
	name: string;
}

function isBoolean(value: unknown): value is boolean {
	return typeof value === 'boolean';
}

function isString(value: unknown): value is string {
	return typeof value === 'string';
}

export function isPastDate(dateIso: string): boolean {
	return DateTime.fromISO(dateIso) < DateTime.now().startOf('day');
}

export function describePlanOp(po: PlanOp, events: PlanEvent[], calendars: PlanCalendar[]): string {
	const ev = events.find((e) => (e.masterId || e.id) === po.id || e.id === po.id);
	const name = ev?.title || po.title || 'Event';
	if (po.delete) return `Delete "${name}"`;
	const parts: string[] = [];
	if (po.title && po.title !== ev?.title) parts.push(`rename to "${po.title}"`);
	if (po.date) {
		const marker = isPastDate(po.date) ? ' (past)' : '';
		parts.push(`move to ${DateTime.fromISO(po.date).toFormat('ccc, MMM d')}${marker}`);
	}
	if (po.startTime) parts.push(`start ${po.startTime}`);
	if (po.endTime) parts.push(`end ${po.endTime}`);
	if (po.location) parts.push(`at ${po.location}`);
	if (isBoolean(po.allDay)) parts.push(po.allDay ? 'all day' : 'timed');
	if (po.calendarId) {
		const cal = calendars.find((c) => c.id === po.calendarId);
		if (cal) parts.push(`→ ${cal.name}`);
	}
	return parts.length ? `${name}: ${parts.join(', ')}` : name;
}

export function planMovesToPast(plan: { ops: PlanOp[] } | null): boolean {
	return !!plan?.ops.some((op) => isString(op.date) && isPastDate(op.date));
}
