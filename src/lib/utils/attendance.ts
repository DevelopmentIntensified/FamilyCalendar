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

export interface AttendanceLoad {
	attendees: AttendanceRow[] | null;
	nonUserAttendants: string[] | null;
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
	const empty: AttendanceLoad = { attendees: null, nonUserAttendants: null, userRsvpStatus: null };
	try {
		const res = await fetchFn(`/api/events/${serverId}/rsvp`);
		if (!res.ok) return empty;
		const data = await res.json();
		return {
			attendees: data.attendance ? data.attendance.filter((a) => a.userId) : null,
			nonUserAttendants: data.attendance
				? data.attendance.filter((a) => !a.userId && a.name).map((a) => a.name ?? '')
				: null,
			userRsvpStatus: data.userRsvpStatus ?? null
		};
	} catch (e) {
		console.error('Failed to load attendance:', e);
		return empty;
	}
}
