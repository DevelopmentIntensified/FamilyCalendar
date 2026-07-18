import type { CalendarEvent } from './server/db/schema';

export type RSVPStatus = 'going' | 'maybe' | 'declined' | 'undecided';

export type Event = CalendarEvent & {
	isAd?: boolean;
	color?: string;
	date?: Date;
	startTime?: string;
	endTime?: string;
	rsvpStatus?: RSVPStatus;
	isFamilyEvent?: boolean;
	attendants?: string[];
	calendar?: {
		id: string;
		name: string;
	};
};

export type FamilyMember = {
	userId: string;
	firstName: string;
	lastName: string;
	email: string;
	role?: string;
};

export type CalendarPageData = {
	user?: any;
	userEvents?: Event[];
	familyEvents?: Event[];
	adEvents?: Event[];
	userSettings?: any;
	userCalendarColor?: string;
	familyCalendarColor?: string;
	showAds?: boolean;
	familyMembers?: FamilyMember[];
	calendarIds?: { id: string; name: string; color?: string }[];
};
