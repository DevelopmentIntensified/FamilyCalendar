import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * Assignment-target validation on POST /api/tasks: assignedTo must be
 * the creator themself or an existing member of the target family —
 * anything else would create an invisible pending task. isValidAssignee
 * stays real (it is the logic under test); only the DB and the
 * surrounding seams are scripted/spied.
 */
/** A stubbed DB row: plain JSON-ish values only (house stub style). */
type Row = Record<string, string | null>;

interface StubState {
	queue: Row[][];
	/** Number of UPDATE statements the stub executed (pin audit). */
	updateCount: number;
	/** Latest UPDATE patch (the pinned dueDate). */
	updatePatch: Row | null;
}

const state = vi.hoisted((): StubState => ({ queue: [], updateCount: 0, updatePatch: null }));

// oxlint-disable-next-line anti-slop/no-module-mocking -- scripted drizzle stub pins query shapes; real-Postgres harness tracked in docs/issues/002.
vi.mock('$lib/server/db', () => {
	/** The slice of the drizzle builder the task reads walk (sync + list + tags). */
	const node = () => {
		const n = {
			from: () => n,
			leftJoin: () => n,
			innerJoin: () => n,
			where: () => {
				const rows = state.queue.shift() ?? [];
				return Object.assign(Promise.resolve(rows), {
					orderBy: () => Promise.resolve(rows),
					// The eventId branch chains .limit(1) on its event lookup.
					limit: () => Promise.resolve(rows)
				});
			}
		};
		return n;
	};
	return {
		db: {
			select: () => node(),
			update: () => ({
				set: (patch: Row) => {
					state.updatePatch = patch;
					return {
						where: () => {
							state.updateCount += 1;
							return Promise.resolve();
						}
					};
				}
			})
		}
	};
});

// oxlint-disable-next-line anti-slop/no-module-mocking -- createTask/isValidAssignee seams become spies; getTasksForUser stays REAL so the GET cursor-pin invariant (issue 110) runs end to end.
vi.mock('$lib/server/db/actions/tasks', async (importOriginal) => ({
	...(await importOriginal<object>()),
	createTask: vi.fn(),
	getTasksForEvent: vi.fn(),
	isFamilyMember: vi.fn()
}));

// oxlint-disable-next-line anti-slop/no-module-mocking -- scripted seam; the real module reads familyMembers from the DB.
vi.mock('$lib/server/db/actions/families', () => ({
	getUserFamilyId: vi.fn(async () => 'fam-1')
}));

// oxlint-disable-next-line anti-slop/no-module-mocking -- scripted seam; the real module reads user_settings from the DB. Null = no stored zone.
vi.mock('$lib/server/db/actions/userSettings', () => ({
	getUserSettings: vi.fn(async () => null)
}));

import { POST, GET } from './+server';
import { createTask, getTasksForEvent } from '$lib/server/db/actions/tasks';
import { getUserSettings } from '$lib/server/db/actions/userSettings';
import { DateTime } from 'luxon';

const mockedGetEventTasks = vi.mocked(getTasksForEvent);

function event(userId: string, body: Record<string, unknown>) {
	// SAFETY: test double — the handler only reads locals.user and request.json().
	return {
		locals: { user: { id: userId } },
		request: {
			url: 'http://localhost/api/tasks',
			json: async () => body
		}
	} as never;
}

const mockedCreateTask = vi.mocked(createTask);

beforeEach(() => {
	state.queue = [];
	state.updateCount = 0;
	state.updatePatch = null;
	vi.clearAllMocks();
	// SAFETY: stub return satisfies the seam spy's nominal TaskWithTags parameter in tests.
	mockedCreateTask.mockResolvedValue({ id: 't1', title: 'Dishes' } as never);
});

