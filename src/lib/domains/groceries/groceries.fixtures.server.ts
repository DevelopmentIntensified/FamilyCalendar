/**
 * Row builders for groceries' db tests: the family, item, Store Memory and
 * Store Colour rows the repo and service tests need, in one home (so a schema
 * change updates one file). Kernel seeds only users; a test never inserts one
 * of this module's rows directly.
 *
 * Every timestamp has a fixed default, so ordering is decided by what a test
 * passes, never by the database clock. A test that orders rows passes its own
 * `createdAt`.
 *
 * Doc: ./README.md#how-to-test
 */
import type { Db } from '$lib/kernel/db/database.server';
import {
	families,
	groceryItems,
	groceryStoreColours,
	groceryStoreMemory,
	type GroceryItemRow,
	type GroceryStoreColourRow,
	type GroceryStoreMemoryRow,
	type NewGroceryItemRow,
	type NewGroceryStoreColourRow,
	type NewGroceryStoreMemoryRow
} from '$lib/kernel/db/tables.server';
import { normalizeGroceryName } from './groceries.items.rules';

/** The instant seeded rows carry unless a test says otherwise. */
const SEEDED_AT = new Date('2026-01-01T00:00:00Z');

/** One family, named. Membership is the `family` domain's, not seeded here. */
export async function seedGroceryFamily(db: Db, name = 'Home') {
	const [row] = await db.insert(families).values({ name }).returning();
	if (!row) throw new Error('seedGroceryFamily: insert returned no row');
	return row;
}

/** One open item; `nameKey` follows `name` unless given. Mine unless `familyId` is set. */
export async function seedGroceryItem(
	db: Db,
	overrides: Partial<NewGroceryItemRow> & { userId: string }
): Promise<GroceryItemRow> {
	const name = overrides.name ?? 'Milk';
	const [row] = await db
		.insert(groceryItems)
		.values({
			name,
			nameKey: normalizeGroceryName(name),
			createdAt: SEEDED_AT,
			...overrides
		})
		.returning();
	if (!row) throw new Error('seedGroceryItem: insert returned no row');
	return row;
}

/** One Store Memory row: `count` 1 for "milk" -> "Aldi" unless given. Mine unless `familyId` is set. */
export async function seedGroceryMemory(
	db: Db,
	overrides: Partial<NewGroceryStoreMemoryRow> & { userId: string }
): Promise<GroceryStoreMemoryRow> {
	const [row] = await db
		.insert(groceryStoreMemory)
		.values({ nameKey: 'milk', store: 'Aldi', updatedAt: SEEDED_AT, ...overrides })
		.returning();
	if (!row) throw new Error('seedGroceryMemory: insert returned no row');
	return row;
}

/** One Store Colour row: "aldi" -> "sky". Personal unless `familyId` is set. */
export async function seedGroceryColour(
	db: Db,
	overrides: Partial<NewGroceryStoreColourRow> & { userId: string }
): Promise<GroceryStoreColourRow> {
	const [row] = await db
		.insert(groceryStoreColours)
		.values({ storeKey: 'aldi', color: 'sky', updatedAt: SEEDED_AT, ...overrides })
		.returning();
	if (!row) throw new Error('seedGroceryColour: insert returned no row');
	return row;
}
