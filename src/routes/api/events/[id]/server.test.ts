import { describe, it, expect, vi, beforeEach } from 'vitest';
import { DELETE, PUT } from './+server';
import { eventExceptions, type CalendarEvent } from '$lib/server/db/schema';

/**
 * The event [id] route's collaborators are scripted: the actions module is
 * mocked so the test can pin WHICH deletion function the route uses
 * (scope-correct deleteEventInScope vs the old owner-only filter), and db
 * is stubbed for the exception-cleanup delete.
 */
interface RouteState {
	// Tables passed to db.delete() inside the route (exception cleanup).
	exceptionDeletes: (typeof eventExceptions)[];
}

const state = vi.hoisted(
	(): RouteState => ({
		exceptionDeletes: []
	})
);

// oxlint-disable-next-line anti-slop/no-module-mocking -- scripted stub pins which scoped action the route calls; real-Postgres harness tracked in docs/issues/002.
vi.mock('$lib/server/db', () => ({
	db: {
		delete: (table: typeof eventExceptions) => {
			state.exceptionDeletes.push(table);
			return { where: async () => {} };
		}
	}
}));

// oxlint-disable-next-line anti-slop/no-module-mocking -- actions scripted; action-internal behavior covered by events.test.ts.
vi.mock('$lib/server/db/actions/events', () => ({
	getEvent: vi.fn(),
	updateEventById: vi.fn(),
	deleteEventInScope: vi.fn(),
	upsertException: vi.fn(),
	replaceEventInvites: vi.fn()
}));

// oxlint-disable-next-line anti-slop/no-module-mocking -- scope inputs scripted; scope logic covered by calendarScope.test.ts.
vi.mock('$lib/server/db/actions/calendarScope', () => ({
	getAccessibleCalendarIds: vi.fn(async () => ['cal-fam']),
	canTouchEvent: vi.fn(async () => 'allowed')
}));

// oxlint-disable-next-line anti-slop/no-module-mocking -- invites resolution needs db; irrelevant to the delete-scope contract under test.
vi.mock('$lib/server/utils/eventInvites', () => ({
	resolveEventInvites: vi.fn(
		// oxlint-disable-next-line anti-slop/no-unknown-parameters -- test double echoes the raw body field; real resolution is covered elsewhere.
		async (_userId: string, raw: unknown) => raw ?? []
	)
}));

// oxlint-disable-next-line anti-slop/no-module-mocking -- recurrence normalization is the frontend agent's contract; route just spreads it.
vi.mock('$lib/server/services/eventRecurrence', () => ({
	normalizeEventRecurrence: vi.fn(() => ({}))
}));

import {
	getEvent,
	updateEventById,
	deleteEventInScope,
	upsertException,
	replaceEventInvites
} from '$lib/server/db/actions/events';
import { canTouchEvent } from '$lib/server/db/actions/calendarScope';

const mockedGetEvent = vi.mocked(getEvent);
const mockedUpdate = vi.mocked(updateEventById);
const mockedDeleteInScope = vi.mocked(deleteEventInScope);
const mockedUpsert = vi.mocked(upsertException);
const mockedReplaceInvites = vi.mocked(replaceEventInvites);

beforeEach(() => {
	state.exceptionDeletes = [];
	vi.clearAllMocks();
});

function eventRow(over: Partial<CalendarEvent> = {}): CalendarEvent {
	return {
		id: 'eventabc123',
		calendarId: 'cal-fam',
		ownerId: 'owner-1',
		title: 'Family dinner',
		start: '2026-08-10T18:00:00.000Z',
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
		created_at: new Date('2026-08-01T00:00:00Z'),
		...over
	};
}

// oxlint-disable-next-line anti-slop/no-unsafe-dictionary-type -- test request-body bag; handlers only read known keys off request.json().
function req(userId: string | null, body: Record<string, unknown> = {}, paramId = 'eventabc123') {
	// SAFETY: test double — handlers only read locals.user, params.id, and request.json().
	return {
		locals: { user: userId ? { id: userId } : null },
		params: { id: paramId },
		request: {
			url: 'http://localhost/api/events/eventabc123',
			json: async () => body
		}
	} as never;
}

