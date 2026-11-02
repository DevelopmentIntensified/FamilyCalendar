import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { CalendarEvent } from '$lib/server/db/schema';

/**
 * #272 — every event mutation route fires the `events_changed` sync nudge
 * exactly ONCE per request (a bulk edit of N events is one nudge, the per-user
 * dedupe lives in eventsChangedNudge.test.ts), only after a write applied, and
 * never on read paths. Collaborators are scripted; only the nudge call is
 * under test here.
 */
const state = vi.hoisted(() => ({ rows: [] as unknown[] }));

/** A drizzle-ish chain: every builder step returns itself; awaiting it yields state.rows. */
function chain(): unknown {
	const c: Record<string, unknown> = {};
	for (const k of ['from', 'where', 'orderBy', 'limit', 'leftJoin', 'set', 'values', 'returning']) {
		c[k] = () => c;
	}
	c.then = (resolve: (v: unknown) => unknown) => resolve(state.rows);
	return c;
}

// oxlint-disable-next-line anti-slop/no-module-mocking -- db is infra; only the nudge call is under test.
vi.mock('$lib/server/db', () => ({
	db: {
		select: () => chain(),
		delete: () => chain(),
		update: () => chain(),
		insert: () => chain(),
		transaction: async (fn: (tx: unknown) => unknown) =>
			fn({ select: () => chain(), insert: () => chain(), delete: () => chain() })
	}
}));

// oxlint-disable-next-line anti-slop/no-module-mocking -- the nudge is the observable under test.
vi.mock('$lib/server/services/eventsChangedNudge', () => ({
	nudgeEventsChanged: vi.fn(async () => {})
}));

// oxlint-disable-next-line anti-slop/no-module-mocking -- actions scripted; covered by events.test.ts.
vi.mock('$lib/server/db/actions/events', () => ({
	getEvent: vi.fn(),
	createEvent: vi.fn(),
	updateEventById: vi.fn(),
	deleteEventInScope: vi.fn(),
	upsertException: vi.fn(),
	replaceEventInvites: vi.fn()
}));

// oxlint-disable-next-line anti-slop/no-module-mocking -- scope scripted; covered by calendarScope.test.ts.
vi.mock('$lib/server/db/actions/calendarScope', () => ({
	getAccessibleCalendarIds: vi.fn(async () => ['cal-personal', 'cal-fam']),
	canTouchEvent: vi.fn(async () => 'allowed'),
	eventAccessFilter: vi.fn(() => ({}))
}));

// oxlint-disable-next-line anti-slop/no-module-mocking -- personal calendar bootstrap is not this contract.
vi.mock('$lib/server/db/actions/calendar', () => ({
	ensurePersonalCalendar: vi.fn(async () => ({ id: 'cal-personal' }))
}));

// oxlint-disable-next-line anti-slop/no-module-mocking -- mirror setting off; mirrors covered by the audience superset.
vi.mock('$lib/server/db/actions/userSettings', () => ({
	getUserSettings: vi.fn(async () => null)
}));

// oxlint-disable-next-line anti-slop/no-module-mocking -- invite resolution needs db; irrelevant here.
vi.mock('$lib/server/utils/eventInvites', () => ({
	resolveEventInvites: vi.fn(async () => [])
}));

// oxlint-disable-next-line anti-slop/no-module-mocking -- read pipeline covered by eventDisplayService tests.
vi.mock('$lib/server/services/eventDisplayService', () => ({
	expandEventsForUser: vi.fn(async () => []),
	parseEvents: vi.fn(async () => []),
	attachRsvpStatus: vi.fn(async () => []),
	attachAttendanceSummaries: vi.fn(async () => []),
	attachCreatorNames: vi.fn(async () => [])
}));

// oxlint-disable-next-line anti-slop/no-module-mocking -- zone lookup is settings, not this contract.
vi.mock('$lib/server/utils/userTimezone', () => ({
	getUserZone: vi.fn(async () => 'utc'),
	zonedNow: vi.fn()
}));

import { GET as listEvents, POST as createRoute } from './+server';
import { PUT as updateRoute, DELETE as deleteRoute } from './[id]/+server';
import { POST as bulkRoute } from './bulk/+server';
import { nudgeEventsChanged } from '$lib/server/services/eventsChangedNudge';
import {
	createEvent,
	deleteEventInScope,
	getEvent,
	updateEventById
} from '$lib/server/db/actions/events';

const nudge = vi.mocked(nudgeEventsChanged);

function eventRow(over: Partial<CalendarEvent> = {}): CalendarEvent {
	return {
		id: 'event-1',
		calendarId: 'cal-fam',
		ownerId: 'u1',
		title: 'Dinner',
		start: '2026-11-10T18:00:00.000Z',
		end: null,
		description: null,
		location: null,
		allDay: false,
		recurrenceFrequency: null,
		recurrenceInterval: null,
		recurrenceByDay: null,
		recurrenceCount: null,
		recurrenceUntil: null,
		reminderMinutes: null,
		mirrorOf: null,
		created_at: new Date('2026-11-01T00:00:00Z'),
		...over
	};
}

// oxlint-disable-next-line anti-slop/no-unsafe-dictionary-type -- test request-body bag.
function req(
	body: Record<string, unknown> = {},
	id = 'event-1',
	url = 'http://localhost/api/events'
) {
	// SAFETY: test double — handlers read locals.user, params.id, url and request.json().
	return {
		locals: { user: { id: 'u1' } },
		params: { id },
		url: new URL(url),
		request: { url, json: async () => body }
	} as never;
}

