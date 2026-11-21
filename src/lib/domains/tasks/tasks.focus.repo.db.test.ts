/**
 * The focus repo against real Postgres: the per-user command FIFO and the
 * phone sessions, including the one-open-session index and the
 * absorbed-row guards. Each test runs in `rollbackTest`; the unique-violation
 * case runs inside a savepoint so the outer transaction stays usable.
 *
 * Doc: ./README.md#how-to-test
 */
import { describe, expect } from 'vitest';
import { seedUser } from '$lib/kernel/testing/seedRows.server';
import { rollbackTest } from '$lib/kernel/testing/testDb.server';
import { seedTask, seedTaskFocusCommands, seedTaskFocusSession } from './tasks.fixtures.server';
import {
	absorbSession,
	ackCommand,
	deleteStaleCommands,
	deleteUnabsorbedSession,
	findOpenSession,
	findSession,
	insertCommand,
	insertSession,
	listClosedUnabsorbedSessions,
	listCommands,
	listUnabsorbedSessions,
	setSessionEndedAt
} from './tasks.focus.repo.server';

const AT = (iso: string) => new Date(iso);

describe('device commands', () => {
	rollbackTest('lists the caller`s queue oldest first and caps it', async (db) => {
		const mia = await seedUser(db);
		const sam = await seedUser(db);
		await seedTaskFocusCommands(db, [
			{ userId: mia.id, command: 'stop', taskId: null, issuedAt: AT('2026-03-01T10:00:02Z') },
			{ userId: mia.id, command: 'stop', taskId: null, issuedAt: AT('2026-03-01T10:00:00Z') },
			{ userId: mia.id, command: 'stop', taskId: null, issuedAt: AT('2026-03-01T10:00:01Z') },
			{ userId: sam.id, command: 'stop', taskId: null, issuedAt: AT('2026-03-01T09:00:00Z') }
		]);

		const rows = await listCommands(db, { userId: mia.id, limit: 25 });
		expect(rows.map((row) => row.issuedAt.toISOString())).toEqual([
			'2026-03-01T10:00:00.000Z',
			'2026-03-01T10:00:01.000Z',
			'2026-03-01T10:00:02.000Z'
		]);
		expect(await listCommands(db, { userId: mia.id, limit: 2 })).toHaveLength(2);
	});

	rollbackTest('deleteStaleCommands drops only the caller`s old rows', async (db) => {
		const mia = await seedUser(db);
		const sam = await seedUser(db);
		await seedTaskFocusCommands(db, [
			{ userId: mia.id, command: 'stop', taskId: null, issuedAt: AT('2026-03-01T09:49:00Z') },
			{ userId: mia.id, command: 'stop', taskId: null, issuedAt: AT('2026-03-01T09:51:00Z') },
			{ userId: sam.id, command: 'stop', taskId: null, issuedAt: AT('2026-03-01T09:00:00Z') }
		]);
		expect(
			await deleteStaleCommands(db, { userId: mia.id, cutoff: AT('2026-03-01T09:50:00Z') })
		).toBe(1);
		expect((await listCommands(db, { userId: mia.id, limit: 25 })).map((row) => row.issuedAt.toISOString())).toEqual([
			'2026-03-01T09:51:00.000Z'
		]);
	});

	rollbackTest('ackCommand removes the caller`s command and ignores a foreign id', async (db) => {
		const mia = await seedUser(db);
		const sam = await seedUser(db);
		const mine = await insertCommand(db, {
			userId: mia.id,
			command: 'stop',
			taskId: null,
			issuedAt: AT('2026-03-01T10:00:00Z')
		});
		const theirs = await insertCommand(db, {
			userId: sam.id,
			command: 'stop',
			taskId: null,
			issuedAt: AT('2026-03-01T10:00:00Z')
		});

		expect(await ackCommand(db, { userId: mia.id, id: theirs.id })).toBe(0);
		expect(await ackCommand(db, { userId: mia.id, id: mine.id })).toBe(1);
		expect(await ackCommand(db, { userId: mia.id, id: mine.id })).toBe(0);
	});
});

