/**
 * The groceries repo against real Postgres: every query that filters, orders,
 * moves between scopes, upserts or deletes. Each test runs in `rollbackTest`,
 * so the rows it seeds vanish afterwards. Writes are given their `now`, so the
 * tests assert the stamped timestamps instead of trusting a clock.
 *
 * Scope is the thing most queries tell apart, so most tests seed the rows of
 * a second person and a second family and prove they never show up.
 *
 * Doc: ./README.md#how-to-test
 */
import { eq, sql } from 'drizzle-orm';
import { describe, expect } from 'vitest';
import type { Db } from '$lib/kernel/db/database.server';
import {
	groceryItems,
	groceryStoreColours,
	groceryStoreMemory
} from '$lib/kernel/db/tables.server';
import { seedUser } from '$lib/kernel/testing/seedRows.server';
import { rollbackTest } from '$lib/kernel/testing/testDb.server';
import {
	seedGroceryColour,
	seedGroceryFamily,
	seedGroceryItem,
	seedGroceryMemory
} from './groceries.fixtures.server';
import {
	checkGroceryItem,
	deleteGroceryColour,
	incrementGroceryMemory,
	insertGroceryItem,
	insertGroceryMemory,
	listGroceryColourRows,
	listGroceryMemoryRows,
	listOpenGroceryItems,
	moveGroceryItem,
	removeGroceryItem,
	setGroceryItemStores,
	uncheckGroceryItem,
	upsertGroceryColour
} from './groceries.repo.server';

/** Two people and two families: `mine`/`family` act as the first person, `others`/`otherFamily` as the second. */
async function seedHousehold(db: Db) {
	const user = await seedUser(db);
	const other = await seedUser(db);
	const familyId = (await seedGroceryFamily(db, 'Mine')).id;
	const otherFamilyId = (await seedGroceryFamily(db, 'Other')).id;
	return {
		user,
		other,
		familyId,
		otherFamilyId,
		mine: { userId: user.id, familyId: null },
		family: { userId: user.id, familyId },
		others: { userId: other.id, familyId: null },
		otherFamily: { userId: other.id, familyId: otherFamilyId }
	};
}

/** The stored `checkedAt` as epoch milliseconds, whatever text the driver hands back. */
async function checkedAtMillis(db: Db, id: string): Promise<number | null> {
	const [row] = await db
		.select({ at: sql<string | null>`extract(epoch from ${groceryItems.checkedAt}) * 1000` })
		.from(groceryItems)
		.where(eq(groceryItems.id, id));
	return !row || row.at === null ? null : Number(row.at);
}

describe('listOpenGroceryItems', () => {
	rollbackTest('Mine reads the person’s own open items, oldest first', async (db) => {
		const h = await seedHousehold(db);
		await seedGroceryItem(db, {
			userId: h.user.id,
			name: 'Newer',
			createdAt: new Date('2026-01-02T00:00:00Z')
		});
		await seedGroceryItem(db, {
			userId: h.user.id,
			name: 'Older',
			createdAt: new Date('2026-01-01T00:00:00Z')
		});
		// Everything the Mine list must not show.
		await seedGroceryItem(db, {
			userId: h.user.id,
			name: 'Checked off',
			checkedAt: '2026-01-03T00:00:00Z'
		});
		await seedGroceryItem(db, { userId: h.user.id, familyId: h.familyId, name: 'Own family item' });
		await seedGroceryItem(db, { userId: h.other.id, name: 'Their Mine item' });

		const items = await listOpenGroceryItems(db, h.mine);
		expect(items.map((item) => item.name)).toEqual(['Older', 'Newer']);
		expect(items.every((item) => item.familyId === null && item.userId === h.user.id)).toBe(true);
	});

	rollbackTest('Family reads the family’s open items from every member, oldest first', async (db) => {
		const h = await seedHousehold(db);
		await seedGroceryItem(db, {
			userId: h.other.id,
			familyId: h.familyId,
			name: 'Added by a member',
			createdAt: new Date('2026-01-02T00:00:00Z')
		});
		await seedGroceryItem(db, {
			userId: h.user.id,
			familyId: h.familyId,
			name: 'Added by me',
			createdAt: new Date('2026-01-01T00:00:00Z')
		});
		await seedGroceryItem(db, {
			userId: h.user.id,
			familyId: h.familyId,
			name: 'Checked off',
			checkedAt: '2026-01-03T00:00:00Z'
		});
		await seedGroceryItem(db, { userId: h.user.id, name: 'My Mine item' });
		await seedGroceryItem(db, {
			userId: h.other.id,
			familyId: h.otherFamilyId,
			name: 'Another family'
		});

		const items = await listOpenGroceryItems(db, h.family);
		expect(items.map((item) => item.name)).toEqual(['Added by me', 'Added by a member']);
	});

	rollbackTest('is empty for a scope with no items', async (db) => {
		const h = await seedHousehold(db);
		expect(await listOpenGroceryItems(db, h.mine)).toEqual([]);
		expect(await listOpenGroceryItems(db, h.family)).toEqual([]);
	});
});

