import type { CalendarEvent } from '$lib/server/db/schema';

export interface Event extends CalendarEvent {
	isAd?: boolean;
}