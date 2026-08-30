import type { CalendarEvent, User, UserSettings } from './server/db/schema';

export type RSVPStatus = 'going' | 'maybe' | 'declined' | 'undecided';

/** How a member was invited to an event: expected (required) vs optional. */
export type InviteType = 'required' | 'optional';

/**
 * Compact "who's going" summary attached to display events (calendar chips,
 * dashboard rows). Only counts invited members (user-linked attendance),
 * never guest names.
 */
export type EventAttendanceSummary = {
	/** Members marked GOING. */
	going: number;
	/** Invited members (required + optional + creator/responders). */
	invited: number;
	/** Members whose invite is REQUIRED. */
	required: number;
	/** REQUIRED members who haven't accepted yet (not GOING). */
	requiredPending: number;
	/** First names of going members (for initials/avatar stacks). */
	goingNames: string[];
};

export type Event = CalendarEvent & {
	isAd?: boolean;
	color?: string;
	date?: Date;
	startTime?: string;
	endTime?: string;
	rsvpStatus?: RSVPStatus;
	isFamilyEvent?: boolean;
	attendants?: string[];
	attendance?: EventAttendanceSummary;
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