describe('POST /api/tasks — assignment target validation', () => {
	it('defaults to self-assignment without a membership lookup', async () => {
		const res = await POST(event('user-1', { title: 'Dishes' }));

		expect(res.status).toBe(201);
		expect(mockedCreateTask).toHaveBeenCalledWith(
			expect.objectContaining({ assignedTo: 'user-1', assignmentStatus: 'accepted' })
		);
		expect(state.queue).toEqual([]);
	});

	it('accepts an existing member of the target family as assignee', async () => {
		state.queue.push([{ familyId: 'fam-1' }]); // isValidAssignee membership row

		const res = await POST(event('user-1', { title: 'Dishes', assignedTo: 'user-2' }));

		expect(res.status).toBe(201);
		expect(mockedCreateTask).toHaveBeenCalledWith(
			expect.objectContaining({ assignedTo: 'user-2', assignmentStatus: 'pending' })
		);
	});

	it('400s when assignedTo is an unknown user id', async () => {
		state.queue.push([]); // no membership row

		const res = await POST(event('user-1', { title: 'Dishes', assignedTo: 'user-ghost' }));

		expect(res.status).toBe(400);
		expect(mockedCreateTask).not.toHaveBeenCalled();
	});

	it('400s when assignedTo belongs to another family', async () => {
		state.queue.push([]); // membership row for (assignedTo, fam-1) absent

		const res = await POST(event('user-1', { title: 'Dishes', assignedTo: 'user-9' }));

		expect(res.status).toBe(400);
		expect(mockedCreateTask).not.toHaveBeenCalled();
	});
});

describe('POST /api/tasks — visibility (issue 019)', () => {
	it('defaults new tasks to public visibility', async () => {
		const res = await POST(event('user-1', { title: 'Dishes' }));

		expect(res.status).toBe(201);
		expect(mockedCreateTask).toHaveBeenCalledWith(
			expect.objectContaining({ visibility: 'public' })
		);
	});

	it('passes an explicit private visibility through', async () => {
		const res = await POST(event('user-1', { title: 'Dishes', visibility: 'private' }));

		expect(res.status).toBe(201);
		expect(mockedCreateTask).toHaveBeenCalledWith(
			expect.objectContaining({ visibility: 'private' })
		);
	});

	it('400s on an unsupported visibility value', async () => {
		const res = await POST(event('user-1', { title: 'Dishes', visibility: 'secret' }));

		expect(res.status).toBe(400);
		expect(mockedCreateTask).not.toHaveBeenCalled();
	});
});

describe('GET /api/tasks — recurring cursor pin invariant (issue 110)', () => {
	/** A GET event: the handler reads locals.user and url.searchParams. */
	function getEvent(userId: string) {
		// SAFETY: test double — RequestHandler input narrowed to the read path.
		return {
			locals: { user: { id: userId } },
			url: new URL('http://localhost/api/tasks')
		} as never;
	}

	it('pins overdue recurring rows to today-end BEFORE reading the list', async () => {
		// Queue order after the invariant lands: (1) sync SELECT scope,
		// (2) the list read, (3) attachTags. The sync SELECT returns one
		// overdue recurring row, so the pin UPDATE must fire.
		state.queue = [
			[{ id: 'stale-1', dueDate: '2020-01-01T00:00:00.000Z' }],
			[{ id: 'stale-1', dueDate: '2020-01-01T00:00:00.000Z' }],
			[]
		];

		const res = await GET(getEvent('user-1'));
		const body = (await res.json()) as { tasks: { id: string }[] };

		expect(res.status).toBe(200);
		expect(body.tasks.map((t) => t.id)).toEqual(['stale-1']);
		expect(state.updateCount).toBe(1);
		expect(String(state.updatePatch?.dueDate)).toMatch(/T23:59:00/);
	});

	it("pins to 23:59 in the token owner's stored zone (#214)", async () => {
		// 23:00Z Nov 1 = 08:00 Nov 2 in Tokyo — the user's today is Nov 2.
		vi.useFakeTimers({ toFake: ['Date'] });
		vi.setSystemTime(new Date('2026-11-01T23:00:00Z'));
		// SAFETY: getUserZone reads only timeZone off the settings row.
		vi.mocked(getUserSettings).mockResolvedValue({ timeZone: 'Asia/Tokyo' } as never);
		try {
			state.queue = [[{ id: 'stale-1', dueDate: '2026-11-01T14:59:00.000Z' }], [], []];

			const res = await GET(getEvent('user-1'));

			expect(res.status).toBe(200);
			expect(state.updateCount).toBe(1);
			expect(DateTime.fromISO(String(state.updatePatch?.dueDate)).toMillis()).toBe(
				DateTime.fromISO('2026-11-02T23:59', { zone: 'Asia/Tokyo' }).toMillis()
			);
		} finally {
			vi.useRealTimers();
			vi.mocked(getUserSettings).mockResolvedValue(null as never);
		}
	});

	it('issues no UPDATE when nothing is overdue (idempotent no-op)', async () => {
		state.queue = [
			[{ id: 'fresh-1', dueDate: '2099-09-02T23:59:00.000Z' }],
			[{ id: 'fresh-1', dueDate: '2099-09-02T23:59:00.000Z' }],
			[]
		];

		const res = await GET(getEvent('user-1'));

		expect(res.status).toBe(200);
		expect(state.updateCount).toBe(0);
	});
});

