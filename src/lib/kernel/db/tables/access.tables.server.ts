/**
 * Access tables: the claim tokens that hand an anonymous Account to a real
 * user.
 *
 * Definition moved verbatim out of the legacy `src/lib/server/db/schema.ts`
 * (task K-04); `access` owns it (scripts/arch/registry.mjs TABLE_OWNERS). Ids
 * come from the kernel id port (rule R5).
 *
 * Doc: src/lib/kernel/README.md#database
 */
import { pgTable, text, timestamp } from 'drizzle-orm/pg-core';
import { systemIds } from '$lib/kernel/ids/ids';
import { users } from './identity.tables.server';

export const claimTokens = pgTable('claim_tokens', {
	id: text('id')
		.notNull()
		.primaryKey()
		.$defaultFn(() => systemIds.id()),
	userId: text('user_id')
		.notNull()
		.references(() => users.id, { onDelete: 'cascade' }),
	tokenHash: text('token_hash').notNull().unique(),
	email: text('email').notNull(),
	expiresAt: timestamp('expires_at', { withTimezone: true, mode: 'date' }).notNull(),
	createdAt: timestamp('created_at').defaultNow().notNull()
});

export type ClaimTokenRow = typeof claimTokens.$inferSelect;
export type NewClaimTokenRow = typeof claimTokens.$inferInsert;