describe('phone sessions', () => {
	rollbackTest('insertSession records an open session and findOpenSession reads it', async (db) => {
		const mia = await seedUser(db);
		const task = await seedTask(db, { title: 'Focus me', userId: mia.id });
		const created = await insertSession(db, {
			userId: mia.id,
			taskId: task.id,
			startedAt: AT('2026-03-01T10:00:00Z'),
			endedAt: null,
			createdAt: AT('2026-03-01T10:00:00Z')
		});
		expect(created?.source).toBe('phone');
		expect(created?.absorbedAt).toBeNull();

		expect((await findOpenSession(db, mia.id))?.id).toBe(created?.id);
		expect((await findSession(db, { userId: mia.id, id: created?.id ?? '' }))?.id).toBe(created?.id);
	});

	rollbackTest('a second open session is rejected by the one-open index', async (db) => {
		const mia = await seedUser(db);
		const task = await seedTask(db, { title: 'Focus me', userId: mia.id });
		await seedTaskFocusSession(db, {
			userId: mia.id,
			taskId: task.id,
			startedAt: AT('2026-03-01T10:00:00Z')
		});

		// The error must pass through drizzle so the SAVEPOINT rolls back (a
		// catch inside the callback would leave the outer tx aborted).
		const second = await db
			.transaction(async (tx) =>
				insertSession(tx, {
					userId: mia.id,
					taskId: task.id,
					startedAt: AT('2026-03-01T11:00:00Z'),
					endedAt: null
				})
			)
			.catch(() => null);
		expect(second).toBeNull();
		expect((await findOpenSession(db, mia.id))?.startedAt).toEqual(AT('2026-03-01T10:00:00Z'));
	});

	rollbackTest('a finished session is never refused for an open one', async (db) => {
		const mia = await seedUser(db);
		const task = await seedTask(db, { title: 'Focus me', userId: mia.id });
		await seedTaskFocusSession(db, {
			userId: mia.id,
			taskId: task.id,
			startedAt: AT('2026-03-01T10:00:00Z')
		});
		const finished = await insertSession(db, {
			userId: mia.id,
			taskId: task.id,
			startedAt: AT('2026-03-01T09:00:00Z'),
			endedAt: AT('2026-03-01T09:30:00Z')
		});
		expect(finished?.endedAt).toEqual(AT('2026-03-01T09:30:00Z'));
	});

	rollbackTest('setSessionEndedAt closes and overwrites, but never an absorbed row', async (db) => {
		const mia = await seedUser(db);
		const task = await seedTask(db, { title: 'Focus me', userId: mia.id });
		const open = await seedTaskFocusSession(db, {
			userId: mia.id,
			taskId: task.id,
			startedAt: AT('2026-03-01T10:00:00Z')
		});
		const closed = await setSessionEndedAt(db, {
			userId: mia.id,
			id: open.id,
			endedAt: AT('2026-03-01T10:30:00Z')
		});
		expect(closed?.endedAt).toEqual(AT('2026-03-01T10:30:00Z'));

		const rewritten = await setSessionEndedAt(db, {
			userId: mia.id,
			id: open.id,
			endedAt: AT('2026-03-01T10:45:00Z')
		});
		expect(rewritten?.endedAt).toEqual(AT('2026-03-01T10:45:00Z'));

		const absorbed = await seedTaskFocusSession(db, {
			userId: mia.id,
			taskId: task.id,
			startedAt: AT('2026-03-02T10:00:00Z'),
			endedAt: AT('2026-03-02T10:30:00Z'),
			absorbedAt: AT('2026-03-03T10:00:00Z')
		});
		expect(
			await setSessionEndedAt(db, {
				userId: mia.id,
				id: absorbed.id,
				endedAt: AT('2026-03-02T11:00:00Z')
			})
		).toBeNull();
	});

	rollbackTest('deleteUnabsorbedSession removes open and closed rows, never an absorbed one', async (db) => {
		const mia = await seedUser(db);
		const task = await seedTask(db, { title: 'Focus me', userId: mia.id });
		const open = await seedTaskFocusSession(db, {
			userId: mia.id,
			taskId: task.id,
			startedAt: AT('2026-03-01T10:00:00Z')
		});
		const closed = await seedTaskFocusSession(db, {
			userId: mia.id,
			taskId: task.id,
			startedAt: AT('2026-03-02T10:00:00Z'),
			endedAt: AT('2026-03-02T10:30:00Z')
		});
		const absorbed = await seedTaskFocusSession(db, {
			userId: mia.id,
			taskId: task.id,
			startedAt: AT('2026-03-03T10:00:00Z'),
			endedAt: AT('2026-03-03T10:30:00Z'),
			absorbedAt: AT('2026-03-04T10:00:00Z')
		});

		expect(await deleteUnabsorbedSession(db, { userId: mia.id, id: open.id })).toBe(true);
		expect(await deleteUnabsorbedSession(db, { userId: mia.id, id: closed.id })).toBe(true);
		expect(await deleteUnabsorbedSession(db, { userId: mia.id, id: absorbed.id })).toBe(false);
	});

	rollbackTest('absorbSession stamps only a closed, unabsorbed row', async (db) => {
		const mia = await seedUser(db);
		const task = await seedTask(db, { title: 'Focus me', userId: mia.id });
		const closed = await seedTaskFocusSession(db, {
			userId: mia.id,
			taskId: task.id,
			startedAt: AT('2026-03-01T10:00:00Z'),
			endedAt: AT('2026-03-01T10:30:00Z')
		});
		const open = await seedTaskFocusSession(db, {
			userId: mia.id,
			taskId: task.id,
			startedAt: AT('2026-03-02T10:00:00Z')
		});

		expect(await absorbSession(db, { userId: mia.id, id: open.id, absorbedAt: AT('2026-03-02T11:00:00Z') })).toBeNull();
		const absorbed = await absorbSession(db, {
			userId: mia.id,
			id: closed.id,
			absorbedAt: AT('2026-03-02T11:00:00Z')
		});
		expect(absorbed?.absorbedAt).toEqual(AT('2026-03-02T11:00:00Z'));
		// A repeat absorb is a no-op at the store (the service re-reads the stamp).
		expect(
			await absorbSession(db, {
				userId: mia.id,
				id: closed.id,
				absorbedAt: AT('2026-03-03T11:00:00Z')
			})
		).toBeNull();
	});

	rollbackTest(
		'listClosedUnabsorbedSessions reads closed + unabsorbed oldest first, capped',
		async (db) => {
			const mia = await seedUser(db);
			const sam = await seedUser(db);
			const task = await seedTask(db, { title: 'Focus me', userId: mia.id });
			const later = await seedTaskFocusSession(db, {
				userId: mia.id,
				taskId: task.id,
				startedAt: AT('2026-03-01T11:00:00Z'),
				endedAt: AT('2026-03-01T11:30:00Z')
			});
			const earlier = await seedTaskFocusSession(db, {
				userId: mia.id,
				taskId: task.id,
				startedAt: AT('2026-03-01T09:00:00Z'),
				endedAt: AT('2026-03-01T09:30:00Z')
			});
			await seedTaskFocusSession(db, {
				userId: mia.id,
				taskId: task.id,
				startedAt: AT('2026-03-01T08:00:00Z')
			});
			await seedTaskFocusSession(db, {
				userId: mia.id,
				taskId: task.id,
				startedAt: AT('2026-03-01T07:00:00Z'),
				endedAt: AT('2026-03-01T07:30:00Z'),
				absorbedAt: AT('2026-03-02T00:00:00Z')
			});
			await seedTaskFocusSession(db, {
				userId: sam.id,
				taskId: task.id,
				startedAt: AT('2026-03-01T06:00:00Z'),
				endedAt: AT('2026-03-01T06:30:00Z')
			});

			const rows = await listClosedUnabsorbedSessions(db, { userId: mia.id, limit: 200 });
			expect(rows.map((row) => row.id)).toEqual([earlier.id, later.id]);
			expect(await listClosedUnabsorbedSessions(db, { userId: mia.id, limit: 1 })).toHaveLength(1);
		}
	);

	rollbackTest('listUnabsorbedSessions includes open rows for the overlay', async (db) => {
		const mia = await seedUser(db);
		const task = await seedTask(db, { title: 'Focus me', userId: mia.id });
		await seedTaskFocusSession(db, {
			userId: mia.id,
			taskId: task.id,
			startedAt: AT('2026-03-01T10:00:00Z')
		});
		await seedTaskFocusSession(db, {
			userId: mia.id,
			taskId: task.id,
			startedAt: AT('2026-03-01T09:00:00Z'),
			endedAt: AT('2026-03-01T09:30:00Z')
		});
		await seedTaskFocusSession(db, {
			userId: mia.id,
			taskId: task.id,
			startedAt: AT('2026-03-01T08:00:00Z'),
			endedAt: AT('2026-03-01T08:30:00Z'),
			absorbedAt: AT('2026-03-02T00:00:00Z')
		});
		// Unordered read: the overlay does not depend on order.
		expect(await listUnabsorbedSessions(db, mia.id)).toHaveLength(2);
	});
});