describe('GET /api/tasks — phone focus overlay (#293)', () => {
	it('adds phoneFocusMinutes / phoneFocusStartedAt per task, desktop fields unchanged', async () => {
		// Queue order: (1) sync scope, (2) list, (3) tags, (4) the caller's
		// unabsorbed taskfocus_sessions (SQL scoping: the .real.test).
		const started = new Date('2026-11-03T09:00:00Z');
		state.queue = [
			[],
			[
				{ id: 't1', focusMinutes: 40, focusStartedAt: null },
				{ id: 't2', focusMinutes: null, focusStartedAt: null },
				{ id: 't3', focusMinutes: 5, focusStartedAt: null }
			] as never,
			[],
			[
				{ taskId: 't1', startedAt: new Date('2026-11-03T08:00:00Z'), endedAt: new Date('2026-11-03T08:10:59Z'), absorbedAt: null },
				{ taskId: 't2', startedAt: started, endedAt: null, absorbedAt: null }
			] as never
		];

		const res = await GET({
			locals: { user: { id: 'user-1' } },
			url: new URL('http://localhost/api/tasks')
		} as never);
		const body = (await res.json()) as { tasks: Record<string, unknown>[] };

		expect(res.status).toBe(200);
		expect(body.tasks.map(({ id, focusMinutes, focusStartedAt, phoneFocusMinutes, phoneFocusStartedAt }) => ({
			id,
			focusMinutes,
			focusStartedAt,
			phoneFocusMinutes,
			phoneFocusStartedAt
		}))).toEqual([
			{ id: 't1', focusMinutes: 40, focusStartedAt: null, phoneFocusMinutes: 10, phoneFocusStartedAt: null },
			{ id: 't2', focusMinutes: null, focusStartedAt: null, phoneFocusMinutes: 0, phoneFocusStartedAt: started.toISOString() },
			{ id: 't3', focusMinutes: 5, focusStartedAt: null, phoneFocusMinutes: 0, phoneFocusStartedAt: null }
		]);
	});
});

describe('GET /api/tasks?eventId= — event-task visibility (issue 164)', () => {
	function eventDetailEvent(userId: string) {
		// SAFETY: test double — the eventId GET branch reads locals.user + url.
		return {
			locals: { user: { id: userId } },
			url: new URL('http://localhost/api/tasks?eventId=ev-1')
		} as never;
	}

	it("hides the creator's private task from a non-owner member reading the event", async () => {
		// Queue order: (1) event lookup, (2) familyMembers for calendar scope,
		// (3) calendars — user-1 is a member with access to the family calendar.
		state.queue = [
			[{ id: 'ev-1', calendarId: 'cal-fam', ownerId: 'user-2' }],
			[{ familyId: 'fam-1' }],
			[{ id: 'cal-fam' }]
		];
		mockedGetEventTasks.mockResolvedValue([
			{ id: 't-pub', visibility: 'public', userId: 'user-2' },
			{ id: 't-priv', visibility: 'private', userId: 'user-2' }
		] as never);

		const res = await GET(eventDetailEvent('user-1'));
		const body = (await res.json()) as { tasks: { id: string }[] };

		expect(res.status).toBe(200);
		expect(body.tasks.map((t) => t.id)).toEqual(['t-pub']);
	});

	it('shows the owner their own private task on the event', async () => {
		state.queue = [[{ id: 'ev-1', calendarId: null, ownerId: 'user-1' }]];
		mockedGetEventTasks.mockResolvedValue([
			{ id: 't-priv-mine', visibility: 'private', userId: 'user-1' }
		] as never);

		const res = await GET(eventDetailEvent('user-1'));
		const body = (await res.json()) as { tasks: { id: string }[] };

		expect(res.status).toBe(200);
		expect(body.tasks.map((t) => t.id)).toEqual(['t-priv-mine']);
	});

	it("G5 (#292): each event task carries the event's calendar as eventCalendarId", async () => {
		state.queue = [[{ id: 'ev-1', calendarId: 'cal-9', ownerId: 'user-1' }]];
		mockedGetEventTasks.mockResolvedValue([
			{ id: 't-1', visibility: 'public', userId: 'user-1' }
		] as never);

		const res = await GET(eventDetailEvent('user-1'));
		const body = (await res.json()) as { tasks: { eventCalendarId: string | null }[] };

		expect(body.tasks[0].eventCalendarId).toBe('cal-9');
	});
});

