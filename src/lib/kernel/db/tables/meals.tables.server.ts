/**
 * Meals tables: one row per planned meal (date + kind + label) on the family
 * dashboard.
 *
 * Definition moved verbatim out of the legacy `src/lib/server/db/schema.ts`
 * (task K-04); `meals` owns it (scripts/arch/registry.mjs TABLE_OWNERS). Ids
 * come from the kernel id port (rule R5).
 *
 * Doc: src/lib/kernel/README.md#database
 */
import { pgTable, text, timestamp } from 'drizzle-orm/pg-core';
import { systemIds } from '../../ids/ids';
import { users } from './identity.tables.server';
import { families } from './family.tables.server';

export const meals = pgTable('meals', {
	id: text('id')
		.notNull()
		.primaryKey()
		.$defaultFn(() => systemIds.id()),
	familyId: text('familyId')
		.notNull()
		.references(() => families.id, { onDelete: 'cascade' }),
	// 'YYYY-MM-DD' — interpreted in the viewer's zone, matching the
	// dashboard's day boundary (decision 12).
	date: text('date').notNull(),
	// 'breakfast' | 'lunch' | 'dinner' | 'snack'
	kind: text('kind').notNull(),
	label: text('label').notNull(),
	createdBy: text('createdBy').references(() => users.id, { onDelete: 'cascade' }),
	createdAt: timestamp('createdAt', { withTimezone: true, mode: 'string' }).defaultNow().notNull()
});

export type MealRow = typeof meals.$inferSelect;
export type NewMealRow = typeof meals.$inferInsert;
