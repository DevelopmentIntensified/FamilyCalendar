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

export type RsvpVisual = {
	status: Exclude<Event['rsvpStatus'], undefined>;
	label: string;
	icon: string;
	/** Extra classes for the chip/card/row container (ring for going/maybe,
	 *  dimming for declined). Ring uses box-shadow so it composes with the
	 *  existing bg-white / inline border-left freely. */
	containerClass: string;
	/** Compact colored pill for the icon / short label. */
	badgeClass: string;
};

/**
 * Visual treatment reflecting the current user's RSVP on an event.
 * Returns null when there's nothing to show (undecided / no status).
 */
export function rsvpVisual(status?: Event['rsvpStatus']): RsvpVisual | null {
	switch (status) {
		case 'going':
			return {
				status,
				label: 'Going',
				icon: '✓',
				containerClass: 'ring-1 ring-inset ring-emerald-400/60',
				badgeClass: 'bg-emerald-100 text-emerald-700'
			};
		case 'maybe':
			return {
				status,
				label: 'Maybe',
				icon: '?',
				containerClass: 'ring-1 ring-inset ring-amber-400/60',
				badgeClass: 'bg-amber-100 text-amber-700'
			};
		case 'declined':
			return {
				status,
				label: "Can't go",
				icon: '✕',
				containerClass: 'opacity-60 saturate-50',
				badgeClass: 'bg-slate-200 text-slate-500'
			};
		default:
			return null;
	}
}
