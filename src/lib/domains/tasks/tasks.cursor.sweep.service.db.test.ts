/**
 * The scheduled cursor sweep (Q-092) against real Postgres: it pins every
 * owner's stale open Recurring Task to today-end in that owner's zone, is
 * bounded by its batch limits, and a second run moves nothing. `testCtx({ db,
 * now })` pins the clock, so no test reads the process time.
 *
 * Doc: ./README.md#how-to-test
 */
import { eq } from 'drizzle-orm';
import { describe, expect } from 'vitest';
import type { Db } from '$lib/kernel/db/database.server';
import { tasks } from '$lib/kernel/db/tables.server';
import { seedUser } from '$lib/kernel/testing/seedRows.server';
import { testCtx } from '$lib/kernel/testing/testCtx.server';
import { rollbackTest } from '$lib/kernel/testing/testDb.server';
import { seedTask, seedUserZone } from './tasks.fixtures.server';
import { sweepOverdueTaskCursors } from './tasks.cursor.sweep.service.server';

const NOW = '2026-03-01T09:00:00.000Z';
const STALE = '2026-02-20 10:00:00+00';
const RECURRING = { recurrenceFrequency: 'daily', recurrenceInterval: 1 } as const;

async function dueOf(db: Db, id: string) {
	const [row] = await db.select({ dueDate: tasks.dueDate }).from(tasks).where(eq(tasks.id, id));
	return row.dueDate;
}

describe('sweepOverdueTaskCursors', () => {
	rollbackTest('pins every owner`s stale cursor in the owner`s own zone', async (db) => {
		const mia = await seedUser(db, { firstName: 'Mia' });
		const sam = await seedUser(db, { firstName: 'Sam' });
		await seedUserZone(db, sam.id, 'Pacific/Kiritimati');
		const miasRow = await seedTask(db, { title: 'Mia', userId: mia.id, dueDate: STALE, ...RECURRING });
		const samsRow = await seedTask(db, { title: 'Sam', userId: sam.id, dueDate: STALE, ...RECURRING });
		const ctx = testCtx({ db, now: NOW });

		const report = await sweepOverdueTaskCursors(ctx);

		expect(report).toEqual({ scanned: 2, pinned: 2 });
		// No stored zone is UTC; Sam's 23:59 on his own (+14) day is 09:59Z.
		expect(await dueOf(db, miasRow.id)).toBe('2026-03-01 23:59:00+00');
		expect(await dueOf(db, samsRow.id)).toBe('2026-03-01 09:59:00+00');
	});

	rollbackTest('leaves rows that are not stale, completed, archived, not recurring or dateless', async (db) => {
		const mia = await seedUser(db);
		const dueLaterToday = '2026-03-01 20:00:00+00';
		const dueEarlierToday = '2026-03-01 00:30:00+00';
		const rows = [
			await seedTask(db, { title: 'Later today', userId: mia.id, dueDate: dueLaterToday, ...RECURRING }),
			await seedTask(db, { title: 'Earlier today', userId: mia.id, dueDate: dueEarlierToday, ...RECURRING }),
			await seedTask(db, { title: 'Completed', userId: mia.id, dueDate: STALE, completedAt: '2026-02-21 00:00:00+00', ...RECURRING }),
			await seedTask(db, { title: 'Archived', userId: mia.id, dueDate: STALE, archivedAt: '2026-02-21 00:00:00+00', ...RECURRING }),
			await seedTask(db, { title: 'One-off', userId: mia.id, dueDate: STALE }),
			await seedTask(db, { title: 'Dateless', userId: mia.id, dueDate: null, ...RECURRING })
		];
		const before = await Promise.all(rows.map((row) => dueOf(db, row.id)));
		const ctx = testCtx({ db, now: NOW });

		const report = await sweepOverdueTaskCursors(ctx);

		expect(report.pinned).toBe(0);
		expect(await Promise.all(rows.map((row) => dueOf(db, row.id)))).toEqual(before);
	});

	rollbackTest('is idempotent: a second run moves nothing', async (db) => {
		const mia = await seedUser(db);
		const row = await seedTask(db, { title: 'Water', userId: mia.id, dueDate: STALE, ...RECURRING });
		const ctx = testCtx({ db, now: NOW });

		const first = await sweepOverdueTaskCursors(ctx);
		const afterFirst = await dueOf(db, row.id);
		const second = await sweepOverdueTaskCursors(ctx);

		expect(first.pinned).toBe(1);
		expect(second.pinned).toBe(0);
		expect(await dueOf(db, row.id)).toBe(afterFirst);
	});

	rollbackTest('is bounded: it reads at most maxBatches pages of batchSize rows', async (db) => {
		const mia = await seedUser(db);
		const seeded = [];
		for (let index = 0; index < 5; index += 1) {
			seeded.push(
				await seedTask(db, { title: `Row ${index}`, userId: mia.id, dueDate: STALE, ...RECURRING })
			);
		}
		const ctx = testCtx({ db, now: NOW });

		const first = await sweepOverdueTaskCursors(ctx, { batchSize: 2, maxBatches: 2 });

		// Two pages of two rows: one row is left for the next run.
		expect(first).toEqual({ scanned: 4, pinned: 4 });
		const dues = await Promise.all(seeded.map((row) => dueOf(db, row.id)));
		expect(dues.filter((due) => due === STALE)).toHaveLength(1);

		const second = await sweepOverdueTaskCursors(ctx, { batchSize: 2, maxBatches: 2 });

		expect(second.pinned).toBe(1);
		const after = await Promise.all(seeded.map((row) => dueOf(db, row.id)));
		expect(after.every((due) => due === '2026-03-01 23:59:00+00')).toBe(true);
	});

	rollbackTest('answers zero on an empty table', async (db) => {
		const ctx = testCtx({ db, now: NOW });

		expect(await sweepOverdueTaskCursors(ctx)).toEqual({ scanned: 0, pinned: 0 });
	});
});