describe('GET /api/tasks — eventCalendarId per task (G5, #292)', () => {
	it('always emits eventCalendarId: the joined calendar, or null for a standalone task', async () => {
		state.queue = [
			[],
			[
				{ id: 't-ev', dueDate: null, eventCalendarId: 'cal-fam' },
				{ id: 't-solo', dueDate: null }
			],
			[]
		];
		// SAFETY: test double — the list GET reads locals.user + url.
		const res = await GET({
			locals: { user: { id: 'user-1' } },
			url: new URL('http://localhost/api/tasks')
		} as never);
		const body = (await res.json()) as { tasks: { id: string; eventCalendarId: unknown }[] };

		expect(body.tasks.map((t) => [t.id, t.eventCalendarId])).toEqual([
			['t-ev', 'cal-fam'],
			['t-solo', null]
		]);
	});
});

/**
 * #234: an eventId attaches the task to an event whose title/start the
 * list then joins in — so the creator must be able to read that event,
 * and an unknown id is a 400, not an FK 500. A garbage dueDate is a 400.
 */
describe('POST /api/tasks — eventId access + dueDate validation (#234)', () => {
	it('attaches to an event the caller owns', async () => {
		state.queue = [[{ id: 'ev-1', calendarId: null, ownerId: 'user-1' }]];

		const res = await POST(event('user-1', { title: 'Pack', eventId: 'ev-1' }));

		expect(res.status).toBe(201);
		expect(mockedCreateTask.mock.calls[0][0]).toMatchObject({ eventId: 'ev-1' });
	});

	it('attaches to an event on a calendar the caller can read (family calendar)', async () => {
		// event lookup, familyMembers (calendar scope), calendars
		state.queue = [
			[{ id: 'ev-1', calendarId: 'cal-fam', ownerId: 'user-2' }],
			[{ familyId: 'fam-1' }],
			[{ id: 'cal-fam' }]
		];

		const res = await POST(event('user-1', { title: 'Pack', eventId: 'ev-1' }));

		expect(res.status).toBe(201);
	});

	it("403s another family's event (no title/start leak)", async () => {
		state.queue = [[{ id: 'ev-x', calendarId: 'cal-other', ownerId: 'user-9' }], [], []];

		const res = await POST(event('user-1', { title: 'Pack', eventId: 'ev-x' }));

		expect(res.status).toBe(403);
		expect(await res.json()).toEqual({ error: 'No access to this event' });
		expect(mockedCreateTask).not.toHaveBeenCalled();
	});

	it('400s an unknown eventId instead of an FK 500', async () => {
		state.queue = [[]];

		const res = await POST(event('user-1', { title: 'Pack', eventId: 'ghost' }));

		expect(res.status).toBe(400);
		expect(await res.json()).toEqual({ error: 'Event not found' });
		expect(mockedCreateTask).not.toHaveBeenCalled();
	});

	for (const bad of [42, { id: 'ev-1' }, true]) {
		it(`400s a non-string eventId ${JSON.stringify(bad)}`, async () => {
			const res = await POST(event('user-1', { title: 'Pack', eventId: bad }));

			expect(res.status).toBe(400);
			expect(mockedCreateTask).not.toHaveBeenCalled();
		});
	}

	it('omitted / empty eventId stays a standalone task', async () => {
		for (const eventId of [undefined, null, '']) {
			mockedCreateTask.mockClear();
			const res = await POST(event('user-1', { title: 'Pack', eventId }));
			expect(res.status).toBe(201);
			expect(mockedCreateTask.mock.calls[0][0]).toMatchObject({ eventId: null });
		}
	});

	for (const bad of ['not-a-date', 'tomorrow', '2026-13-45', 12345, true]) {
		it(`400s an invalid dueDate ${JSON.stringify(bad)}`, async () => {
			const res = await POST(event('user-1', { title: 'Pack', dueDate: bad }));

			expect(res.status).toBe(400);
			expect(await res.json()).toEqual({ error: 'Invalid dueDate' });
			expect(mockedCreateTask).not.toHaveBeenCalled();
		});
	}

	for (const ok of ['2026-11-03T23:59:00.000Z', '2026-11-03', '2026-11-03T18:00:00-06:00']) {
		it(`accepts a valid dueDate ${ok}`, async () => {
			const res = await POST(event('user-1', { title: 'Pack', dueDate: ok }));

			expect(res.status).toBe(201);
			expect(mockedCreateTask.mock.calls[0][0]).toMatchObject({ dueDate: ok });
		});
	}

	it('omitted / null / empty dueDate creates an undated task', async () => {
		for (const dueDate of [undefined, null, '']) {
			mockedCreateTask.mockClear();
			const res = await POST(event('user-1', { title: 'Pack', dueDate }));
			expect(res.status).toBe(201);
			expect(mockedCreateTask.mock.calls[0][0]).toMatchObject({ dueDate: null });
		}
	});
});

