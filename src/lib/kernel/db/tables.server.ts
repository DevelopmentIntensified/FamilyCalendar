/**
 * THE import path for Drizzle table objects in new code (arch rule R3):
 *
 *   import { tasks, taskTags } from '$lib/kernel/db/tables.server';
 *
 * Only `*.repo.server.ts` files (and kernel/testing) may import it, and a repo
 * may touch only the tables its module owns (owner list:
 * scripts/arch/registry.mjs `tables`).
 *
 * Today this re-exports the legacy schema file unchanged. Task K-04 in
 * docs/rewrite/LEDGER.md moves the definitions into ./tables/<module>.tables.ts
 * files and turns this file into the barrel; importers do not change.
 *
 * Doc: src/lib/kernel/README.md#database
 */
export * from '$lib/server/db/schema';
