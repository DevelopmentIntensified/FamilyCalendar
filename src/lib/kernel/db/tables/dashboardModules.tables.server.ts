/**
 * Dashboard-module tables: the family-level master switches. A row exists only
 * while a module is switched OFF — absence means the default (enabled).
 *
 * Definition moved verbatim out of the legacy `src/lib/server/db/schema.ts`
 * (task K-04); `dashboardModules` owns it
 * (scripts/arch/registry.mjs TABLE_OWNERS). Ids come from the kernel id port,
 * "now" from the kernel clock (rule R5).
 *
 * Doc: src/lib/kernel/README.md#database
 */
import { boolean, pgTable, text, timestamp, unique } from 'drizzle-orm/pg-core';
import { systemIds } from '$lib/kernel/ids/ids';
import { systemClock } from '$lib/kernel/time/clock';
import { families } from './family.tables.server';

// Family-level master switches for Day Dashboard modules. A row exists only
// while a module is switched OFF — absence means the default (enabled).
export const dashboardModuleSwitches = pgTable(
	'dashboardModuleSwitches',
	{
		id: text('id')
			.notNull()
			.primaryKey()
			.$defaultFn(() => systemIds.id()),
		familyId: text('familyId')
			.notNull()
			.references(() => families.id, { onDelete: 'cascade' }),
		module: text('module').notNull(),
		enabled: boolean('enabled').default(true).notNull(),
		createdAt: timestamp('createdAt', { mode: 'date' }).defaultNow().notNull(),
		updatedAt: timestamp('updatedAt', { mode: 'date' })
			.defaultNow()
			.$onUpdate(() => systemClock.now())
			.notNull()
	},
	(table) => ({
		familyModuleUnique: unique('dashboardModuleSwitches_family_module_unique').on(
			table.familyId,
			table.module
		)
	})
);

export type DashboardModuleSwitchRow = typeof dashboardModuleSwitches.$inferSelect;
export type NewDashboardModuleSwitchRow = typeof dashboardModuleSwitches.$inferInsert;
