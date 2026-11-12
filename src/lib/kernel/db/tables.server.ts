/**
 * THE import path for Drizzle table objects in new code (arch rule R3):
 *
 *   import { tasks, taskTags } from '$lib/kernel/db/tables.server';
 *
 * Only `*.repo.server.ts` files (and kernel/testing) may import it, and a repo
 * may touch only the tables its module owns (owner list:
 * scripts/arch/registry.mjs TABLE_OWNERS).
 *
 * A barrel: one `export *` per owning module, in TABLE_OWNERS order. The
 * definitions live in ./tables/<module>.tables.server.ts (task K-04); foreign
 * keys import across those files through lazy callbacks, so the cycles are
 * harmless. Importers do not change.
 *
 * Doc: src/lib/kernel/README.md#database
 */
export * from './tables/identity.tables.server';
export * from './tables/billing.tables.server';
export * from './tables/alerts.tables.server';
export * from './tables/family.tables.server';
export * from './tables/dashboardModules.tables.server';
export * from './tables/bills.tables.server';
export * from './tables/calendar.tables.server';
export * from './tables/tasks.tables.server';
export * from './tables/groceries.tables.server';
export * from './tables/sponsored.tables.server';
export * from './tables/meals.tables.server';
export * from './tables/feedback.tables.server';
export * from './tables/access.tables.server';
export * from './tables/marketing.tables.server';
