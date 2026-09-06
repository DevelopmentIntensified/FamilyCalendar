import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
	events,
	eventExceptions,
	type CalendarEvent,
	type EventException
} from '$lib/server/db/schema';

/**
 * Scripted drizzle stub for the events actions (same pattern as
 * calendarScope.test.ts / dashboard.db.test.ts): each select/update/delete
 * result is queued in call order and captured calls are asserted.
 * calendarScope is mocked so no family/calendar rows are needed.
 */

/** A captured update: which table, which set-clause. */
interface CapturedUpdate {
	table: typeof events | typeof eventExceptions;
	set: Record<string, string | number | boolean | null | Date | string[]>;
}

interface StubState {
	// Rows returned by tx.select().from().where(), in call order:
	// [0] the master row matched by the access filter, [1] its exceptions.
	txSelectQueue: (CalendarEvent | EventException)[][];
	// Rows returned by tx.update(...).set().where().returning(), in order.
	txUpdateReturning: CalendarEvent[][];
	// Captured tx.update calls: which table and which values were set.
	txUpdates: CapturedUpdate[];
	// Rows returned by db.delete(...).where().returning().
	deleteReturning: { id: string }[][];
}

interface TxStub {
	select(): { from(): { where(): Promise<(CalendarEvent | EventException)[]> } };
	update(table: typeof events | typeof eventExceptions): {
		set(set: CapturedUpdate['set']): {
			where(): Promise<CalendarEvent[]> & { returning(): Promise<CalendarEvent[]> };
		};
	};
}

interface ScriptedDb {
	state: StubState;
	txStub: TxStub;
}

const test = vi.hoisted((): ScriptedDb => {
	const state: StubState = {
		txSelectQueue: [],
		txUpdateReturning: [],
		txUpdates: [],
		deleteReturning: []
	};
	const txStub: TxStub = {
		select: () => ({
			from: () => ({
				where: async () => state.txSelectQueue.shift() ?? []
			})
		}),
		update: (table) => ({
			set: (set) => ({
				where: () => {
					state.txUpdates.push({ table, set });
					const rows = state.txUpdateReturning.shift() ?? [];
					return Object.assign(Promise.resolve(rows), {
						returning: async () => rows
					});
				}
			})
		})
	};
	return { state, txStub };
});

const state = test.state;
const txStub = test.txStub;

// oxlint-disable-next-line anti-slop/no-module-mocking -- scripted drizzle stub pins query shapes; real-Postgres harness tracked in docs/issues/002.
vi.mock('$lib/server/db', () => ({
	db: {
		transaction: async (fn: (tx: TxStub) => Promise<CalendarEvent | undefined>) => fn(txStub),
		delete: (_table: typeof events | typeof eventExceptions) => ({
			where: () => ({
				returning: async () => state.deleteReturning.shift() ?? []
			})
		})
	}
}));

// oxlint-disable-next-line anti-slop/no-module-mocking -- scope inputs scripted; the filter itself is covered by calendarScope.test.ts.
vi.mock('$lib/server/db/actions/calendarScope', () => ({
	getAccessibleCalendarIds: async () => ['cal-fam'],
	eventAccessFilter: () => ({})
}));

import { deleteEventInScope, updateEventById, shiftException } from './events';

beforeEach(() => {
	state.txSelectQueue = [];
	state.txUpdateReturning = [];
	state.txUpdates = [];
	state.deleteReturning = [];
});

function eventRow(over: Partial<CalendarEvent> = {}): CalendarEvent {
	return {
		id: 'e1',
		calendarId: 'cal-fam',
		ownerId: 'owner',
		title: 'T',
		start: '2026-08-01T10:00:00.000Z',
		end: null,
		description: null,
		location: null,
		allDay: false,
		recurrenceFrequency: 'weekly',
		recurrenceInterval: 1,
		recurrenceByDay: null,
		recurrenceCount: null,
		recurrenceUntil: null,
		reminderMinutes: null,
		created_at: new Date('2026-08-01T00:00:00Z'),
		...over
	};
}