beforeEach(() => {
	vi.clearAllMocks();
	state.rows = [];
});

describe('#272 events_changed nudge on event mutations', () => {
	it('GET /api/events (read) never nudges', async () => {
		const res = await listEvents(
			req({}, '', 'http://localhost/api/events?from=2026-11-01&to=2026-11-30')
		);
		expect(res.status).toBe(200);
		expect(nudge).not.toHaveBeenCalled();
	});

	it('POST /api/events (create) nudges once for the new event calendar', async () => {
		vi.mocked(createEvent).mockResolvedValue({
			...eventRow({ calendarId: 'cal-personal' }),
			mirrorOf: null
		});
		const res = await createRoute(req({ title: 'Dinner', start: '2026-11-10T18:00:00Z' }));
		expect(res.status).toBe(201);
		expect(nudge).toHaveBeenCalledTimes(1);
		expect(nudge).toHaveBeenCalledWith('u1', ['cal-personal']);
	});

	it('PUT /api/events/[id] (move to another calendar) nudges once with old + new calendar', async () => {
		vi.mocked(getEvent).mockResolvedValue(eventRow({ calendarId: 'cal-personal' }));
		vi.mocked(updateEventById).mockResolvedValue(eventRow({ calendarId: 'cal-fam' }));
		const res = await updateRoute(req({ calendarId: 'cal-fam', start: '2026-11-11T18:00:00Z' }));
		expect(res.status).toBe(200);
		expect(nudge).toHaveBeenCalledTimes(1);
		expect(nudge).toHaveBeenCalledWith('u1', ['cal-personal', 'cal-fam']);
	});

	it('PUT that matched nothing (404) does not nudge', async () => {
		vi.mocked(getEvent).mockResolvedValue(eventRow());
		vi.mocked(updateEventById).mockResolvedValue(undefined);
		const res = await updateRoute(req({ title: 'x' }));
		expect(res.status).toBe(404);
		expect(nudge).not.toHaveBeenCalled();
	});

	it("PUT scope 'this' (one occurrence) nudges once", async () => {
		vi.mocked(getEvent).mockResolvedValue(eventRow({ recurrenceFrequency: 'weekly' }));
		const res = await updateRoute(
			req({ scope: 'this', title: 'Moved' }, 'event-1~2026-11-10T18:00:00.000Z')
		);
		expect(res.status).toBe(200);
		expect(nudge).toHaveBeenCalledTimes(1);
	});

	it('DELETE /api/events/[id] nudges once on success, not on 404', async () => {
		vi.mocked(deleteEventInScope).mockResolvedValueOnce(1);
		expect((await deleteRoute(req({ scope: 'all' }))).status).toBe(200);
		expect(nudge).toHaveBeenCalledTimes(1);

		nudge.mockClear();
		vi.mocked(deleteEventInScope).mockResolvedValueOnce(0);
		expect((await deleteRoute(req({ scope: 'all' }))).status).toBe(404);
		expect(nudge).not.toHaveBeenCalled();
	});

	it("DELETE scope 'this' on a recurring event (cancel occurrence) nudges once", async () => {
		vi.mocked(getEvent).mockResolvedValue(eventRow({ recurrenceFrequency: 'weekly' }));
		const res = await deleteRoute(req({ scope: 'this' }, 'event-1~2026-11-10T18:00:00.000Z'));
		expect(res.status).toBe(200);
		expect(nudge).toHaveBeenCalledTimes(1);
	});

	it('POST /api/events/bulk of 3 events nudges ONCE, not per event', async () => {
		state.rows = [{ id: 'evt-a' }, { id: 'evt-b' }, { id: 'evt-c' }];
		vi.mocked(deleteEventInScope).mockResolvedValue(1);
		const res = await bulkRoute(
			req({ ids: [{ id: 'evt-a' }, { id: 'evt-b' }, { id: 'evt-c' }], op: { type: 'delete' } })
		);
		expect(res.status).toBe(200);
		expect(deleteEventInScope).toHaveBeenCalledTimes(3);
		expect(nudge).toHaveBeenCalledTimes(1);
		expect(nudge).toHaveBeenCalledWith('u1', ['cal-personal', 'cal-fam']);
	});

	it('bulk location edit nudges once; a bulk where nothing applied does not', async () => {
		state.rows = [{ id: 'evt-a' }, { id: 'evt-b' }];
		vi.mocked(updateEventById).mockResolvedValue(eventRow());
		await bulkRoute(
			req({ ids: [{ id: 'evt-a' }, { id: 'evt-b' }], op: { type: 'location', location: 'Park' } })
		);
		expect(nudge).toHaveBeenCalledTimes(1);

		nudge.mockClear();
		vi.mocked(updateEventById).mockResolvedValue(undefined);
		await bulkRoute(
			req({ ids: [{ id: 'evt-a' }, { id: 'evt-b' }], op: { type: 'location', location: 'Park' } })
		);
		expect(nudge).not.toHaveBeenCalled();
	});

	it('a bulk request refused before any write (403) does not nudge', async () => {
		state.rows = [];
		const res = await bulkRoute(req({ ids: [{ id: 'evt-a' }], op: { type: 'delete' } }));
		expect(res.status).toBe(403);
		expect(nudge).not.toHaveBeenCalled();
	});
});
