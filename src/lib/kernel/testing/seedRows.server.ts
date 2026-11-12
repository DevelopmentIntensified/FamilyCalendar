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
import { users, type NewUserRow, type UserRow } from '../db/tables.server';

/** Short random suffix for unique emails/names across tests. */
export function uniqueSuffix(): string {
	return randomUUID().slice(0, 8);
}

export async function seedUser(db: Db, overrides: Partial<NewUserRow> = {}): Promise<UserRow> {
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
