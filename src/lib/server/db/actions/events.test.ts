import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
	events,
	eventExceptions,
	eventAttendance,
	type CalendarEvent,
	type EventException
} from '$lib/server/db/schema';

/**
 * Scripted drizzle stub for the events actions (same pattern as
 * calendarScope.test.ts / dashboard.db.test.ts): each select/update/insert/
 * delete result is queued in call order and captured calls are asserted.
 * calendarScope is mocked so no family/calendar rows are needed.
 */

/** A captured update: which table, which set-clause. */
interface CapturedUpdate {
	table: typeof events | typeof eventExceptions;
	set: Record<string, string | number | boolean | null | Date | string[]>;
}

/** A captured insert: which table, which values. */
interface CapturedInsert {
	table: typeof events | typeof eventAttendance;
	// oxlint-disable-next-line anti-slop/no-unsafe-dictionary-type -- scripted capture bag; values shape differs per table (row vs attendance).
	values: Record<string, unknown>;
}

type DeletedTable = typeof events | typeof eventExceptions | typeof eventAttendance;

interface StubState {
	// Rows returned by tx.select().from().where(), in call order.
	txSelectQueue: unknown[][];
	// Rows returned by tx.update(...).set().where().returning(), in order.
	txUpdateReturning: CalendarEvent[][];
	// Rows returned by tx.insert(...).values().returning(), in order.
	txInsertReturning: CalendarEvent[][];
	// Captured tx.update calls.
	txUpdates: CapturedUpdate[];
	// Captured tx.insert calls.
	txInserts: CapturedInsert[];
	// Tables passed to tx.delete(), in call order.
	txDeletes: DeletedTable[];
	// Rows returned by delete(...).where().returning(), in call order.
	deleteReturning: { id: string }[][];
	// True once db.transaction() was entered (transactionality assertions).
	transactionOpened: boolean;
}

interface TxStub {
	select(): { from(): { where(): Promise<unknown[]> } };
	update(table: typeof events | typeof eventExceptions): {
		set(set: CapturedUpdate['set']): {
			where(): Promise<CalendarEvent[]> & { returning(): Promise<CalendarEvent[]> };
		};
	};
	insert(table: typeof events | typeof eventAttendance): {
		values(values: CapturedInsert['values']): Promise<unknown> & {
			returning(): Promise<CalendarEvent[]>;
		};
	};
	delete(table: DeletedTable): Promise<void> & {
		where(): { returning(): Promise<{ id: string }[]> } & Promise<unknown>;
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
		txInsertReturning: [],
		txUpdates: [],
		txInserts: [],
		txDeletes: [],
		deleteReturning: [],
		transactionOpened: false
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
		}),
		insert: (table) => ({
			values: (values) => {
				state.txInserts.push({ table, values });
				const rows = table === events ? (state.txInsertReturning.shift() ?? []) : [];
				return Object.assign(Promise.resolve(rows), {
					returning: async () => rows
				});
			}
		}),
		delete: (table) => {
			state.txDeletes.push(table);
			const rows = state.deleteReturning.shift() ?? [];
			return Object.assign(Promise.resolve(), {
				where: () =>
					Object.assign(Promise.resolve(rows), {
						returning: async () => rows
					})
			});
		}
	};
	return { state, txStub };
});

const state = test.state;
const txStub = test.txStub;

// oxlint-disable-next-line anti-slop/no-module-mocking -- scripted drizzle stub pins query shapes; real-Postgres harness tracked in docs/issues/002.
vi.mock('$lib/server/db', () => ({
	db: {
		transaction: async (fn: (tx: TxStub) => Promise<CalendarEvent | undefined | number>) => {
			state.transactionOpened = true;
			return fn(txStub);
		}
	}
}));

// oxlint-disable-next-line anti-slop/no-module-mocking -- scope inputs scripted; the filter itself is covered by calendarScope.test.ts.
vi.mock('$lib/server/db/actions/calendarScope', () => ({
	getAccessibleCalendarIds: async () => ['cal-fam'],
	eventAccessFilter: () => ({})
}));

import { deleteEventInScope, updateEventById, createEvent, shiftException } from './events';

