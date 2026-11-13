/**
 * groceries repo: every query over `groceryItems`, `groceryStoreMemory` and
 * `groceryStoreColours`.
 *
 * Each function takes `db: Db` first and contains no authorization and no
 * business rule (quick-add parsing, store cleaning, the suggestion pick and
 * the palette guard live in the rules; who may act on which scope is the
 * service's). It reads only this module's tables (rule R3); there is no
 * foreign read.
 *
 * Scope is a parameter, never a lookup: `{ userId, familyId: null }` is the
 * person's own Mine rows, `{ userId, familyId }` the family's. A row outside
 * the scope is indistinguishable from a missing one, so an item write that
 * matches nothing is `null` (the 404 the wire answers).
 *
 * Nothing here reads the process clock (rule R5): every write takes the
 * caller's `now` and stamps `createdAt` / `checkedAt` / `updatedAt` with it.
 * Store Memory and the colour read have no `ORDER BY` on purpose: "ties go to
 * the first row seen" and the colour-row order are the database's row order
 * today, and the goldens pin it (sheet Notes, "Two reads rely on physical row
 * order").
 *
 * Doc: ./README.md#invariants
 */
import { and, asc, eq, isNull, or, sql } from 'drizzle-orm';
import type { Db } from '$lib/kernel/db/database.server';
import {
	groceryItems,
	groceryStoreColours,
	groceryStoreMemory,
	type GroceryItemRow,
	type GroceryStoreMemoryRow
} from '$lib/kernel/db/tables.server';
import type { StoreColourRow } from './groceries.contract';
import type { GroceryScope } from './groceries.scope.rules';

/** The rows of one scope: the family's by `familyId`, Mine by `userId` AND no family. */
function itemsInScope(scope: GroceryScope) {
	return scope.familyId
		? eq(groceryItems.familyId, scope.familyId)
		: and(eq(groceryItems.userId, scope.userId), isNull(groceryItems.familyId));
}

/** One item of one scope. Outside the scope it is simply not there. */
function itemInScope(scope: GroceryScope, id: string) {
	return and(eq(groceryItems.id, id), itemsInScope(scope));
}

/** The Store Memory rows of one scope: family-wide, or per-user for Mine. */
function memoryInScope(scope: GroceryScope) {
	return scope.familyId
		? eq(groceryStoreMemory.familyId, scope.familyId)
		: and(eq(groceryStoreMemory.userId, scope.userId), isNull(groceryStoreMemory.familyId));
}

// --- Items ------------------------------------------------------------------

/** Open items (`checkedAt` NULL) of one scope, oldest first. */
export async function listOpenGroceryItems(db: Db, scope: GroceryScope): Promise<GroceryItemRow[]> {
	return await db
		.select()
		.from(groceryItems)
		.where(and(itemsInScope(scope), isNull(groceryItems.checkedAt)))
		.orderBy(asc(groceryItems.createdAt));
}

/** The values of a new item. `nameKey` and `stores` arrive already normalized. */
export type GroceryItemWrite = {
	readonly scope: GroceryScope;
	readonly name: string;
	readonly nameKey: string;
	readonly quantity: number;
	readonly stores: string[];
	/** Becomes `createdAt`. */
	readonly now: Date;
};

/** Store one item in the scope and return the row as written. */
export async function insertGroceryItem(db: Db, item: GroceryItemWrite): Promise<GroceryItemRow> {
	const [row] = await db
		.insert(groceryItems)
		.values({
			userId: item.scope.userId,
			familyId: item.scope.familyId,
			name: item.name,
			nameKey: item.nameKey,
			quantity: item.quantity,
			stores: item.stores,
			createdAt: item.now
		})
		.returning();
	if (!row) throw new Error('insertGroceryItem: insert returned no row');
	return row;
}

/** Replace an item's stores (an empty list clears them). Null when the scope has no such item. */
export async function setGroceryItemStores(
	db: Db,
	scope: GroceryScope,
	id: string,
	stores: string[]
): Promise<GroceryItemRow | null> {
	const [row] = await db
		.update(groceryItems)
		.set({ stores })
		.where(itemInScope(scope, id))
		.returning();
	return row ?? null;
}

/**
 * Re-own an item to the target scope: `userId` becomes the target's user (the
 * mover), `familyId` the target's family or NULL. Null when the source scope
 * has no such item.
 */
export async function moveGroceryItem(
	db: Db,
	scope: GroceryScope,
	id: string,
	target: GroceryScope
): Promise<GroceryItemRow | null> {
	const [row] = await db
		.update(groceryItems)
		.set({ userId: target.userId, familyId: target.familyId })
		.where(itemInScope(scope, id))
		.returning();
	return row ?? null;
}

/** Check an item off: `checkedAt` becomes `now`, which hides it. Null when out of scope. */
export async function checkGroceryItem(
	db: Db,
	scope: GroceryScope,
	id: string,
	now: Date
): Promise<GroceryItemRow | null> {
	const [row] = await db
		.update(groceryItems)
		.set({ checkedAt: now.toISOString() })
		.where(itemInScope(scope, id))
		.returning();
	return row ?? null;
}

