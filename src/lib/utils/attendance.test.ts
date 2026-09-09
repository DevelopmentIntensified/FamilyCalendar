import { describe, it, expect, vi } from 'vitest';
import { fetchAttendance, splitAttendance, type AttendanceRow } from './attendance';

const rows: AttendanceRow[] = [
	{ userId: 'u1', status: 'going', firstName: 'A' },
	{ userId: 'u2', status: 'maybe' },
	{ userId: 'u3', status: 'declined' },
	{ userId: 'u4', status: 'not_going' },
	{ userId: 'u5', status: 'undecided' },
	{ userId: 'u6', status: 'whatever' }
];

describe('splitAttendance', () => {
	it('buckets going / maybe / not-going / undecided, unknown → undecided', () => {
		const split = splitAttendance(rows);
		expect(split.going.map((a) => a.userId)).toEqual(['u1']);
		expect(split.maybe.map((a) => a.userId)).toEqual(['u2']);
		expect(split.notGoing.map((a) => a.userId)).toEqual(['u3', 'u4']);
		expect(split.undecided.map((a) => a.userId)).toEqual(['u5', 'u6']);
	});

	it('handles empty input', () => {
		expect(splitAttendance([])).toEqual({ going: [], maybe: [], notGoing: [], undecided: [] });
	});
});

describe('fetchAttendance', () => {
	it('splits user + guest rows and picks up the viewer RSVP', async () => {
		const fetchFn = vi.fn(async () => ({
			ok: true,
			json: async () => ({
				attendance: [
					{ userId: 'u1', status: 'going', firstName: 'A' },
					{ userId: null, status: 'going', name: 'Walk-in' },
					{ userId: null, status: 'going', name: null }
				],
				userRsvpStatus: 'going'
			})
		}));
		const out = await fetchAttendance('evt1', fetchFn);
		expect(out).toEqual({
			attendees: [{ userId: 'u1', status: 'going', firstName: 'A' }],
			nonUserAttendants: ['Walk-in'],
			userRsvpStatus: 'going'
		});
	});

	it('returns nulls on a failed fetch so the modal keeps prior state', async () => {
		const fetchFn = vi.fn(async () => ({
			ok: false,
			json: async () => ({})
		}));
		await expect(fetchAttendance('evt1', fetchFn)).resolves.toEqual({
			attendees: null,
			nonUserAttendants: null,
			userRsvpStatus: null
		});
	});
});