describe('DELETE /api/events/[id] scope "all"', () => {
	it('a non-owner family member deletes a family-calendar event via calendar scope', async () => {
		mockedGetEvent.mockResolvedValue(eventRow({ recurrenceFrequency: 'weekly' }));
		mockedDeleteInScope.mockResolvedValue(1);

		const res = await DELETE(req('member-1', { scope: 'all' }));

		expect(res.status).toBe(200);
		// Same calendar-access scope as PUT and the bulk route:
		expect(mockedDeleteInScope).toHaveBeenCalledWith('eventabc123', 'member-1', ['cal-fam']);
		// Series exception rows are cleaned up with the master.
		expect(state.exceptionDeletes).toHaveLength(1);
	});

	it('a stranger with no calendar access gets 404', async () => {
		mockedGetEvent.mockResolvedValue(eventRow());
		mockedDeleteInScope.mockResolvedValue(0);

		const res = await DELETE(req('stranger-1', { scope: 'all' }));

		expect(res.status).toBe(404);
	});
});

describe('DELETE /api/events/[id] scope "this"', () => {
	it('deletes a non-recurring event via calendar scope, not owner-only', async () => {
		mockedGetEvent.mockResolvedValue(eventRow());
		vi.mocked(canTouchEvent).mockResolvedValue('allowed');
		mockedDeleteInScope.mockResolvedValue(1);

		const res = await DELETE(req('member-1', { scope: 'this' }));

		expect(res.status).toBe(200);
		expect(mockedDeleteInScope).toHaveBeenCalledWith('eventabc123', 'member-1', ['cal-fam']);
	});

	it('still 404s when nothing in scope was deleted', async () => {
		mockedGetEvent.mockResolvedValue(eventRow());
		vi.mocked(canTouchEvent).mockResolvedValue('allowed');
		mockedDeleteInScope.mockResolvedValue(0);

		const res = await DELETE(req('member-1', { scope: 'this' }));

		expect(res.status).toBe(404);
	});

	it('cancels a recurring occurrence via exception', async () => {
		mockedGetEvent.mockResolvedValue(eventRow({ recurrenceFrequency: 'weekly' }));
		vi.mocked(canTouchEvent).mockResolvedValue('allowed');

		const res = await DELETE(
			req('member-1', { scope: 'this' }, 'eventabc123~2026-08-10T18:00:00.000Z')
		);

		expect(res.status).toBe(200);
		expect(mockedUpsert).toHaveBeenCalledWith({
			eventId: 'eventabc123',
			originalDate: '2026-08-10T18:00:00.000Z',
			isCancelled: true
		});
	});
});

describe('PUT /api/events/[id]', () => {
	it('updates via calendar-access scope (unchanged contract)', async () => {
		mockedGetEvent.mockResolvedValue(eventRow());
		mockedUpdate.mockResolvedValue(eventRow({ title: 'New' }));

		const res = await PUT(req('member-1', { title: 'New', scope: 'all' }));

		expect(res.status).toBe(200);
		expect(mockedUpdate).toHaveBeenCalledWith(
			'eventabc123',
			expect.objectContaining({ title: 'New' }),
			'member-1',
			undefined,
			['cal-fam']
		);
	});

	it("scope 'this' applies attendee edits to the MASTER and returns a note", async () => {
		mockedGetEvent.mockResolvedValue(eventRow({ recurrenceFrequency: 'weekly' }));
		vi.mocked(canTouchEvent).mockResolvedValue('allowed');
		const attendees = [{ name: 'Bob' }];

		const res = await PUT(
			req(
				'member-1',
				{ scope: 'this', occurrenceDate: '2026-08-10T18:00:00.000Z', attendees },
				'eventabc123~2026-08-10T18:00:00.000Z'
			)
		);

		expect(res.status).toBe(200);
		// Master-id safe: invites land on the series, not the occurrence id.
		expect(mockedReplaceInvites).toHaveBeenCalledWith('eventabc123', attendees);
		const body = await res.json();
		expect(body.note).toContain('whole series');
	});

	it("scope 'this' without attendee data stays note-only and silent", async () => {
		mockedGetEvent.mockResolvedValue(eventRow({ recurrenceFrequency: 'weekly' }));
		vi.mocked(canTouchEvent).mockResolvedValue('allowed');

		const res = await PUT(
			req(
				'member-1',
				{ scope: 'this', occurrenceDate: '2026-08-10T18:00:00.000Z', title: 'Moved' },
				'eventabc123~2026-08-10T18:00:00.000Z'
			)
		);

		expect(res.status).toBe(200);
		expect(mockedReplaceInvites).not.toHaveBeenCalled();
		expect((await res.json()).note).toBeDefined();
	});
});
