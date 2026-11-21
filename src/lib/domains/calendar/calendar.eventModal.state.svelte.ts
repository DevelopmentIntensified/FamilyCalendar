/**
 * The event modal's detail-region state: attendance, the viewer's RSVP, guest
 * invites, duplicate and delete. Ported from `EventModal.svelte` (the half that
 * called `/api/events/[id]/rsvp`, `/api/events` and `DELETE /api/events/[id]`).
 *
 * Every call goes through `calendar.api.ts`, so the legacy hand-built URLs and
 * `fetch` error ladders live in one place. The optimistic rules are the
 * legacy ones: RSVP paints first and rolls back with a toast (#227), clicking
 * the active answer again clears it to `undecided`, and a DELETE in flight
 * cannot be fired twice (issue 015).
 *
 * Doc: ./README.md#invariants
 */
import type { Toasts } from '$lib/kernel/client/toasts.svelte';
import type { CalendarApi } from './calendar.api';
import {
	calendarAttendancePeople,
	calendarAttendanceSplit,
	calendarDeleteScopes,
	calendarDuplicateBody,
	calendarGuestAttendance,
	type CalendarAttendanceRow,
	type CalendarAttendanceSplit,
	type CalendarGuestRow,
	type CalendarPerson,
	type CalendarEventView
} from './calendar.eventView.rules';
import { calendarActionErrorCopy } from './calendar.eventForm.rules';

export interface CalendarEventModalInit {
	readonly event: CalendarEventView;
	readonly attendees?: readonly CalendarAttendanceRow[];
	readonly attendeesLoaded?: boolean;
	readonly guests?: readonly CalendarGuestRow[] | null;
	readonly nonUserAttendants?: readonly string[];
	readonly userRsvpStatus?: string;
}

const RSVP_FAILED = "Couldn't save your RSVP — try again.";
const INVITE_FAILED = "Couldn't invite them. Try again.";

export class CalendarEventModalState {
	readonly event: CalendarEventView;
	attendees = $state<CalendarAttendanceRow[]>([]);
	guests = $state<CalendarGuestRow[]>([]);
	userRsvpStatus = $state('undecided');
	/** Invites arrived with the page (no skeleton needed). */
	attendeesLoaded = false;
	attendanceLoading = $state(false);
	actionError = $state('');
	deleting = $state(false);
	duplicating = $state(false);
	rsvpPending = $state(false);
	invitingGuest = $state(false);

	private readonly api: CalendarApi;
	private readonly toasts: Toasts;
	private readonly viewerId: string | null;
	/** Set once the viewer answers: a slow first load must not clobber it. */
	private rsvpTouched = false;

	constructor(api: CalendarApi, toasts: Toasts, viewerId: string | null, init: CalendarEventModalInit) {
		this.api = api;
		this.toasts = toasts;
		this.viewerId = viewerId;
		this.event = init.event;
		this.attendees = init.attendees ? [...init.attendees] : [];
		this.attendeesLoaded = init.attendeesLoaded ?? this.attendees.length > 0;
		this.guests = calendarGuestAttendance(
			init.guests ?? null,
			init.nonUserAttendants ?? []
		);
		this.userRsvpStatus = init.userRsvpStatus ?? 'undecided';
	}

	/** Occurrences share the series master's API identity. */
	get serverId(): string {
		return this.event.masterId || this.event.id;
	}

	get canScopeOccurrence(): boolean {
		return !!this.event.occurrenceDate;
	}

	get scopes(): ('this' | 'all')[] {
		return calendarDeleteScopes(this.canScopeOccurrence);
	}

	get split(): CalendarAttendanceSplit {
		return calendarAttendanceSplit(this.attendees);
	}

	get people(): CalendarPerson[] {
		return calendarAttendancePeople(this.split, this.guests);
	}

	get hasAttendance(): boolean {
		return (
			this.split.going.length > 0 ||
			this.split.maybe.length > 0 ||
			this.split.notGoing.length > 0 ||
			this.guests.length > 0
		);
	}

	/** `GET …/rsvp`; a failed read keeps whatever the page passed (and says so). */
	async refreshAttendance(): Promise<void> {
		this.attendanceLoading = true;
		try {
			const result = await this.api.getRsvp(this.serverId);
			if (result.ok) {
				if (this.rsvpTouched) return;
				this.applyAttendance(result.data.attendance ?? [], result.data.nonUserAttendants ?? []);
				this.userRsvpStatus = result.data.userRsvpStatus || 'undecided';
				return;
			}
			this.actionError = calendarActionErrorCopy('save', result.error, result.status);
		} finally {
			this.attendanceLoading = false;
		}
	}

