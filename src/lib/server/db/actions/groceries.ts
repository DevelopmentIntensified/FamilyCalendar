import { db } from '$lib/server/db';
import { groceryItems, groceryStoreMemory, type GroceryItem } from '$lib/server/db/schema';
import { mostFrequentStore, normalizeGroceryName } from '$lib/data/groceries';
import { and, asc, eq, isNull } from 'drizzle-orm';

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
		const existing = (
			await memoryRows(scope, nameKey)
		).find((r) => r.store === label);
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
		.where(
			and(
				eq(groceryItems.userId, scope.userId),
				isNull(groceryItems.familyId),
				...base
			)
		)
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

/** Check off (hides); uncheck revives. Delete keeps Store Memory. */
export async function checkGroceryItem(
	scope: GroceryScope,
	id: string
): Promise<boolean> {
	const updated = await db
		.update(groceryItems)
		.set({ checkedAt: new Date().toISOString() })
		.where(scopeFilter(scope, id))
		.returning({ id: groceryItems.id });
	return updated.length > 0;
}

export async function uncheckGroceryItem(
	scope: GroceryScope,
	id: string
): Promise<boolean> {
	const updated = await db
		.update(groceryItems)
		.set({ checkedAt: null })
		.where(scopeFilter(scope, id))
		.returning({ id: groceryItems.id });
	return updated.length > 0;
}

export async function deleteGroceryItem(
	scope: GroceryScope,
	id: string
): Promise<boolean> {
	const removed = await db
		.delete(groceryItems)
		.where(scopeFilter(scope, id))
		.returning({ id: groceryItems.id });
	return removed.length > 0;
}
