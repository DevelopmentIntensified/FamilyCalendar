import type { Event } from '$lib/types';

export function chipColor(event: Pick<Event, 'color' | 'isAd'>): string {
	return event.color || '#94a3b8';
}

/** Inline style giving an event chip its calendar-colored identity. */
export function chipStyle(event: Pick<Event, 'color' | 'allDay' | 'isAd'>): string {
	if ((event as { isAd?: boolean }).isAd) return '';
	const color = chipColor(event);
	// All-day events read as solid blocks; timed ones stay light.
	return event.allDay
		? `background-color: ${color}33; border-left: 3px solid ${color};`
		: `border-left: 3px solid ${color};`;
}

export type CalendarRef = { id: string; name: string };

/** The calendar an event belongs to, or '' when it's ambiguous/unneeded. */
export function calendarNameFor(
	event: Pick<Event, 'calendarId'>,
	calendars: CalendarRef[]
): string {
	if (calendars.length < 2) return '';
	return calendars.find((c) => c.id === event.calendarId)?.name || '';
}

/** Hover/hint text attributing an event to its calendar. */
export function chipTooltip(
	event: Pick<Event, 'title' | 'calendarId'>,
	calendars: CalendarRef[]
): string {
	const name = calendarNameFor(event, calendars);
	return name ? `${event.title} · ${name}` : event.title;
}