describe('insertGroceryItem', () => {
	const now = new Date('2026-04-01T12:00:00Z');

	rollbackTest('stores a Mine item and stamps createdAt with now', async (db) => {
		const h = await seedHousehold(db);
		const row = await insertGroceryItem(db, {
			scope: h.mine,
			name: 'Oat Milk',
			nameKey: 'oat milk',
			quantity: 3,
			stores: ['Aldi', 'Lidl'],
			now
		});
		expect({
			userId: row.userId,
			familyId: row.familyId,
			name: row.name,
			nameKey: row.nameKey,
			quantity: row.quantity,
			stores: row.stores,
			checkedAt: row.checkedAt
		}).toEqual({
			userId: h.user.id,
			familyId: null,
			name: 'Oat Milk',
			nameKey: 'oat milk',
			quantity: 3,
			stores: ['Aldi', 'Lidl'],
			checkedAt: null
		});
		expect(row.createdAt.getTime()).toBe(now.getTime());
		const [stored] = await db.select().from(groceryItems).where(eq(groceryItems.id, row.id));
		expect(stored.stores).toEqual(['Aldi', 'Lidl']);
		expect(stored.createdAt.getTime()).toBe(now.getTime());
	});

	rollbackTest('stores a Family item under the family and the adder', async (db) => {
		const h = await seedHousehold(db);
		const row = await insertGroceryItem(db, {
			scope: h.family,
			name: 'Milk',
			nameKey: 'milk',
			quantity: 1,
			stores: [],
			now
		});
		expect(row.familyId).toBe(h.familyId);
		expect(row.userId).toBe(h.user.id);
		expect(row.stores).toEqual([]);
	});

	rollbackTest('keeps the store order, because [0] is the primary store', async (db) => {
		const h = await seedHousehold(db);
		const row = await insertGroceryItem(db, {
			scope: h.mine,
			name: 'Milk',
			nameKey: 'milk',
			quantity: 1,
			stores: ['Zed', 'Aldi', 'Mid'],
			now
		});
		expect(row.stores).toEqual(['Zed', 'Aldi', 'Mid']);
	});
});

describe('setGroceryItemStores', () => {
	rollbackTest('replaces the stores and answers the row it changed', async (db) => {
		const h = await seedHousehold(db);
		const item = await seedGroceryItem(db, { userId: h.user.id, stores: ['Aldi'] });
		const row = await setGroceryItemStores(db, h.mine, item.id, ['Lidl', 'Coop']);
		expect(row?.id).toBe(item.id);
		expect(row?.nameKey).toBe('milk');
		expect(row?.stores).toEqual(['Lidl', 'Coop']);
		const [stored] = await db.select().from(groceryItems).where(eq(groceryItems.id, item.id));
		expect(stored.stores).toEqual(['Lidl', 'Coop']);
	});

	rollbackTest('an empty list clears every store on the row (Q-037)', async (db) => {
		const h = await seedHousehold(db);
		const item = await seedGroceryItem(db, { userId: h.user.id, stores: ['Aldi', 'Lidl'] });
		const row = await setGroceryItemStores(db, h.mine, item.id, []);
		expect(row?.stores).toEqual([]);
	});

	rollbackTest('edits a Family item added by another member', async (db) => {
		const h = await seedHousehold(db);
		const item = await seedGroceryItem(db, {
			userId: h.other.id,
			familyId: h.familyId,
			stores: ['Aldi']
		});
		expect((await setGroceryItemStores(db, h.family, item.id, ['Lidl']))?.stores).toEqual(['Lidl']);
	});

	rollbackTest('is null, and writes nothing, outside the scope', async (db) => {
		const h = await seedHousehold(db);
		const theirs = await seedGroceryItem(db, { userId: h.other.id, stores: ['Aldi'] });
		const theirFamily = await seedGroceryItem(db, {
			userId: h.other.id,
			familyId: h.otherFamilyId,
			stores: ['Aldi']
		});
		const mineItem = await seedGroceryItem(db, { userId: h.user.id, stores: ['Aldi'] });

		expect(await setGroceryItemStores(db, h.mine, theirs.id, ['X'])).toBeNull();
		expect(await setGroceryItemStores(db, h.family, theirFamily.id, ['X'])).toBeNull();
		// Right owner, wrong scope: a Mine item is not on the family list, and vice versa.
		expect(await setGroceryItemStores(db, h.family, mineItem.id, ['X'])).toBeNull();
		expect(await setGroceryItemStores(db, h.mine, 'missing-id', ['X'])).toBeNull();

		const stored = await db.select({ stores: groceryItems.stores }).from(groceryItems);
		expect(stored.every((row) => row.stores.length === 1 && row.stores[0] === 'Aldi')).toBe(true);
	});
});

