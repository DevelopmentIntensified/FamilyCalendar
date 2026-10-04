/** Attendance loading + bucketing shared by the event modal (#039). */

export interface AttendanceRow {
	userId: string | null;
	status: string;
	firstName?: string | null;
	lastName?: string | null;
	name?: string | null;
	inviteType?: string | null;
}

export interface AttendanceSplit {
	going: AttendanceRow[];
	maybe: AttendanceRow[];
	notGoing: AttendanceRow[];
	undecided: AttendanceRow[];
}

/** Bucket attendee rows; unknown statuses count as undecided (invited, no answer). */
export function splitAttendance(rows: AttendanceRow[]): AttendanceSplit {
	const split: AttendanceSplit = { going: [], maybe: [], notGoing: [], undecided: [] };
	for (const row of rows) {
		if (row.status === 'going') split.going.push(row);
		else if (row.status === 'maybe') split.maybe.push(row);
		else if (row.status === 'declined' || row.status === 'not_going') split.notGoing.push(row);
		else split.undecided.push(row);
	}
	return split;
}

/** A named guest, kept whole so its status survives to the attendance list. */
export interface GuestAttendance {
	name: string;
	status: string;
	inviteType?: string | null;
}

export interface AttendanceLoad {
	attendees: AttendanceRow[] | null;
	nonUserAttendants: string[] | null;
	/** Guests with their own status — the attendance region draws one row each. */
	guestRows: GuestAttendance[] | null;
	userRsvpStatus: string | null;
}

type FetchLike = (url: string) => Promise<{ ok: boolean; json: () => Promise<AttendancePayload> }>;

interface AttendancePayload {
	attendance?: AttendanceRow[];
	userRsvpStatus?: string;
	rsvpStatus?: string;
}

/** GET /api/events/[id]/rsvp, split into user rows + guest names. Nulls = keep prior state. */
export async function fetchAttendance(
	serverId: string,
	fetchFn: FetchLike = fetch
): Promise<AttendanceLoad> {
	const empty: AttendanceLoad = {
		attendees: null,
		nonUserAttendants: null,
		guestRows: null,
		userRsvpStatus: null
	};
	try {
		const res = await fetchFn(`/api/events/${serverId}/rsvp`);
		if (!res.ok) return empty;
		const data = await res.json();
		const guests = data.attendance
			? data.attendance.filter((a) => !a.userId && a.name)
			: null;
		return {
			attendees: data.attendance ? data.attendance.filter((a) => a.userId) : null,
			nonUserAttendants: guests ? guests.map((a) => a.name ?? '') : null,
			// The same guests, still carrying their status: a guest who declined is
			// not the same row as one who never answered.
			guestRows: guests
				? guests.map((a) => ({
						name: a.name ?? '',
						status: a.status,
						inviteType: a.inviteType ?? null
					}))
				: null,
			userRsvpStatus: data.userRsvpStatus ?? null
		};
	} catch (e) {
		console.error('Failed to load attendance:', e);
		return empty;
	}
}
