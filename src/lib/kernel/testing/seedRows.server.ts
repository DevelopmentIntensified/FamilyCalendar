/**
 * Row builders for db tests. Kernel only seeds what EVERY module needs (a
 * user); module-specific builders live in `<module>.fixtures.server.ts`
 * inside the module and reuse `uniqueSuffix()`.
 *
 *   const user = await seedUser(db, { firstName: 'Mia' });
 *   const res = await invoke(handler, { ctx, user });   // legacy + new code see the same person
 *
 * Doc: src/lib/kernel/README.md#testing
 */
import { randomUUID } from 'node:crypto';
import type { Db } from '../db/database.server';
import { users } from '../db/tables.server';

// Local (not exported): K-04 introduces the canonical `UserRow` / `NewUserRow` in the tables files.
type SeededUser = typeof users.$inferSelect;
type SeedUserInput = typeof users.$inferInsert;

/** Short random suffix for unique emails/names across tests. */
export function uniqueSuffix(): string {
	return randomUUID().slice(0, 8);
}

export async function seedUser(
	db: Db,
	overrides: Partial<SeedUserInput> = {}
): Promise<SeededUser> {
	const suffix = uniqueSuffix();
	const [row] = await db
		.insert(users)
		.values({
			firstName: 'Test',
			lastName: `User${suffix}`,
			email: `user-${suffix}@example.test`,
			emailVerified: true,
			roles: [],
			...overrides
		})
		.returning();
	return row;
}
