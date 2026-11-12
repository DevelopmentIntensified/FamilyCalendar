/**
 * Groceries tables: the list items, Store Memory (item name -> store) and the
 * per-scope store colours.
 *
 * Definitions moved verbatim out of the legacy `src/lib/server/db/schema.ts`
 * (task K-04); `groceries` owns them
 * (scripts/arch/registry.mjs TABLE_OWNERS). Ids come from the kernel id port
 * (rule R5).
 *
 * Doc: src/lib/kernel/README.md#database
 */
import { index, integer, pgTable, text, timestamp, uniqueIndex } from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';
import { systemIds } from '$lib/kernel/ids/ids';
import { users } from './identity.tables.server';
import { families } from './family.tables.server';

/**
 * Grocery lists (057) — one row per item. Mine = familyId null
 * (owner-only); Family tab = familyId set. checkedAt hides the item
 * (check-off); Store Memory survives check + delete. stores is an
 * ordered list: stores[0] = primary grouping, rest = alternates.
 */
export const groceryItems = pgTable('grocery_items', {
	id: text('id')
		.notNull()
		.primaryKey()
		.$defaultFn(() => systemIds.id()),
	userId: text('user_id')
		.notNull()
		.references(() => users.id, { onDelete: 'cascade' }),
	familyId: text('family_id').references(() => families.id, { onDelete: 'cascade' }),
	name: text('name').notNull(),
	nameKey: text('name_key').notNull(),
	quantity: integer('quantity').notNull().default(1),
	stores: text('stores').array().notNull().default([]),
	checkedAt: timestamp('checked_at', { withTimezone: true, mode: 'string' }),
	createdAt: timestamp('created_at').defaultNow().notNull()
});

export type GroceryItemRow = typeof groceryItems.$inferSelect;
export type NewGroceryItemRow = typeof groceryItems.$inferInsert;

/**
 * Store Memory (057) — family-wide item-name -> store learning.
 * Family items train (familyId set); Mine items train user scope
 * (familyId null + userId). Count = times confirmed; suggestion =
 * most-frequent store for the nameKey in scope.
 */
export const groceryStoreMemory = pgTable('grocery_store_memory', {
	id: text('id')
		.notNull()
		.primaryKey()
		.$defaultFn(() => systemIds.id()),
	userId: text('user_id')
		.notNull()
		.references(() => users.id, { onDelete: 'cascade' }),
	familyId: text('family_id').references(() => families.id, { onDelete: 'cascade' }),
	nameKey: text('name_key').notNull(),
	store: text('store').notNull(),
	count: integer('count').notNull().default(1),
	updatedAt: timestamp('updated_at').defaultNow().notNull()
});

export type GroceryStoreMemoryRow = typeof groceryStoreMemory.$inferSelect;
export type NewGroceryStoreMemoryRow = typeof groceryStoreMemory.$inferInsert;

/**
 * Store colours (096) — a store is free text inside groceryItems.stores, so
 * there is no entity to hang a column on; one row per store NAME is what a
 * colour needs. storeKey is the trim+lowercase key the store group already
 * groups on, so two spellings of one shop are one row and one colour.
 *
 * Dual scope, exactly like Store Memory and the Tag Table: familyId SET is
 * the family's colour, familyId NULL is the viewer's override, and the
 * override wins on read. Postgres unique treats NULLs as distinct, so each
 * scope gets its own partial unique index (cf. itemTags). color is free text
 * in the column and is guarded by the app, which only ever writes a key from
 * the declared STORE_COLOURS palette.
 */
export const groceryStoreColours = pgTable(
	'grocery_store_colours',
	{
		id: text('id')
			.notNull()
			.primaryKey()
			.$defaultFn(() => systemIds.id()),
		userId: text('user_id')
			.notNull()
			.references(() => users.id, { onDelete: 'cascade' }),
		familyId: text('family_id').references(() => families.id, { onDelete: 'cascade' }),
		storeKey: text('store_key').notNull(),
		color: text('color').notNull(),
		updatedAt: timestamp('updated_at').defaultNow().notNull()
	},
	(table) => ({
		// One colour per store per scope, so a flip is a single-statement upsert.
		familyStoreUnique: uniqueIndex('grocery_store_colours_family_store_unique')
			.on(table.familyId, table.storeKey)
			.where(sql`family_id IS NOT NULL`),
		userStoreUnique: uniqueIndex('grocery_store_colours_user_store_unique')
			.on(table.userId, table.storeKey)
			.where(sql`family_id IS NULL`),
		storeKeyIdx: index('grocery_store_colours_store_key_idx').on(table.storeKey)
	})
);

export type GroceryStoreColourRow = typeof groceryStoreColours.$inferSelect;
export type NewGroceryStoreColourRow = typeof groceryStoreColours.$inferInsert;