describe('POST /api/tasks — focusMinutes (021 device-channel spec)', () => {
	it('passes an explicit value to createTask', async () => {
		const res = await POST(event('user-1', { title: 'Dishes', focusMinutes: 25 }));

		expect(res.status).toBe(201);
		expect(mockedCreateTask.mock.calls[0][0]).toMatchObject({ focusMinutes: 25 });
	});

	it('absent field creates the task with null (no time yet)', async () => {
		const res = await POST(event('user-1', { title: 'Dishes' }));

		expect(res.status).toBe(201);
		expect(mockedCreateTask.mock.calls[0][0]).toMatchObject({ focusMinutes: null });
	});

	it('rejects a fractional value', async () => {
		const res = await POST(event('user-1', { title: 'Dishes', focusMinutes: 0.5 }));

		expect(res.status).toBe(400);
		expect(mockedCreateTask).not.toHaveBeenCalled();
	});

	it('rejects a negative value', async () => {
		const res = await POST(event('user-1', { title: 'Dishes', focusMinutes: -1 }));

		expect(res.status).toBe(400);
		expect(mockedCreateTask).not.toHaveBeenCalled();
	});
});

describe('POST /api/tasks — focusStartedAt (022: what is running)', () => {
	it('passes an ISO stamp to createTask as a Date', async () => {
		const res = await POST(event('user-1', { title: 'Dishes', focusStartedAt: '2026-11-01T12:00:00Z' }));

		expect(res.status).toBe(201);
		const data = mockedCreateTask.mock.calls[0][0] as { focusStartedAt?: Date | null };
		expect(data.focusStartedAt).toBeInstanceOf(Date);
		expect(data.focusStartedAt!.toISOString()).toBe('2026-11-01T12:00:00.000Z');
	});

	it('absent or null creates the task idle', async () => {
		await POST(event('user-1', { title: 'Dishes' }));
		await POST(event('user-1', { title: 'Dishes', focusStartedAt: null }));

		expect(mockedCreateTask.mock.calls[0][0]).toMatchObject({ focusStartedAt: null });
		expect(mockedCreateTask.mock.calls[1][0]).toMatchObject({ focusStartedAt: null });
	});

	it('rejects an unparseable stamp', async () => {
		const res = await POST(event('user-1', { title: 'Dishes', focusStartedAt: 'later' }));

		expect(res.status).toBe(400);
		expect(mockedCreateTask).not.toHaveBeenCalled();
	});
});