describe('moveGroceryItem', () => {
	rollbackTest('moving a Family item to Mine re-owns it to the mover', async (db) => {
		const h = await seedHousehold(db);
		const item = await seedGroceryItem(db, { userId: h.other.id, familyId: h.familyId });
		const row = await moveGroceryItem(db, h.family, item.id, h.mine);
		expect(row?.userId).toBe(h.user.id);
		expect(row?.familyId).toBeNull();
		const mineList = await listOpenGroceryItems(db, h.mine);
		expect(mineList.map((moved) => moved.id)).toEqual([item.id]);
		expect(await listOpenGroceryItems(db, h.family)).toEqual([]);
	});

	rollbackTest('moving a Mine item to Family keeps the owner and sets the family', async (db) => {
		const h = await seedHousehold(db);
		const item = await seedGroceryItem(db, { userId: h.user.id });
		const row = await moveGroceryItem(db, h.mine, item.id, h.family);
		expect(row?.userId).toBe(h.user.id);
		expect(row?.familyId).toBe(h.familyId);
		expect((await listOpenGroceryItems(db, h.family)).map((moved) => moved.id)).toEqual([item.id]);
	});

	rollbackTest('leaves Store Memory where it was trained', async (db) => {
		const h = await seedHousehold(db);
		const item = await seedGroceryItem(db, { userId: h.user.id, familyId: h.familyId });
		await seedGroceryMemory(db, { userId: h.user.id, familyId: h.familyId, count: 4 });
		await moveGroceryItem(db, h.family, item.id, h.mine);
		const memory = await db.select().from(groceryStoreMemory);
		expect(memory.map((row) => [row.familyId, row.count])).toEqual([[h.familyId, 4]]);
	});

	rollbackTest('is null, and moves nothing, outside the source scope', async (db) => {
		const h = await seedHousehold(db);
		const theirs = await seedGroceryItem(db, { userId: h.other.id });
		const theirFamily = await seedGroceryItem(db, {
			userId: h.other.id,
			familyId: h.otherFamilyId
		});
		expect(await moveGroceryItem(db, h.mine, theirs.id, h.family)).toBeNull();
		expect(await moveGroceryItem(db, h.family, theirFamily.id, h.mine)).toBeNull();
		expect(await moveGroceryItem(db, h.mine, 'missing-id', h.family)).toBeNull();
		const stored = await db
			.select({ id: groceryItems.id, userId: groceryItems.userId, familyId: groceryItems.familyId })
			.from(groceryItems);
		expect(stored.find((row) => row.id === theirs.id)).toMatchObject({
			userId: h.other.id,
			familyId: null
		});
		expect(stored.find((row) => row.id === theirFamily.id)).toMatchObject({
			userId: h.other.id,
			familyId: h.otherFamilyId
		});
	});
});