function exceptionRow(over: Partial<EventException> = {}): EventException {
	return {
		id: 'x1',
		eventId: 'e1',
		originalDate: '2026-08-03T10:00:00.000Z',
		isCancelled: false,
		title: null,
		description: null,
		location: null,
		start: '2026-08-03T11:00:00.000Z',
		end: '2026-08-03T12:00:00.000Z',
		allDay: false,
		createdAt: new Date('2026-08-01T00:00:00Z'),
		...over
	};
}

describe('deleteEventInScope', () => {
	it('returns 1 when the scoped row was deleted', async () => {
		state.deleteReturning = [[{ id: 'e1' }]];
		await expect(deleteEventInScope('e1', 'u1', ['cal-fam'])).resolves.toBe(1);
	});

	it('returns 0 when nothing matched the scope', async () => {
		state.deleteReturning = [[]];
		await expect(deleteEventInScope('e1', 'u1', ['cal-fam'])).resolves.toBe(0);
	});
});

describe('shiftException', () => {
	it('shifts the slot key and both overrides by the delta', () => {
		const week = 7 * 24 * 60 * 60 * 1000;
		expect(shiftException(exceptionRow(), week)).toEqual({
			originalDate: '2026-08-10T10:00:00.000Z',
			start: '2026-08-10T11:00:00.000Z',
			end: '2026-08-10T12:00:00.000Z'
		});
	});

	it('keeps null overrides null (cancelled-only exception)', () => {
		const week = 7 * 24 * 60 * 60 * 1000;
		expect(
			shiftException(exceptionRow({ start: null, end: null, isCancelled: true }), week)
		).toEqual({
			originalDate: '2026-08-10T10:00:00.000Z',
			start: null,
			end: null
		});
	});
});

describe('updateEventById', () => {
	it('shifts exception slots in the same transaction when the master start moves', async () => {
		const existing = eventRow();
		const updated = eventRow({ start: '2026-08-08T10:00:00.000Z' });
		state.txSelectQueue = [
			[existing],
			[
				exceptionRow(),
				exceptionRow({
					id: 'x2',
					originalDate: '2026-08-05T10:00:00.000Z',
					start: null,
					end: null,
					isCancelled: true
				})
			]
		];
		state.txUpdateReturning = [[updated]];

		const result = await updateEventById(
			'e1',
			{ start: '2026-08-08T10:00:00.000Z' },
			'u1',
			undefined,
			['cal-fam']
		);

		expect(result).toEqual(updated);
		expect(state.txUpdates).toHaveLength(3);

		const [masterUpdate, ex1, ex2] = state.txUpdates;
		expect(masterUpdate.table).toBe(events);
		expect(masterUpdate.set.start).toBe('2026-08-08T10:00:00.000Z');
		expect(ex1.table).toBe(eventExceptions);
		expect(ex1.set).toEqual({
			originalDate: '2026-08-10T10:00:00.000Z',
			start: '2026-08-10T11:00:00.000Z',
			end: '2026-08-10T12:00:00.000Z'
		});
		expect(ex2.set).toEqual({
			originalDate: '2026-08-12T10:00:00.000Z',
			start: null,
			end: null
		});
	});

	it('does not touch exceptions when the start is unchanged', async () => {
		state.txSelectQueue = [[eventRow()]];
		state.txUpdateReturning = [[eventRow({ title: 'X' })]];

		await updateEventById('e1', { title: 'X' }, 'u1', undefined, ['cal-fam']);

		expect(state.txUpdates).toHaveLength(1);
		expect(state.txUpdates[0].table).toBe(events);
	});

	it('does not touch exceptions for a non-recurring event', async () => {
		state.txSelectQueue = [[eventRow({ recurrenceFrequency: null })]];
		state.txUpdateReturning = [[eventRow({ recurrenceFrequency: null })]];

		await updateEventById('e1', { start: '2026-08-08T10:00:00.000Z' }, 'u1', undefined, [
			'cal-fam'
		]);

		expect(state.txUpdates).toHaveLength(1);
	});

	it('returns nothing when the access filter matches no row', async () => {
		state.txSelectQueue = [[]];
		await expect(
			updateEventById('e1', { title: 'X' }, 'u1', undefined, ['cal-fam'])
		).resolves.toBeUndefined();
	});
});