/** Put a checked-off item back on the list. Null when out of scope. */
export async function uncheckGroceryItem(
	db: Db,
	scope: GroceryScope,
	id: string
): Promise<GroceryItemRow | null> {
	const [row] = await db
		.update(groceryItems)
		.set({ checkedAt: null })
		.where(itemInScope(scope, id))
		.returning();
	return row ?? null;
}

/** Delete one item. Store Memory is untouched. Null when out of scope. */
export async function removeGroceryItem(
	db: Db,
	scope: GroceryScope,
	id: string
): Promise<GroceryItemRow | null> {
	const [row] = await db.delete(groceryItems).where(itemInScope(scope, id)).returning();
	return row ?? null;
}

// --- Store Memory -----------------------------------------------------------

/** What this scope has learned for one item name, in the database's row order. */
export async function listGroceryMemoryRows(
	db: Db,
	scope: GroceryScope,
	nameKey: string
): Promise<GroceryStoreMemoryRow[]> {
	return await db
		.select()
		.from(groceryStoreMemory)
		.where(and(memoryInScope(scope), eq(groceryStoreMemory.nameKey, nameKey)));
}

/** Confirm a remembered store once more: `count` + 1, `updatedAt` = `now`. */
export async function incrementGroceryMemory(db: Db, id: string, now: Date): Promise<void> {
	await db
		.update(groceryStoreMemory)
		.set({ count: sql`${groceryStoreMemory.count} + 1`, updatedAt: now })
		.where(eq(groceryStoreMemory.id, id));
}

/** The values of a new Store Memory row; `now` becomes `updatedAt`. */
export type GroceryMemoryWrite = {
	readonly scope: GroceryScope;
	readonly nameKey: string;
	readonly store: string;
	readonly now: Date;
};

/** Remember a store for an item name in a scope, confirmed once (`count` 1). */
export async function insertGroceryMemory(db: Db, memory: GroceryMemoryWrite): Promise<void> {
	await db.insert(groceryStoreMemory).values({
		userId: memory.scope.userId,
		familyId: memory.scope.familyId,
		nameKey: memory.nameKey,
		store: memory.store,
		count: 1,
		updatedAt: memory.now
	});
}

// --- Store Colours ----------------------------------------------------------

/**
 * Every colour row the viewer can resolve against. With a family: every row
 * the viewer wrote (personal ones, and the family rows they wrote — the
 * `userId` is the writer, Q-035) plus every row of the viewer's family. With
 * none: only the viewer's personal rows. Rows written by someone else outside
 * the viewer's family are never returned.
 */
export async function listGroceryColourRows(
	db: Db,
	viewer: GroceryScope
): Promise<StoreColourRow[]> {
	const visible = viewer.familyId
		? or(
				eq(groceryStoreColours.userId, viewer.userId),
				eq(groceryStoreColours.familyId, viewer.familyId)
			)
		: and(eq(groceryStoreColours.userId, viewer.userId), isNull(groceryStoreColours.familyId));
	return await db
		.select({
			storeKey: groceryStoreColours.storeKey,
			color: groceryStoreColours.color,
			userId: groceryStoreColours.userId,
			familyId: groceryStoreColours.familyId
		})
		.from(groceryStoreColours)
		.where(visible);
}

/** One colour to store: `scope.familyId` NULL is the viewer's personal override. */
export type GroceryColourWrite = {
	readonly scope: GroceryScope;
	/** The trim + lowercase store key. */
	readonly storeKey: string;
	/** A declared swatch key; the palette guard is the caller's. */
	readonly color: string;
	readonly now: Date;
};

/**
 * Set one store's colour in one scope: one row per (family, storeKey) and one
 * per (user, storeKey) where the family is NULL, each a partial unique index,
 * so each upsert names its index's predicate or Postgres cannot infer it.
 * The row's `userId` is its writer (Q-035); a conflict only re-colours and
 * re-stamps, it never changes the writer.
 */
export async function upsertGroceryColour(db: Db, colour: GroceryColourWrite): Promise<void> {
	const values = {
		userId: colour.scope.userId,
		familyId: colour.scope.familyId,
		storeKey: colour.storeKey,
		color: colour.color,
		updatedAt: colour.now
	};
	const update = { color: colour.color, updatedAt: colour.now };
	if (colour.scope.familyId) {
		await db.insert(groceryStoreColours).values(values).onConflictDoUpdate({
			target: [groceryStoreColours.familyId, groceryStoreColours.storeKey],
			targetWhere: sql`family_id IS NOT NULL`,
			set: update
		});
		return;
	}
	await db.insert(groceryStoreColours).values(values).onConflictDoUpdate({
		target: [groceryStoreColours.userId, groceryStoreColours.storeKey],
		targetWhere: sql`family_id IS NULL`,
		set: update
	});
}

/**
 * Clear one store's colour in one scope (the name default returns). Only that
 * store's row in that scope goes. Returns the number of rows removed.
 */
export async function deleteGroceryColour(
	db: Db,
	scope: GroceryScope,
	storeKey: string
): Promise<number> {
	const inScope = scope.familyId
		? eq(groceryStoreColours.familyId, scope.familyId)
		: and(eq(groceryStoreColours.userId, scope.userId), isNull(groceryStoreColours.familyId));
	const deleted = await db
		.delete(groceryStoreColours)
		.where(and(inScope, eq(groceryStoreColours.storeKey, storeKey)))
		.returning({ id: groceryStoreColours.id });
	return deleted.length;
}