describe('checkGroceryItem and uncheckGroceryItem', () => {
	rollbackTest('check stamps checkedAt with now and hides the item from the open list', async (db) => {
		const h = await seedHousehold(db);
		const item = await seedGroceryItem(db, { userId: h.user.id });
		const now = new Date('2026-04-01T12:00:00Z');
		const row = await checkGroceryItem(db, h.mine, item.id, now);
		expect(row?.id).toBe(item.id);
		expect(await checkedAtMillis(db, item.id)).toBe(now.getTime());
		expect(await listOpenGroceryItems(db, h.mine)).toEqual([]);
	});

	rollbackTest('uncheck clears checkedAt and revives the item', async (db) => {
		const h = await seedHousehold(db);
		const item = await seedGroceryItem(db, {
			userId: h.user.id,
			checkedAt: '2026-04-01T12:00:00Z'
		});
		const row = await uncheckGroceryItem(db, h.mine, item.id);
		expect(row?.checkedAt).toBeNull();
		expect(await checkedAtMillis(db, item.id)).toBeNull();
		expect((await listOpenGroceryItems(db, h.mine)).map((open) => open.id)).toEqual([item.id]);
	});

	rollbackTest('check and uncheck work on a Family item for any member', async (db) => {
		const h = await seedHousehold(db);
		const item = await seedGroceryItem(db, { userId: h.other.id, familyId: h.familyId });
		expect(await checkGroceryItem(db, h.family, item.id, new Date('2026-04-01T12:00:00Z'))).not.toBeNull();
		expect(await listOpenGroceryItems(db, h.family)).toEqual([]);
		expect(await uncheckGroceryItem(db, h.family, item.id)).not.toBeNull();
		expect(await listOpenGroceryItems(db, h.family)).toHaveLength(1);
	});

	rollbackTest('both are null, and change nothing, outside the scope', async (db) => {
		const h = await seedHousehold(db);
		const theirs = await seedGroceryItem(db, { userId: h.other.id });
		const checked = await seedGroceryItem(db, {
			userId: h.other.id,
			familyId: h.otherFamilyId,
			checkedAt: '2026-04-01T12:00:00Z'
		});
		const now = new Date('2026-05-01T12:00:00Z');
		expect(await checkGroceryItem(db, h.mine, theirs.id, now)).toBeNull();
		expect(await checkGroceryItem(db, h.family, 'missing-id', now)).toBeNull();
		expect(await uncheckGroceryItem(db, h.family, checked.id)).toBeNull();
		expect(await checkedAtMillis(db, theirs.id)).toBeNull();
		expect(await checkedAtMillis(db, checked.id)).toBe(new Date('2026-04-01T12:00:00Z').getTime());
	});
});

describe('removeGroceryItem', () => {
	rollbackTest('deletes a Mine item and keeps Store Memory', async (db) => {
		const h = await seedHousehold(db);
		const item = await seedGroceryItem(db, { userId: h.user.id, stores: ['Aldi'] });
		await seedGroceryMemory(db, { userId: h.user.id, count: 2 });
		const row = await removeGroceryItem(db, h.mine, item.id);
		expect(row?.id).toBe(item.id);
		expect(await db.select().from(groceryItems)).toEqual([]);
		expect(await db.select().from(groceryStoreMemory)).toHaveLength(1);
	});

	rollbackTest('deletes a Family item for any member of the family', async (db) => {
		const h = await seedHousehold(db);
		const item = await seedGroceryItem(db, { userId: h.other.id, familyId: h.familyId });
		expect((await removeGroceryItem(db, h.family, item.id))?.id).toBe(item.id);
		expect(await db.select().from(groceryItems)).toEqual([]);
	});

	rollbackTest('is null, and leaves the row in place, outside the scope', async (db) => {
		const h = await seedHousehold(db);
		const theirs = await seedGroceryItem(db, { userId: h.other.id });
		const theirFamily = await seedGroceryItem(db, {
			userId: h.other.id,
			familyId: h.otherFamilyId
		});
		const mineItem = await seedGroceryItem(db, { userId: h.user.id });
		expect(await removeGroceryItem(db, h.mine, theirs.id)).toBeNull();
		expect(await removeGroceryItem(db, h.family, theirFamily.id)).toBeNull();
		expect(await removeGroceryItem(db, h.family, mineItem.id)).toBeNull();
		expect(await removeGroceryItem(db, h.mine, 'missing-id')).toBeNull();
		expect(await db.select().from(groceryItems)).toHaveLength(3);
	});
});

