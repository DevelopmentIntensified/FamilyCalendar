import { db } from '$lib/server/db';
import {
	groceryItems,
	groceryStoreColours,
	groceryStoreMemory,
	type GroceryItem
} from '$lib/server/db/schema';
import {
	mostFrequentStore,
	normalizeGroceryName,
	isStoreColourKey,
	NO_STORE_LABEL
} from '$lib/data/groceries';
import { and, asc, eq, isNull, or, sql } from 'drizzle-orm';

export type GroceryScope = { userId: string; familyId: string | null };

async function memoryRows(scope: GroceryScope, nameKey: string) {
	if (scope.familyId) {
		return await db
			.select()
			.from(groceryStoreMemory)
			.where(
				and(
					eq(groceryStoreMemory.familyId, scope.familyId),
					eq(groceryStoreMemory.nameKey, nameKey)
				)
			);
	}
	return await db
		.select()
		.from(groceryStoreMemory)
		.where(
			and(
				isNull(groceryStoreMemory.familyId),
				eq(groceryStoreMemory.userId, scope.userId),
				eq(groceryStoreMemory.nameKey, nameKey)
			)
		);
}

/** Most-frequent store for a normalized name in scope; null when unknown. */
export async function suggestGroceryStore(
	scope: GroceryScope,
	name: string
): Promise<string | null> {
	const nameKey = normalizeGroceryName(name);
	if (!nameKey) return null;
	return mostFrequentStore(await memoryRows(scope, nameKey));
}

async function trainMemory(scope: GroceryScope, nameKey: string, stores: string[]) {
	for (const store of stores) {
		const label = store.trim();
		if (!label) continue;
		const existing = (await memoryRows(scope, nameKey)).find(
			(r) => r.store.toLowerCase() === label.toLowerCase()
		);
		if (existing) {
			await db
				.update(groceryStoreMemory)
				.set({ count: existing.count + 1, updatedAt: new Date() })
				.where(eq(groceryStoreMemory.id, existing.id));
		} else {
			await db.insert(groceryStoreMemory).values({
				userId: scope.userId,
				familyId: scope.familyId,
				nameKey,
				store: label,
				count: 1
			});
		}
	}
}

function cleanStores(stores: string[]): string[] {
	const seen = new Set<string>();
	const out: string[] = [];
	for (const s of stores) {
		const label = s.trim();
		if (!label || seen.has(label.toLowerCase())) continue;
		seen.add(label.toLowerCase());
		out.push(label);
	}
	return out;
}

/** Insert an item; empty stores auto-fill from Store Memory. Null on blank name. */
export async function addGroceryItem(data: {
	scope: GroceryScope;
	name: string;
	quantity?: number;
	stores?: string[];
}): Promise<GroceryItem | null> {
	const name = data.name.trim();
	if (!name) return null;
	const nameKey = normalizeGroceryName(name);
	const quantity = Math.max(1, Math.floor(data.quantity ?? 1));
	let stores = cleanStores(data.stores ?? []);
	if (stores.length === 0) {
		const suggested = await suggestGroceryStore(data.scope, name);
		if (suggested) stores = [suggested];
	} else {
		await trainMemory(data.scope, nameKey, stores);
	}
	const [created] = await db
		.insert(groceryItems)
		.values({
			userId: data.scope.userId,
			familyId: data.scope.familyId,
			name,
			nameKey,
			quantity,
			stores
		})
		.returning();
	return created;
}

/** Open (unchecked) items, oldest first. */
export async function getOpenGroceries(scope: GroceryScope): Promise<GroceryItem[]> {
	const base = [isNull(groceryItems.checkedAt)];
	if (scope.familyId) {
		return await db
			.select()
			.from(groceryItems)
			.where(and(eq(groceryItems.familyId, scope.familyId), ...base))
			.orderBy(asc(groceryItems.createdAt));
	}
	return await db
		.select()
		.from(groceryItems)
		.where(and(eq(groceryItems.userId, scope.userId), isNull(groceryItems.familyId), ...base))
		.orderBy(asc(groceryItems.createdAt));
}

function scopeFilter(scope: GroceryScope, id: string) {
	if (scope.familyId) {
		return and(eq(groceryItems.id, id), eq(groceryItems.familyId, scope.familyId));
	}
	return and(
		eq(groceryItems.id, id),
		eq(groceryItems.userId, scope.userId),
		isNull(groceryItems.familyId)
	);
}

/** Replace an item's stores; trains Store Memory. */
export async function setGroceryStores(
	scope: GroceryScope,
	id: string,
	stores: string[]
): Promise<boolean> {
	const cleaned = cleanStores(stores);
	const updated = await db
		.update(groceryItems)
		.set({ stores: cleaned })
		.where(scopeFilter(scope, id))
		.returning({ id: groceryItems.id, nameKey: groceryItems.nameKey });
	if (updated.length === 0) return false;
	await trainMemory(scope, updated[0].nameKey, cleaned);
	return true;
}

