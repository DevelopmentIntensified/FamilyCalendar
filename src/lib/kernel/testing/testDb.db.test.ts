import { count, eq, sql } from 'drizzle-orm';
import { beforeEach, describe, expect, it } from 'vitest';
import { withTx } from '../db/database.server';
import { families, groceryItems, meals, notifications, users } from '../db/tables.server';
import { seedUser, uniqueSuffix } from './seedRows.server';
import { testCtx } from './testCtx.server';
import { inRollback, rollbackTest, testDb, truncateAll } from './testDb.server';

describe('test database', () => {
	it('is built from every sql/migrations file, tracked like production', async () => {
		const rows = await testDb().execute<{ n: number }>(
			sql`SELECT count(*)::int AS n FROM __schema_migrations`
		);
		expect(rows[0].n).toBeGreaterThanOrEqual(27);
	});
});

describe('rollbackTest', () => {
	let seededEmail = '';

	rollbackTest('sees its own writes inside the transaction', async (db) => {
		const user = await seedUser(db, { firstName: 'Mia' });
		seededEmail = user.email ?? '';
		const [found] = await db.select().from(users).where(eq(users.id, user.id));
		expect(found.firstName).toBe('Mia');
	});

	it('leaves nothing behind afterwards', async () => {
		expect(seededEmail).not.toBe('');
		const [row] = await testDb()
			.select({ n: count() })
			.from(users)
			.where(eq(users.email, seededEmail));
		expect(row.n).toBe(0);
	});

	rollbackTest(
		'runs service-level transactions as savepoints that can fail independently',
		async (db) => {
			const ctx = testCtx({ db });
			const kept = await seedUser(ctx.db);
			await expect(
				withTx(ctx, async (txCtx) => {
					await seedUser(txCtx.db, { firstName: 'Ghost' });
					throw new Error('abort inner');
				})
			).rejects.toThrow('abort inner');
			const names = await db
				.select({ firstName: users.firstName })
				.from(users)
				.where(eq(users.id, kept.id));
			expect(names).toHaveLength(1);
			const ghosts = await db
				.select({ n: count() })
				.from(users)
				.where(eq(users.firstName, 'Ghost'));
			expect(ghosts[0].n).toBe(0);
		}
	);

	it('re-throws a failing assertion instead of swallowing it as a rollback', async () => {
		await expect(
			inRollback(async () => {
				throw new Error('assertion failed');
			})
		).rejects.toThrow('assertion failed');
	});
});

describe('truncateAll (committed mode)', () => {
	beforeEach(truncateAll);

	it('starts every test with empty tables', async () => {
		await seedUser(testDb());
		await truncateAll();
		const [row] = await testDb().select({ n: count() }).from(users);
		expect(row.n).toBe(0);
	});

	it('leaves foreign keys enforced for the next test', async () => {
		// `SET LOCAL` is transaction-scoped. A session-level `SET` would leave
		// `replica` on this pooled connection and swallow this violation.
		await truncateAll();
		await expect(
			testDb()
				.insert(groceryItems)
				.values({ userId: `missing-${uniqueSuffix()}`, name: 'Orphan', nameKey: 'orphan' })
		).rejects.toMatchObject({ cause: { code: '23503' } }); // foreign_key_violation; drizzle wraps the driver error
	});

	it('resets in under 250 ms', async () => {
		const db = testDb();
		const seedFiveTables = async () => {
			const user = await seedUser(db);
			const [family] = await db.insert(families).values({ name: 'Reset family' }).returning();
			await db.insert(meals).values({
				familyId: family.id,
				date: '2026-11-11',
				kind: 'dinner',
				label: 'Pasta'
			});
			await db.insert(notifications).values({
				userId: user.id,
				type: 'generic',
				actorName: 'Test',
				message: 'reset me'
			});
			await db.insert(groceryItems).values({ userId: user.id, name: 'Milk', nameKey: 'milk' });
		};

		const durations: number[] = [];
		for (let run = 0; run < 5; run += 1) {
			await seedFiveTables();
			const started = performance.now();
			await truncateAll();
			durations.push(performance.now() - started);
		}

		// Median of five, so one slow commit (checkpoint, noise) cannot fail the run. The bound
		// sits between this reset on a saturated machine (~110 ms) and the old TRUNCATE reset on an
		// idle one (~500 ms): load cannot fail it, a slide back to TRUNCATE still does.
		const median = [...durations].sort((a, b) => a - b)[2];
		expect(median).toBeLessThan(250);

		const counts = await Promise.all([
			db.select({ n: count() }).from(users),
			db.select({ n: count() }).from(families),
			db.select({ n: count() }).from(meals),
			db.select({ n: count() }).from(notifications),
			db.select({ n: count() }).from(groceryItems)
		]);
		expect(counts.map((rows) => rows[0].n)).toEqual([0, 0, 0, 0, 0]);
	});
});
