/**
 * #282: the family roster an event's edit form can invite from. Every
 * EventModal caller gets it from ONE source — the group layout's
 * `getFamilyRoster` (via the calendar / dashboard page data) — and this is
 * the shape EventFormModal / AttendantPicker read.
 */
export interface EventRosterMember {
	userId: string;
	firstName?: string;
	lastName?: string;
	email: string;
}

/** Loose roster rows (nullable names/email) → the event form's shape. */
export function toEventRoster(
	members: {
		userId: string;
		firstName?: string | null;
		lastName?: string | null;
		email?: string | null;
	}[]
): EventRosterMember[] {
	return members.map((m) => ({
		userId: m.userId,
		firstName: m.firstName ?? undefined,
		lastName: m.lastName ?? undefined,
		email: m.email ?? ''
	}));
}
