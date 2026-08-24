import type { CalendarEvent, User, UserSettings } from './server/db/schema';

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
	recurrenceFrequency?: string | null;
	recurrenceInterval?: number | null;
	masterId?: string;
	occurrenceDate?: string;
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
	user?: User;
	userEvents?: Event[];
	familyEvents?: Event[];
	adEvents?: Event[];
	userSettings?: UserSettings;
	userCalendarColor?: string;
	familyCalendarColor?: string;
	showAds?: boolean;
	familyMembers?: FamilyMember[];
	calendarIds?: { id: string; name: string; color?: string }[];
};