/** Move an item between Mine and Family. Store Memory stays where trained. */
export async function moveGroceryItem(
	scope: GroceryScope,
	id: string,
	target: GroceryScope
): Promise<boolean> {
	const updated = await db
		.update(groceryItems)
		.set({ familyId: target.familyId })
		.where(scopeFilter(scope, id))
		.returning({ id: groceryItems.id });
	return updated.length > 0;
}

/** Check off (hides); uncheck revives. Delete keeps Store Memory. */
export async function checkGroceryItem(scope: GroceryScope, id: string): Promise<boolean> {
	const updated = await db
		.update(groceryItems)
		.set({ checkedAt: new Date().toISOString() })
		.where(scopeFilter(scope, id))
		.returning({ id: groceryItems.id });
	return updated.length > 0;
}

export async function uncheckGroceryItem(scope: GroceryScope, id: string): Promise<boolean> {
	const updated = await db
		.update(groceryItems)
		.set({ checkedAt: null })
		.where(scopeFilter(scope, id))
		.returning({ id: groceryItems.id });
	return updated.length > 0;
}

export async function deleteGroceryItem(scope: GroceryScope, id: string): Promise<boolean> {
	const removed = await db
		.delete(groceryItems)
		.where(scopeFilter(scope, id))
		.returning({ id: groceryItems.id });
	return removed.length > 0;
}

/* ── Store colours (096) ────────────────────────────────────────────────────
 *
 * Dual scope, the shape Store Memory above already uses: a familyId-NULL row
 * is the viewer's override and wins on read, a familyId-set row is the
 * family's. `colourFor` (client-safe, in $lib/data/groceries) owns the
 * three-tier resolution; this module only reads and writes rows.
 */

export type StoreColourScope = 'personal' | 'family';

/** Every colour row the viewer can resolve against, both scopes. */
export async function getStoreColours(viewer: GroceryScope) {
	const rows = viewer.familyId
		? await db
				.select()
				.from(groceryStoreColours)
				.where(
					or(
						eq(groceryStoreColours.userId, viewer.userId),
						eq(groceryStoreColours.familyId, viewer.familyId)
					)
				)
		: await db
				.select()
				.from(groceryStoreColours)
				.where(
					and(eq(groceryStoreColours.userId, viewer.userId), isNull(groceryStoreColours.familyId))
				);
	return rows.map((r) => ({
		storeKey: r.storeKey,
		color: r.color,
		userId: r.userId,
		familyId: r.familyId
	}));
}

/**
 * Set (or clear, with color: 'auto') one store's colour in one scope.
 * Returns false — writing nothing — for a colour outside the declared
 * palette, a blank store, the no-store group, or the family scope with no
 * family. The column is free text, so this guard is the only thing standing
 * between a crafted request and an unrenderable colour.
 */
export async function setStoreColour(
	viewer: GroceryScope,
	data: { scope: StoreColourScope; store: string; color: string }
): Promise<boolean> {
	const label = data.store.trim();
	// "Any store" is the absence of a store. It is never a coloured thing.
	if (!label || label === NO_STORE_LABEL) return false;
	const familyId = data.scope === 'family' ? viewer.familyId : null;
	if (data.scope === 'family' && !familyId) return false;
	const key = normalizeGroceryName(label);
	const scopeWhere =
		familyId === null
			? and(eq(groceryStoreColours.userId, viewer.userId), isNull(groceryStoreColours.familyId))
			: and(eq(groceryStoreColours.familyId, familyId), eq(groceryStoreColours.storeKey, key));

	if (data.color === 'auto') {
		await db.delete(groceryStoreColours).where(scopeWhere);
		return true;
	}
	if (!isStoreColourKey(data.color)) return false;
	const values = {
		userId: viewer.userId,
		familyId,
		storeKey: key,
		color: data.color
	};
	// Postgres unique treats NULLs as distinct, so a personal upsert has to
	// target the partial index explicitly or it can never conflict.
	if (familyId === null) {
		await db
			.insert(groceryStoreColours)
			.values(values)
			.onConflictDoUpdate({
				target: [groceryStoreColours.userId, groceryStoreColours.storeKey],
				targetWhere: sql`family_id IS NULL`,
				set: { color: data.color, updatedAt: new Date() }
			});
	} else {
		await db
			.insert(groceryStoreColours)
			.values(values)
			.onConflictDoUpdate({
				target: [groceryStoreColours.familyId, groceryStoreColours.storeKey],
				set: { color: data.color, updatedAt: new Date() }
			});
	}
	return true;
}