	/**
	 * Answer for the viewer. Clicking the active answer again clears to
	 * `undecided`. The POST answers the raw attendance rows (Q-046), so the
	 * status shown afterwards is read from the viewer's own row.
	 */
	async rsvp(status: string): Promise<boolean> {
		if (this.rsvpPending) return false;
		const next = this.userRsvpStatus === status ? 'undecided' : status;
		const previous = this.userRsvpStatus;
		this.userRsvpStatus = next;
		this.rsvpPending = true;
		this.rsvpTouched = true;
		try {
			const result = await this.api.setRsvp(this.serverId, next);
			if (!result.ok) {
				this.userRsvpStatus = previous;
				this.toasts.error(RSVP_FAILED);
				return false;
			}
			this.applyAttendance(result.data.attendance ?? [], [], false);
			const mine = (result.data.attendance ?? []).find((row) => row.userId === this.viewerId);
			this.userRsvpStatus = mine?.status || next;
			return true;
		} catch {
			this.userRsvpStatus = previous;
			this.toasts.error(RSVP_FAILED);
			return false;
		} finally {
			this.rsvpPending = false;
		}
	}

	/** Invite a named guest, then refresh the same way every RSVP does. */
	async inviteGuest(name: string): Promise<boolean> {
		const trimmed = name.trim();
		if (this.invitingGuest || !trimmed) return false;
		this.invitingGuest = true;
		this.actionError = '';
		try {
			const result = await this.api.inviteGuest(this.serverId, trimmed);
			if (!result.ok) {
				this.actionError = result.error || INVITE_FAILED;
				return false;
			}
			this.applyAttendance(result.data.attendance ?? [], [], false);
			return true;
		} catch {
			this.actionError = 'Network error. Check your connection and try again.';
			return false;
		} finally {
			this.invitingGuest = false;
		}
	}

	/**
	 * Delete. A recurring series always sends its scope: a bare DELETE means the
	 * whole series, so a request that meant one occurrence and had no
	 * occurrenceDate would take every week instead.
	 */
	async remove(scope?: 'this' | 'all'): Promise<boolean> {
		if (this.deleting) return false;
		this.deleting = true;
		this.actionError = '';
		try {
			const effective: 'this' | 'all' = this.canScopeOccurrence ? (scope ?? 'this') : 'all';
			const result = await this.api.deleteEvent(this.event.masterId || this.event.id, {
				scope: effective,
				occurrenceDate: this.event.occurrenceDate ?? null
			});
			if (!result.ok) {
				this.actionError = calendarActionErrorCopy('delete', result.error, result.status);
				return false;
			}
			this.toasts.success('Event deleted.');
			return true;
		} catch {
			this.actionError = 'Network error. Check your connection and try again.';
			return false;
		} finally {
			this.deleting = false;
		}
	}

	/** Copy the event (and its loaded invites) under `"<title> (copy)"`. */
	async duplicate(): Promise<boolean> {
		if (this.duplicating) return false;
		this.duplicating = true;
		this.actionError = '';
		try {
			const body = calendarDuplicateBody(
				this.event,
				this.attendees,
				this.guests.map((guest) => guest.name)
			);
			const result = await this.api.createEvent(body);
			if (!result.ok) {
				this.actionError = calendarActionErrorCopy('duplicate', result.error, result.status);
				return false;
			}
			this.toasts.success('Event duplicated.');
			return true;
		} catch {
			this.actionError = 'Network error. Check your connection and try again.';
			return false;
		} finally {
			this.duplicating = false;
		}
	}

	/** Split one payload the way legacy `fetchAttendance` did. */
	private applyAttendance(
		rows: readonly CalendarAttendanceRow[],
		guestNames: readonly string[],
		replaceGuests = true
	): void {
		this.attendees = rows.filter((row) => row.userId);
		if (replaceGuests) {
			const guestRows = rows
				.filter((row) => !row.userId && row.name)
				.map((row) => ({ name: row.name ?? '', status: row.status ?? 'invited' }));
			this.guests = guestRows.length > 0 ? guestRows : calendarGuestAttendance(null, guestNames);
		} else {
			const guestRows = rows
				.filter((row) => !row.userId && row.name)
				.map((row) => ({
					name: row.name ?? '',
					status: row.status ?? 'invited',
					inviteType: row.inviteType ?? null
				}));
			this.guests = guestRows;
		}
		this.attendeesLoaded = true;
	}
}