describe('Store Memory', () => {
	// Both Store Memory and the colour read have no ORDER BY, as legacy: heap order
	// is no promise (sheet Notes, "Two reads rely on physical row order"), so these
	// tests compare sorted.
	rollbackTest('listGroceryMemoryRows reads one name in one scope', async (db) => {
		const h = await seedHousehold(db);
		await seedGroceryMemory(db, { userId: h.user.id, store: 'Aldi', count: 3 });
		await seedGroceryMemory(db, { userId: h.user.id, store: 'Lidl', count: 3 });
		// Everything Mine must not see.
		await seedGroceryMemory(db, { userId: h.user.id, store: 'Other name', nameKey: 'bread' });
		await seedGroceryMemory(db, { userId: h.other.id, store: 'Their store' });
		await seedGroceryMemory(db, { userId: h.user.id, familyId: h.familyId, store: 'Family store' });

		const rows = await listGroceryMemoryRows(db, h.mine, 'milk');
		expect(rows.map((row) => `${row.store} ${row.count}`).sort()).toEqual(['Aldi 3', 'Lidl 3']);
	});

	rollbackTest('listGroceryMemoryRows is family-wide for a Family scope', async (db) => {
		const h = await seedHousehold(db);
		await seedGroceryMemory(db, {
			userId: h.other.id,
			familyId: h.familyId,
			store: 'Taught by a member'
		});
		await seedGroceryMemory(db, { userId: h.user.id, familyId: h.familyId, store: 'Taught by me' });
		await seedGroceryMemory(db, { userId: h.user.id, store: 'My own Mine store' });
		await seedGroceryMemory(db, {
			userId: h.other.id,
			familyId: h.otherFamilyId,
			store: 'Another family'
		});

		const rows = await listGroceryMemoryRows(db, h.family, 'milk');
		expect(rows.map((row) => row.store).sort()).toEqual(['Taught by a member', 'Taught by me']);
	});

	rollbackTest('listGroceryMemoryRows is empty when nothing was learned', async (db) => {
		const h = await seedHousehold(db);
		expect(await listGroceryMemoryRows(db, h.mine, 'milk')).toEqual([]);
	});

	rollbackTest('insertGroceryMemory remembers a store once, stamped with now', async (db) => {
		const h = await seedHousehold(db);
		const now = new Date('2026-04-01T12:00:00Z');
		await insertGroceryMemory(db, { scope: h.family, nameKey: 'eggs', store: 'Costco', now });
		await insertGroceryMemory(db, { scope: h.mine, nameKey: 'eggs', store: 'Aldi', now });
		const rows = await db.select().from(groceryStoreMemory);
		expect(
			rows.map((row) => [row.userId, row.familyId, row.nameKey, row.store, row.count]).sort()
		).toEqual(
			[
				[h.user.id, h.familyId, 'eggs', 'Costco', 1],
				[h.user.id, null, 'eggs', 'Aldi', 1]
			].sort()
		);
		expect(rows.every((row) => row.updatedAt.getTime() === now.getTime())).toBe(true);
	});

	rollbackTest('incrementGroceryMemory adds one and re-stamps only that row', async (db) => {
		const h = await seedHousehold(db);
		const target = await seedGroceryMemory(db, { userId: h.user.id, store: 'Aldi', count: 2 });
		const untouched = await seedGroceryMemory(db, { userId: h.user.id, store: 'Lidl', count: 5 });
		const first = new Date('2026-04-01T12:00:00Z');
		const second = new Date('2026-04-02T12:00:00Z');

		await incrementGroceryMemory(db, target.id, first);
		await incrementGroceryMemory(db, target.id, second);

		const rows = await db.select().from(groceryStoreMemory);
		const after = rows.find((row) => row.id === target.id);
		expect(after?.count).toBe(4);
		expect(after?.updatedAt.getTime()).toBe(second.getTime());
		const other = rows.find((row) => row.id === untouched.id);
		expect(other?.count).toBe(5);
		expect(other?.updatedAt.getTime()).toBe(untouched.updatedAt.getTime());
	});
});