beforeEach(() => {
	state.txSelectQueue = [];
	state.txUpdateReturning = [];
	state.txInsertReturning = [];
	state.txUpdates = [];
	state.txInserts = [];
	state.txDeletes = [];
	state.deleteReturning = [];
	state.transactionOpened = false;
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
		mirrorOf: null,
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

	it('removes the family-mirror rows in the same transaction as the master', async () => {
		state.deleteReturning = [[{ id: 'e1' }]];
		await deleteEventInScope('e1', 'u1', ['cal-fam']);

		expect(state.transactionOpened).toBe(true);
		expect(state.txDeletes).toEqual([events, events]); // master, then mirrors
	});

	it('does not issue a mirror delete when nothing matched', async () => {
		state.deleteReturning = [[]];
		await deleteEventInScope('e1', 'u1', ['cal-fam']);

		expect(state.txDeletes).toEqual([events]);
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
		// master update + 2 exception shifts + mirror propagation
		expect(state.txUpdates).toHaveLength(4);

		const [masterUpdate, ex1, ex2, mirrorUpdate] = state.txUpdates;
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
		expect(mirrorUpdate.table).toBe(events);
		expect(mirrorUpdate.set).toEqual({ start: '2026-08-08T10:00:00.000Z' });
	});

	it('propagates master field edits to the mirror row', async () => {
		state.txSelectQueue = [[eventRow()]];
		state.txUpdateReturning = [[eventRow({ title: 'X', location: 'Hall' })]];

		await updateEventById('e1', { title: 'X', location: 'Hall' }, 'u1', undefined, ['cal-fam']);

		const mirrorUpdate = state.txUpdates.at(-1);
		expect(mirrorUpdate?.table).toBe(events);
		expect(mirrorUpdate?.set).toEqual({ title: 'X', location: 'Hall' });
	});

	it('does not mirror calendar-only moves (mirror keeps its own calendar)', async () => {
		state.txSelectQueue = [[eventRow()]];
		state.txUpdateReturning = [[eventRow({ calendarId: 'cal-other' })]];

		await updateEventById('e1', { calendarId: 'cal-other' }, 'u1', undefined, ['cal-fam']);

		expect(state.txUpdates).toHaveLength(1);
		expect(state.txUpdates[0].set).toEqual({ calendarId: 'cal-other' });
	});

	it('does not touch exceptions when the start is unchanged', async () => {
		state.txSelectQueue = [[eventRow()]];
		state.txUpdateReturning = [[eventRow({ title: 'X' })]];

		await updateEventById('e1', { title: 'X' }, 'u1', undefined, ['cal-fam']);

		const exceptionUpdates = state.txUpdates.filter((u) => u.table === eventExceptions);
		expect(exceptionUpdates).toHaveLength(0);
	});

	it('does not touch exceptions for a non-recurring event', async () => {
		state.txSelectQueue = [[eventRow({ recurrenceFrequency: null })]];
		state.txUpdateReturning = [[eventRow({ recurrenceFrequency: null })]];

		await updateEventById('e1', { start: '2026-08-08T10:00:00.000Z' }, 'u1', undefined, [
			'cal-fam'
		]);

		const exceptionUpdates = state.txUpdates.filter((u) => u.table === eventExceptions);
		expect(exceptionUpdates).toHaveLength(0);
	});

	it('applies invites inside the same transaction', async () => {
		state.txSelectQueue = [[eventRow()], [[]]]; // existing row, then attendance
		state.txUpdateReturning = [[eventRow({ title: 'X' })]];

		await updateEventById('e1', { title: 'X' }, 'u1', [{ name: 'Bob' }], ['cal-fam']);

		expect(state.transactionOpened).toBe(true);
		const guestInsert = state.txInserts.find(
			(i) => i.table === eventAttendance && JSON.stringify(i.values).includes('Bob')
		);
		expect(guestInsert?.values).toEqual([
			{ eventId: 'e1', name: 'Bob', status: 'undecided', inviteType: 'optional' }
		]);
	});

	it('returns nothing when the access filter matches no row', async () => {
		state.txSelectQueue = [[]];
		await expect(
			updateEventById('e1', { title: 'X' }, 'u1', undefined, ['cal-fam'])
		).resolves.toBeUndefined();
	});
});

describe('createEvent', () => {
	it('inserts event + creator RSVP + invites in ONE transaction', async () => {
		const created = eventRow();
		state.txInsertReturning = [[created]];
		state.txSelectQueue = [[]]; // replaceEventInvites: no existing attendance

		const data = eventRow();
		const { id: _id, created_at: _created_at, ...insertData } = data;

		const result = await createEvent(insertData, 'owner-1', [{ name: 'Bob' }]);

		expect(result).toEqual(created);
		expect(state.transactionOpened).toBe(true);

		expect(state.txInserts.map((i) => i.table)).toEqual([events, eventAttendance, eventAttendance]);
		expect(state.txInserts[0].values).toMatchObject({ title: 'T', calendarId: 'cal-fam' });
		expect(state.txInserts[1].values).toMatchObject({
			eventId: 'e1',
			userId: 'owner-1',
			status: 'going'
		});
		expect(state.txInserts[2].values).toEqual([
			{ eventId: 'e1', name: 'Bob', status: 'undecided', inviteType: 'optional' }
		]);
	});

	it('skips the creator RSVP when ownerId is empty and still returns the event', async () => {
		const created = eventRow({ id: 'e2' });
		state.txInsertReturning = [[created]];

		const insertData: Omit<CalendarEvent, 'id' | 'created_at'> = {
			calendarId: 'cal-fam',
			ownerId: 'owner',
			title: 'T',
			start: '2026-08-01T10:00:00.000Z',
			end: null,
			description: null,
			location: null,
			allDay: false,
			recurrenceFrequency: null,
			recurrenceInterval: null,
			recurrenceByDay: null,
			recurrenceCount: null,
			recurrenceUntil: null,
			reminderMinutes: null
		};

		await expect(createEvent(insertData, '', undefined)).resolves.toEqual(created);

		expect(state.txInserts.map((i) => i.table)).toEqual([events]);
	});
});
