import type { CalendarEvent } from './server/db/schema';

export type Event = CalendarEvent & {
	isAd?: boolean;
	color?: string;
	date?: Date;
	startTime?: string;
	endTime?: string;
	rsvpStatus?: 'going' | 'maybe' | 'declined' | 'undecided';
	isFamilyEvent?: boolean;
};

export type FamilyMember = {
	userId: string;
	firstName: string;
	lastName: string;
	email: string;
	role?: string;
};

export type PageData = {
	user?: any;
	userEvents?: Event[];
	familyEvents?: Event[];
	adEvents?: Event[];
	userSettings?: any;
	userCalendarColor?: string;
	familyCalendarColor?: string;
	showAds?: boolean;
	familyMembers?: FamilyMember[];
};