describe('listGroceryColourRows', () => {
	rollbackTest('returns the viewer’s personal rows plus the family’s, as four fields', async (db) => {
		const h = await seedHousehold(db);
		await seedGroceryColour(db, { userId: h.user.id, storeKey: 'aldi', color: 'sky' });
		// A family row remembers its last writer; the family tier ignores that column.
		await seedGroceryColour(db, {
			userId: h.other.id,
			familyId: h.familyId,
			storeKey: 'lidl',
			color: 'sage'
		});
		await seedGroceryColour(db, { userId: h.other.id, storeKey: 'tesco', color: 'amber' });
		await seedGroceryColour(db, {
			userId: h.other.id,
			familyId: h.otherFamilyId,
			storeKey: 'coop',
			color: 'slate'
		});

		const rows = await listGroceryColourRows(db, h.family);
		expect([...rows].sort((a, b) => a.storeKey.localeCompare(b.storeKey))).toEqual([
			{ storeKey: 'aldi', color: 'sky', userId: h.user.id, familyId: null },
			{ storeKey: 'lidl', color: 'sage', userId: h.other.id, familyId: h.familyId }
		]);
	});

	rollbackTest('returns only the viewer’s personal rows when they have no family', async (db) => {
		const h = await seedHousehold(db);
		await seedGroceryColour(db, { userId: h.user.id, storeKey: 'aldi', color: 'sky' });
		// A row the viewer wrote in a family they have since left is not theirs to read.
		await seedGroceryColour(db, {
			userId: h.user.id,
			familyId: h.otherFamilyId,
			storeKey: 'lidl',
			color: 'sage'
		});
		await seedGroceryColour(db, { userId: h.other.id, storeKey: 'tesco', color: 'amber' });

		expect(await listGroceryColourRows(db, h.mine)).toEqual([
			{ storeKey: 'aldi', color: 'sky', userId: h.user.id, familyId: null }
		]);
	});

	// Legacy `where userId = viewer OR familyId = family`: with a family, a row the
	// viewer wrote in a family they left still comes back. Resolution ignores it
	// (its family is not the viewer's), so it is harmless; the port keeps it.
	rollbackTest('with a family also returns rows the viewer wrote elsewhere (legacy OR)', async (db) => {
		const h = await seedHousehold(db);
		await seedGroceryColour(db, {
			userId: h.user.id,
			familyId: h.otherFamilyId,
			storeKey: 'lidl',
			color: 'sage'
		});
		const rows = await listGroceryColourRows(db, h.family);
		expect(rows.map((row) => row.storeKey)).toEqual(['lidl']);
	});

	rollbackTest('is empty when no colour was ever set', async (db) => {
		const h = await seedHousehold(db);
		expect(await listGroceryColourRows(db, h.family)).toEqual([]);
	});
});

describe('upsertGroceryColour', () => {
	const first = new Date('2026-04-01T12:00:00Z');
	const second = new Date('2026-04-02T12:00:00Z');

	rollbackTest('writes a personal row, then updates the same row in place', async (db) => {
		const h = await seedHousehold(db);
		await upsertGroceryColour(db, { scope: h.mine, storeKey: 'aldi', color: 'sky', now: first });
		let rows = await db.select().from(groceryStoreColours);
		expect(rows).toHaveLength(1);
		expect({ userId: rows[0].userId, familyId: rows[0].familyId, color: rows[0].color }).toEqual({
			userId: h.user.id,
			familyId: null,
			color: 'sky'
		});
		expect(rows[0].updatedAt.getTime()).toBe(first.getTime());

		await upsertGroceryColour(db, { scope: h.mine, storeKey: 'aldi', color: 'lilac', now: second });
		rows = await db.select().from(groceryStoreColours);
		expect(rows).toHaveLength(1);
		expect(rows[0].color).toBe('lilac');
		expect(rows[0].updatedAt.getTime()).toBe(second.getTime());
	});

	rollbackTest('keeps one personal row per (user, store): another user or store is another row', async (db) => {
		const h = await seedHousehold(db);
		await upsertGroceryColour(db, { scope: h.mine, storeKey: 'aldi', color: 'sky', now: first });
		await upsertGroceryColour(db, { scope: h.mine, storeKey: 'lidl', color: 'sage', now: first });
		await upsertGroceryColour(db, { scope: h.others, storeKey: 'aldi', color: 'amber', now: first });
		const rows = await db.select().from(groceryStoreColours);
		expect(rows.map((row) => [row.userId, row.storeKey, row.color]).sort()).toEqual(
			[
				[h.user.id, 'aldi', 'sky'],
				[h.user.id, 'lidl', 'sage'],
				[h.other.id, 'aldi', 'amber']
			].sort()
		);
	});

	rollbackTest('writes a family row, then updates it in place without changing its writer', async (db) => {
		const h = await seedHousehold(db);
		await upsertGroceryColour(db, { scope: h.family, storeKey: 'aldi', color: 'sky', now: first });
		let rows = await db.select().from(groceryStoreColours);
		expect(rows).toHaveLength(1);
		expect({ userId: rows[0].userId, familyId: rows[0].familyId }).toEqual({
			userId: h.user.id,
			familyId: h.familyId
		});

		// Another member of the same family flips it: still one row (Q-035: the
		// column is the writer of the row, and a conflict never changes it).
		const member = { userId: h.other.id, familyId: h.familyId };
		await upsertGroceryColour(db, { scope: member, storeKey: 'aldi', color: 'amber', now: second });
		rows = await db.select().from(groceryStoreColours);
		expect(rows).toHaveLength(1);
		expect(rows[0].color).toBe('amber');
		expect(rows[0].userId).toBe(h.user.id);
		expect(rows[0].updatedAt.getTime()).toBe(second.getTime());
	});

	rollbackTest('keeps a personal and a family row for one store at once, and one per family', async (db) => {
		const h = await seedHousehold(db);
		await upsertGroceryColour(db, { scope: h.mine, storeKey: 'aldi', color: 'sky', now: first });
		await upsertGroceryColour(db, { scope: h.family, storeKey: 'aldi', color: 'sage', now: first });
		await upsertGroceryColour(db, {
			scope: h.otherFamily,
			storeKey: 'aldi',
			color: 'amber',
			now: first
		});
		const rows = await db.select().from(groceryStoreColours);
		expect(rows.map((row) => [row.familyId, row.color]).sort()).toEqual(
			[
				[null, 'sky'],
				[h.familyId, 'sage'],
				[h.otherFamilyId, 'amber']
			].sort()
		);
	});
});

