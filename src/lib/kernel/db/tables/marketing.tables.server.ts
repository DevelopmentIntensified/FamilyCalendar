/**
 * Marketing tables: the pre-launch waitlist (one row per email).
 *
 * Definition moved verbatim out of the legacy `src/lib/server/db/schema.ts`
 * (task K-04); `marketing` owns it (scripts/arch/registry.mjs TABLE_OWNERS).
 * Ids come from the kernel id port (rule R5).
 *
 * Doc: src/lib/kernel/README.md#database
 */
import { jsonb, pgTable, text, timestamp, uniqueIndex } from 'drizzle-orm/pg-core';
import { systemIds } from '../../ids/ids';

export const waitlist = pgTable(
	'waitlist',
	{
		id: text('id')
			.notNull()
			.primaryKey()
			.$defaultFn(() => systemIds.id()),
		email: text('email').notNull(),
		firstName: text('firstName'),
		lastName: text('lastName'),
		region: text('region'),
		consentedAt: timestamp('consentedAt', { mode: 'date' }),
		preferences: jsonb('preferences').$type<{ marketing: boolean; updates: boolean }>(),
		optedInAt: timestamp('optedInAt', { mode: 'date' }),
		status: text('status').default('pending').notNull(),
		createdAt: timestamp('createdAt', { mode: 'date' }).defaultNow().notNull()
	},
	(table) => ({
		emailKey: uniqueIndex('waitlist_email_key').on(table.email)
	})
);

export type WaitlistEntryRow = typeof waitlist.$inferSelect;
export type NewWaitlistEntryRow = typeof waitlist.$inferInsert;
