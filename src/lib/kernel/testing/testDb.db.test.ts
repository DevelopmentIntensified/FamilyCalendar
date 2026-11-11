import { count, eq, sql } from 'drizzle-orm';
import { beforeEach, describe, expect, it } from 'vitest';
import { withTx } from '../db/database.server';
import { users } from '../db/tables.server';
import { seedUser } from './seedRows.server';
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
});