describe('deleteGroceryColour', () => {
	rollbackTest('clears one store in the personal scope and nothing else', async (db) => {
		const h = await seedHousehold(db);
		const cleared = await seedGroceryColour(db, { userId: h.user.id, storeKey: 'aldi', color: 'sky' });
		const otherStore = await seedGroceryColour(db, { userId: h.user.id, storeKey: 'lidl', color: 'sage' });
		const theirs = await seedGroceryColour(db, { userId: h.other.id, storeKey: 'aldi', color: 'amber' });
		const familyRow = await seedGroceryColour(db, {
			userId: h.user.id,
			familyId: h.familyId,
			storeKey: 'aldi',
			color: 'slate'
		});

		expect(await deleteGroceryColour(db, h.mine, 'aldi')).toBe(1);
		const remaining = await db.select({ id: groceryStoreColours.id }).from(groceryStoreColours);
		expect(remaining.map((row) => row.id).sort()).toEqual(
			[otherStore.id, theirs.id, familyRow.id].sort()
		);
		expect(remaining.map((row) => row.id)).not.toContain(cleared.id);
	});

	rollbackTest('clears one store in the family scope and nothing else', async (db) => {
		const h = await seedHousehold(db);
		const cleared = await seedGroceryColour(db, {
			userId: h.other.id,
			familyId: h.familyId,
			storeKey: 'aldi',
			color: 'sky'
		});
		const otherStore = await seedGroceryColour(db, {
			userId: h.user.id,
			familyId: h.familyId,
			storeKey: 'lidl',
			color: 'sage'
		});
		const personal = await seedGroceryColour(db, { userId: h.user.id, storeKey: 'aldi', color: 'amber' });
		const otherFamily = await seedGroceryColour(db, {
			userId: h.other.id,
			familyId: h.otherFamilyId,
			storeKey: 'aldi',
			color: 'slate'
		});

		expect(await deleteGroceryColour(db, h.family, 'aldi')).toBe(1);
		const remaining = await db.select({ id: groceryStoreColours.id }).from(groceryStoreColours);
		expect(remaining.map((row) => row.id).sort()).toEqual(
			[otherStore.id, personal.id, otherFamily.id].sort()
		);
		expect(remaining.map((row) => row.id)).not.toContain(cleared.id);
	});

	rollbackTest('answers 0 when there is nothing to clear', async (db) => {
		const h = await seedHousehold(db);
		await seedGroceryColour(db, { userId: h.user.id, storeKey: 'lidl' });
		expect(await deleteGroceryColour(db, h.mine, 'aldi')).toBe(0);
		expect(await deleteGroceryColour(db, h.family, 'lidl')).toBe(0);
	});
});
