/**
 * Golden contract tests for the groceries `/api` wire (playbook S2).
 *
 * They run against the LEGACY route handlers, through the legacy `db`
 * singleton, so they must stay byte-for-byte green after the port: each test
 * pins status, the full JSON body and the rows a client can observe.
 * Doc: ./README.md#invariants, docs/rewrite/playbooks/characterize-endpoints.md
 */
import { asc, eq } from 'drizzle-orm';
import { beforeEach, describe, expect, it } from 'vitest';
import {
	families,
	familyMembers,
	groceryItems,
	groceryStoreColours,
	groceryStoreMemory
} from '$lib/kernel/db/tables.server';
import { invoke } from '$lib/kernel/testing/invokeHandlers.server';
import { seedUser } from '$lib/kernel/testing/seedRows.server';
import { testCtx } from '$lib/kernel/testing/testCtx.server';
import { testDb, truncateAll } from '$lib/kernel/testing/testDb.server';
import type { JsonValue } from '$lib/kernel/validation/validators';
import { GET as getGroceries, POST as postGroceries } from '../../../routes/api/groceries/+server';
import {
	DELETE as deleteGrocery,
	PATCH as patchGrocery
} from '../../../routes/api/groceries/[id]/+server';
import {
	GET as getColours,
	PATCH as patchColours
} from '../../../routes/api/groceries/colours/+server';

const ctx = () => testCtx({ db: testDb() });

// The legacy code reads the real clock for `createdAt`/`checkedAt`, so these
// are shape assertions, not dates (characterize-endpoints.md gotcha).
const ISO_INSTANT = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/;

/** An OPEN item exactly as the wire sends it (checkedAt is null by definition). */
function openItemWire(row: typeof groceryItems.$inferSelect) {
	return {
		id: row.id,
		userId: row.userId,
		familyId: row.familyId,
		name: row.name,
		nameKey: row.nameKey,
		quantity: row.quantity,
		stores: row.stores,
		checkedAt: null,
		createdAt: expect.stringMatching(ISO_INSTANT)
	};
}

async function seedFamily(name: string): Promise<string> {
	const [row] = await testDb().insert(families).values({ name }).returning({ id: families.id });
	return row.id;
}

async function addMember(userId: string, familyId: string): Promise<void> {
	await testDb().insert(familyMembers).values({ userId, familyId, role: 'owner' });
}

type ItemSeed = {
	userId: string;
	name: string;
	familyId?: string | null;
	quantity?: number;
	stores?: string[];
	checkedAt?: string | null;
	createdAt?: string;
};

async function seedItem(seed: ItemSeed) {
	const [row] = await testDb()
		.insert(groceryItems)
		.values({
			userId: seed.userId,
			familyId: seed.familyId ?? null,
			name: seed.name,
			nameKey: seed.name.trim().toLowerCase(),
			quantity: seed.quantity ?? 1,
			stores: seed.stores ?? [],
			checkedAt: seed.checkedAt ?? null,
			createdAt: new Date(seed.createdAt ?? '2026-01-01T00:00:00Z')
		})
		.returning();
	return row;
}

type MemorySeed = {
	userId: string;
	familyId?: string | null;
	nameKey: string;
	store: string;
	count: number;
};

async function seedMemory(seed: MemorySeed): Promise<void> {
	await testDb()
		.insert(groceryStoreMemory)
		.values({
			userId: seed.userId,
			familyId: seed.familyId ?? null,
			nameKey: seed.nameKey,
			store: seed.store,
			count: seed.count
		});
}

async function memoryRows(userId: string) {
	return await testDb()
		.select({
			nameKey: groceryStoreMemory.nameKey,
			store: groceryStoreMemory.store,
			count: groceryStoreMemory.count,
			userId: groceryStoreMemory.userId,
			familyId: groceryStoreMemory.familyId
		})
		.from(groceryStoreMemory)
		.where(eq(groceryStoreMemory.userId, userId))
		.orderBy(asc(groceryStoreMemory.store));
}

type ColourSeed = {
	userId: string;
	familyId?: string | null;
	storeKey: string;
	color: string;
};

async function seedColour(seed: ColourSeed): Promise<void> {
	await testDb()
		.insert(groceryStoreColours)
		.values({
			userId: seed.userId,
			familyId: seed.familyId ?? null,
			storeKey: seed.storeKey,
			color: seed.color
		});
}

async function colourRows() {
	return await testDb()
		.select({
			storeKey: groceryStoreColours.storeKey,
			color: groceryStoreColours.color,
			userId: groceryStoreColours.userId,
			familyId: groceryStoreColours.familyId
		})
		.from(groceryStoreColours)
		.orderBy(asc(groceryStoreColours.storeKey));
}

const PALETTE = [
	{ key: 'terracotta', label: 'Terracotta' },
	{ key: 'sky', label: 'Blue' },
	{ key: 'sage', label: 'Mint' },
	{ key: 'lilac', label: 'Lavender' },
	{ key: 'amber', label: 'Amber' },
	{ key: 'slate', label: 'Slate' }
];

beforeEach(truncateAll);

describe('GET /api/groceries', () => {
	it('answers {items} with the open Mine items, oldest first', async () => {
		const user = await seedUser(testDb());
		const other = await seedUser(testDb());
		const familyId = await seedFamily('Other family');
		const older = await seedItem({
			userId: user.id,
			name: 'Milk',
			quantity: 2,
			stores: ['Aldi'],
			createdAt: '2026-01-01T00:00:00Z'
		});
		const newer = await seedItem({
			userId: user.id,
			name: 'Eggs',
			createdAt: '2026-01-02T00:00:00Z'
		});
		// Hidden by the three filters: checked off, someone else's, and Family.
		await seedItem({ userId: user.id, name: 'Bread', checkedAt: '2026-01-03T00:00:00Z' });
		await seedItem({ userId: other.id, name: 'Beer' });
		await seedItem({ userId: user.id, name: 'Family milk', familyId });

		const res = await invoke(getGroceries, {
			ctx: ctx(),
			user,
			path: '/api/groceries',
			query: { scope: 'mine' }
		});

		expect(res.status).toBe(200);
		expect(res.body).toEqual({ items: [openItemWire(older), openItemWire(newer)] });
	});

	it('answers the Family list only from the viewer’s own family', async () => {
		const user = await seedUser(testDb());
		const other = await seedUser(testDb());
		const mineFamily = await seedFamily('My family');
		const theirFamily = await seedFamily('Their family');
		await addMember(user.id, mineFamily);
		await addMember(other.id, theirFamily);
		const familyItem = await seedItem({
			userId: other.id,
			name: 'Milk',
			familyId: mineFamily
		});
		await seedItem({ userId: other.id, name: 'Beer', familyId: theirFamily });
		// A Mine row of the viewer never leaks into the Family list.
		await seedItem({ userId: user.id, name: 'Pasta' });

		const res = await invoke(getGroceries, {
			ctx: ctx(),
			user,
			path: '/api/groceries',
			query: { scope: 'family' }
		});

		expect(res.status).toBe(200);
		expect(res.body).toEqual({ items: [openItemWire(familyItem)] });
	});

	it('answers {store} for a suggest read: the most frequent remembered store', async () => {
		const user = await seedUser(testDb());
		await seedMemory({ userId: user.id, nameKey: 'milk', store: 'Aldi', count: 2 });
		await seedMemory({ userId: user.id, nameKey: 'milk', store: 'Lidl', count: 5 });
		await seedMemory({ userId: user.id, nameKey: 'eggs', store: 'Aldi', count: 9 });

		const res = await invoke(getGroceries, {
			ctx: ctx(),
			user,
			path: '/api/groceries',
			query: { scope: 'mine', suggest: '1', name: '  Milk  ' }
		});

		expect(res.status).toBe(200);
		expect(res.body).toEqual({ store: 'Lidl' });
	});

	it('picks the first store seen when the counts tie', async () => {
		const user = await seedUser(testDb());
		await seedMemory({ userId: user.id, nameKey: 'milk', store: 'Aldi', count: 3 });
		await seedMemory({ userId: user.id, nameKey: 'milk', store: 'Lidl', count: 3 });

		const res = await invoke(getGroceries, {
			ctx: ctx(),
			user,
			path: '/api/groceries',
			query: { scope: 'mine', suggest: '1', name: 'milk' }
		});

		expect(res.status).toBe(200);
		expect(res.body).toEqual({ store: 'Aldi' });
	});

	it('answers {store: null} when Store Memory knows nothing', async () => {
		const user = await seedUser(testDb());

		const res = await invoke(getGroceries, {
			ctx: ctx(),
			user,
			path: '/api/groceries',
			query: { scope: 'mine', suggest: '1', name: 'Unicorn' }
		});

		expect(res.status).toBe(200);
		expect(res.body).toEqual({ store: null });
	});

	it('ignores ?name without ?suggest, and ?suggest without ?name', async () => {
		const user = await seedUser(testDb());

		const nameOnly = await invoke(getGroceries, {
			ctx: ctx(),
			user,
			path: '/api/groceries',
			query: { scope: 'mine', name: 'Milk' }
		});
		expect(nameOnly.status).toBe(200);
		expect(nameOnly.body).toEqual({ items: [] });

		const suggestOnly = await invoke(getGroceries, {
			ctx: ctx(),
			user,
			path: '/api/groceries',
			query: { scope: 'mine', suggest: '1' }
		});
		expect(suggestOnly.status).toBe(200);
		expect(suggestOnly.body).toEqual({ items: [] });
	});

	it('answers 400 "scope must be mine or family" when scope is absent or junk', async () => {
		const user = await seedUser(testDb());

		const absent = await invoke(getGroceries, { ctx: ctx(), user, path: '/api/groceries' });
		expect(absent).toMatchObject({
			status: 400,
			body: { error: 'scope must be mine or family' }
		});

		const junk = await invoke(getGroceries, {
			ctx: ctx(),
			user,
			path: '/api/groceries',
			query: { scope: 'all' }
		});
		expect(junk).toMatchObject({ status: 400, body: { error: 'scope must be mine or family' } });
	});

	it('answers 400 for scope=family when the viewer has no family', async () => {
		const user = await seedUser(testDb());

		const res = await invoke(getGroceries, {
			ctx: ctx(),
			user,
			path: '/api/groceries',
			query: { scope: 'family' }
		});

		expect(res).toMatchObject({ status: 400, body: { error: 'scope must be mine or family' } });
	});

	it('answers 401 {"error":"Unauthorized"} when signed out', async () => {
		const res = await invoke(getGroceries, { ctx: ctx(), path: '/api/groceries' });
		expect(res).toMatchObject({ status: 401, body: { error: 'Unauthorized' } });
	});
});

describe('POST /api/groceries', () => {
	it('adds the quick-add text and answers 201 with the full item', async () => {
		const user = await seedUser(testDb());

		const res = await invoke(postGroceries, {
			ctx: ctx(),
			user,
			path: '/api/groceries',
			body: { scope: 'mine', input: 'milk 2' }
		});

		expect(res.status).toBe(201);
		expect(res.body).toEqual({
			item: {
				id: expect.any(String),
				userId: user.id,
				familyId: null,
				name: 'milk',
				nameKey: 'milk',
				quantity: 2,
				stores: [],
				checkedAt: null,
				createdAt: expect.stringMatching(ISO_INSTANT)
			}
		});
		const rows = await testDb()
			.select({
				name: groceryItems.name,
				quantity: groceryItems.quantity,
				stores: groceryItems.stores
			})
			.from(groceryItems)
			.where(eq(groceryItems.userId, user.id));
		expect(rows).toEqual([{ name: 'milk', quantity: 2, stores: [] }]);
	});

	it('reads a leading quantity and a trailing quantity, keeping the rest as the name', async () => {
		const user = await seedUser(testDb());

		const leading = await invoke(postGroceries, {
			ctx: ctx(),
			user,
			path: '/api/groceries',
			body: { scope: 'mine', input: '2 milk' }
		});
		expect(leading.status).toBe(201);
		expect(leading.body).toEqual({
			item: {
				id: expect.any(String),
				userId: user.id,
				familyId: null,
				name: 'milk',
				nameKey: 'milk',
				quantity: 2,
				stores: [],
				checkedAt: null,
				createdAt: expect.stringMatching(ISO_INSTANT)
			}
		});

		const trailing = await invoke(postGroceries, {
			ctx: ctx(),
			user,
			path: '/api/groceries',
			body: { scope: 'mine', input: '  Eggs   6  ' }
		});
		expect(trailing.status).toBe(201);
		expect(trailing.body).toEqual({
			item: {
				id: expect.any(String),
				userId: user.id,
				familyId: null,
				name: 'Eggs',
				nameKey: 'eggs',
				quantity: 6,
				stores: [],
				checkedAt: null,
				createdAt: expect.stringMatching(ISO_INSTANT)
			}
		});
	});

	it('clamps a zero quantity up to 1', async () => {
		const user = await seedUser(testDb());

		const res = await invoke(postGroceries, {
			ctx: ctx(),
			user,
			path: '/api/groceries',
			body: { scope: 'mine', input: 'milk 0' }
		});

		expect(res.status).toBe(201);
		expect(res.body).toEqual({
			item: {
				id: expect.any(String),
				userId: user.id,
				familyId: null,
				name: 'milk',
				nameKey: 'milk',
				quantity: 1,
				stores: [],
				checkedAt: null,
				createdAt: expect.stringMatching(ISO_INSTANT)
			}
		});
	});

	it('cleans the stores it is given and trains Store Memory with them', async () => {
		const user = await seedUser(testDb());

		const res = await invoke(postGroceries, {
			ctx: ctx(),
			user,
			path: '/api/groceries',
			body: { scope: 'mine', input: 'milk', stores: [' Aldi ', 7, 'aldi', 'Lidl'] }
		});

		expect(res.status).toBe(201);
		expect(res.body).toEqual({
			item: {
				id: expect.any(String),
				userId: user.id,
				familyId: null,
				name: 'milk',
				nameKey: 'milk',
				quantity: 1,
				stores: ['Aldi', 'Lidl'],
				checkedAt: null,
				createdAt: expect.stringMatching(ISO_INSTANT)
			}
		});
		expect(await memoryRows(user.id)).toEqual([
			{ nameKey: 'milk', store: 'Aldi', count: 1, userId: user.id, familyId: null },
			{ nameKey: 'milk', store: 'Lidl', count: 1, userId: user.id, familyId: null }
		]);
	});

	it('auto-fills the remembered store instead of training memory again', async () => {
		const user = await seedUser(testDb());
		await seedMemory({ userId: user.id, nameKey: 'milk', store: 'Aldi', count: 2 });

		const res = await invoke(postGroceries, {
			ctx: ctx(),
			user,
			path: '/api/groceries',
			body: { scope: 'mine', input: 'Milk' }
		});

		expect(res.status).toBe(201);
		expect(res.body).toEqual({
			item: {
				id: expect.any(String),
				userId: user.id,
				familyId: null,
				name: 'Milk',
				nameKey: 'milk',
				quantity: 1,
				stores: ['Aldi'],
				checkedAt: null,
				createdAt: expect.stringMatching(ISO_INSTANT)
			}
		});
		expect(await memoryRows(user.id)).toEqual([
			{ nameKey: 'milk', store: 'Aldi', count: 2, userId: user.id, familyId: null }
		]);
	});

	it('trains Family Store Memory under the family, not the user', async () => {
		const user = await seedUser(testDb());
		const familyId = await seedFamily('My family');
		await addMember(user.id, familyId);

		const res = await invoke(postGroceries, {
			ctx: ctx(),
			user,
			path: '/api/groceries',
			body: { scope: 'family', input: 'milk', stores: ['Lidl'] }
		});

		expect(res.status).toBe(201);
		expect(res.body).toEqual({
			item: {
				id: expect.any(String),
				userId: user.id,
				familyId,
				name: 'milk',
				nameKey: 'milk',
				quantity: 1,
				stores: ['Lidl'],
				checkedAt: null,
				createdAt: expect.stringMatching(ISO_INSTANT)
			}
		});
		expect(await memoryRows(user.id)).toEqual([
			{ nameKey: 'milk', store: 'Lidl', count: 1, userId: user.id, familyId }
		]);
	});

	it('answers 400 "Invalid JSON body" for a malformed body', async () => {
		const user = await seedUser(testDb());

		const res = await invoke(postGroceries, {
			ctx: ctx(),
			user,
			path: '/api/groceries',
			rawBody: '{'
		});

		expect(res).toMatchObject({ status: 400, body: { error: 'Invalid JSON body' } });
	});

	it('answers 400 "scope must be mine or family" when scope is absent or junk', async () => {
		const user = await seedUser(testDb());

		const absent = await invoke(postGroceries, {
			ctx: ctx(),
			user,
			path: '/api/groceries',
			body: { input: 'milk' }
		});
		expect(absent).toMatchObject({ status: 400, body: { error: 'scope must be mine or family' } });

		const junk = await invoke(postGroceries, {
			ctx: ctx(),
			user,
			path: '/api/groceries',
			body: { scope: 'all', input: 'milk' }
		});
		expect(junk).toMatchObject({ status: 400, body: { error: 'scope must be mine or family' } });
	});

	it('answers 400 "Name is required" for a blank or absent input', async () => {
		const user = await seedUser(testDb());

		const blank = await invoke(postGroceries, {
			ctx: ctx(),
			user,
			path: '/api/groceries',
			body: { scope: 'mine', input: '   ' }
		});
		expect(blank).toMatchObject({ status: 400, body: { error: 'Name is required' } });

		const absent = await invoke(postGroceries, {
			ctx: ctx(),
			user,
			path: '/api/groceries',
			body: { scope: 'mine' }
		});
		expect(absent).toMatchObject({ status: 400, body: { error: 'Name is required' } });
	});

	it('answers 400 for scope=family when the viewer has no family', async () => {
		const user = await seedUser(testDb());

		const res = await invoke(postGroceries, {
			ctx: ctx(),
			user,
			path: '/api/groceries',
			body: { scope: 'family', input: 'milk' }
		});

		expect(res).toMatchObject({ status: 400, body: { error: 'scope must be mine or family' } });
	});

	it('answers 401 {"error":"Unauthorized"} when signed out', async () => {
		const res = await invoke(postGroceries, {
			ctx: ctx(),
			path: '/api/groceries',
			body: { scope: 'mine', input: 'milk' }
		});
		expect(res).toMatchObject({ status: 401, body: { error: 'Unauthorized' } });
	});
});

describe('PATCH /api/groceries/[id]', () => {
	it('checks an item off, hiding it from the next GET', async () => {
		const user = await seedUser(testDb());
		const item = await seedItem({ userId: user.id, name: 'Milk' });

		const res = await invoke(patchGrocery, {
			ctx: ctx(),
			user,
			method: 'PATCH',
			path: `/api/groceries/${item.id}`,
			body: { scope: 'mine', op: 'check' }
		});

		expect(res.status).toBe(200);
		expect(res.body).toEqual({ ok: true });
		const [row] = await testDb().select().from(groceryItems).where(eq(groceryItems.id, item.id));
		expect(row.checkedAt).not.toBeNull();

		const list = await invoke(getGroceries, {
			ctx: ctx(),
			user,
			path: '/api/groceries',
			query: { scope: 'mine' }
		});
		expect(list.body).toEqual({ items: [] });
	});

	it('unchecks an item, so the next GET lists it again', async () => {
		const user = await seedUser(testDb());
		const item = await seedItem({
			userId: user.id,
			name: 'Milk',
			checkedAt: '2026-01-03T00:00:00Z'
		});

		const res = await invoke(patchGrocery, {
			ctx: ctx(),
			user,
			method: 'PATCH',
			path: `/api/groceries/${item.id}`,
			body: { scope: 'mine', op: 'uncheck' }
		});

		expect(res.status).toBe(200);
		expect(res.body).toEqual({ ok: true });

		const list = await invoke(getGroceries, {
			ctx: ctx(),
			user,
			path: '/api/groceries',
			query: { scope: 'mine' }
		});
		expect(list.body).toEqual({ items: [openItemWire(item)] });
	});

	it('replaces the stores and trains Store Memory from the new list', async () => {
		const user = await seedUser(testDb());
		const item = await seedItem({ userId: user.id, name: 'milk', stores: ['Aldi'] });
		await seedMemory({ userId: user.id, nameKey: 'milk', store: 'Aldi', count: 3 });

		const res = await invoke(patchGrocery, {
			ctx: ctx(),
			user,
			method: 'PATCH',
			path: `/api/groceries/${item.id}`,
			body: { scope: 'mine', op: 'stores', stores: ['Lidl', '  lidl ', 'Aldi'] }
		});

		expect(res.status).toBe(200);
		expect(res.body).toEqual({ ok: true });
		const [row] = await testDb().select().from(groceryItems).where(eq(groceryItems.id, item.id));
		expect(row.stores).toEqual(['Lidl', 'Aldi']);
		expect(await memoryRows(user.id)).toEqual([
			{ nameKey: 'milk', store: 'Aldi', count: 4, userId: user.id, familyId: null },
			{ nameKey: 'milk', store: 'Lidl', count: 1, userId: user.id, familyId: null }
		]);
	});

	it('accepts an empty store list and so clears every store on the row', async () => {
		const user = await seedUser(testDb());
		const item = await seedItem({ userId: user.id, name: 'milk', stores: ['Aldi', 'Lidl'] });

		const res = await invoke(patchGrocery, {
			ctx: ctx(),
			user,
			method: 'PATCH',
			path: `/api/groceries/${item.id}`,
			body: { scope: 'mine', op: 'stores', stores: [] }
		});

		expect(res.status).toBe(200);
		expect(res.body).toEqual({ ok: true });
		const [row] = await testDb().select().from(groceryItems).where(eq(groceryItems.id, item.id));
		expect(row.stores).toEqual([]);
	});

	it('moves a Family item to Mine and re-owns it to the mover', async () => {
		const user = await seedUser(testDb());
		const other = await seedUser(testDb());
		const familyId = await seedFamily('My family');
		await addMember(user.id, familyId);
		await addMember(other.id, familyId);
		const item = await seedItem({ userId: other.id, name: 'Milk', familyId });

		const res = await invoke(patchGrocery, {
			ctx: ctx(),
			user,
			method: 'PATCH',
			path: `/api/groceries/${item.id}`,
			body: { scope: 'family', op: 'move', target: 'mine' }
		});

		expect(res.status).toBe(200);
		expect(res.body).toEqual({ ok: true });
		const [row] = await testDb().select().from(groceryItems).where(eq(groceryItems.id, item.id));
		expect([row.userId, row.familyId]).toEqual([user.id, null]);

		const mine = await invoke(getGroceries, {
			ctx: ctx(),
			user,
			path: '/api/groceries',
			query: { scope: 'mine' }
		});
		expect(mine.body).toEqual({
			items: [{ ...openItemWire(item), userId: user.id, familyId: null }]
		});
		const family = await invoke(getGroceries, {
			ctx: ctx(),
			user,
			path: '/api/groceries',
			query: { scope: 'family' }
		});
		expect(family.body).toEqual({ items: [] });
	});

	it('moves a Mine item to the Family list', async () => {
		const user = await seedUser(testDb());
		const familyId = await seedFamily('My family');
		await addMember(user.id, familyId);
		const item = await seedItem({ userId: user.id, name: 'Milk' });

		const res = await invoke(patchGrocery, {
			ctx: ctx(),
			user,
			method: 'PATCH',
			path: `/api/groceries/${item.id}`,
			body: { scope: 'mine', op: 'move', target: 'family' }
		});

		expect(res.status).toBe(200);
		expect(res.body).toEqual({ ok: true });
		const [row] = await testDb().select().from(groceryItems).where(eq(groceryItems.id, item.id));
		expect([row.userId, row.familyId]).toEqual([user.id, familyId]);
	});

	it('answers 400 "No family to move to" without a family', async () => {
		const user = await seedUser(testDb());
		const item = await seedItem({ userId: user.id, name: 'Milk' });

		const res = await invoke(patchGrocery, {
			ctx: ctx(),
			user,
			method: 'PATCH',
			path: `/api/groceries/${item.id}`,
			body: { scope: 'mine', op: 'move', target: 'family' }
		});

		expect(res).toMatchObject({ status: 400, body: { error: 'No family to move to' } });
	});

	it('answers 404 "Item not found" for an unknown id', async () => {
		const user = await seedUser(testDb());

		const res = await invoke(patchGrocery, {
			ctx: ctx(),
			user,
			method: 'PATCH',
			path: '/api/groceries/does-not-exist',
			body: { scope: 'mine', op: 'check' }
		});

		expect(res).toMatchObject({ status: 404, body: { error: 'Item not found' } });
	});

	it('answers 404 for another person’s Mine item', async () => {
		const user = await seedUser(testDb());
		const other = await seedUser(testDb());
		const item = await seedItem({ userId: other.id, name: 'Milk' });

		const res = await invoke(patchGrocery, {
			ctx: ctx(),
			user,
			method: 'PATCH',
			path: `/api/groceries/${item.id}`,
			body: { scope: 'mine', op: 'check' }
		});

		expect(res).toMatchObject({ status: 404, body: { error: 'Item not found' } });
	});

	it('answers 404 for another family’s item', async () => {
		const user = await seedUser(testDb());
		const other = await seedUser(testDb());
		const myFamily = await seedFamily('My family');
		const theirFamily = await seedFamily('Their family');
		await addMember(user.id, myFamily);
		await addMember(other.id, theirFamily);
		const item = await seedItem({ userId: other.id, name: 'Milk', familyId: theirFamily });

		const res = await invoke(patchGrocery, {
			ctx: ctx(),
			user,
			method: 'PATCH',
			path: `/api/groceries/${item.id}`,
			body: { scope: 'family', op: 'check' }
		});

		expect(res).toMatchObject({ status: 404, body: { error: 'Item not found' } });
	});

	it('answers 400 "scope must be mine or family" when body scope is absent or junk', async () => {
		const user = await seedUser(testDb());
		const item = await seedItem({ userId: user.id, name: 'Milk' });

		const absent = await invoke(patchGrocery, {
			ctx: ctx(),
			user,
			method: 'PATCH',
			path: `/api/groceries/${item.id}`,
			body: { op: 'check' }
		});
		expect(absent).toMatchObject({ status: 400, body: { error: 'scope must be mine or family' } });

		const junk = await invoke(patchGrocery, {
			ctx: ctx(),
			user,
			method: 'PATCH',
			path: `/api/groceries/${item.id}`,
			body: { scope: 'all', op: 'check' }
		});
		expect(junk).toMatchObject({ status: 400, body: { error: 'scope must be mine or family' } });
	});

	it('answers 400 "Invalid JSON body" for a malformed body', async () => {
		const user = await seedUser(testDb());
		const item = await seedItem({ userId: user.id, name: 'Milk' });

		const res = await invoke(patchGrocery, {
			ctx: ctx(),
			user,
			method: 'PATCH',
			path: `/api/groceries/${item.id}`,
			rawBody: '{'
		});

		expect(res).toMatchObject({ status: 400, body: { error: 'Invalid JSON body' } });
	});

	it('answers 400 for every op it cannot run', async () => {
		const user = await seedUser(testDb());
		const item = await seedItem({ userId: user.id, name: 'Milk' });
		const path = `/api/groceries/${item.id}`;
		const bodies: JsonValue[] = [
			{ scope: 'mine' },
			{ scope: 'mine', op: 'explode' },
			{ scope: 'mine', op: 'stores' },
			{ scope: 'mine', op: 'stores', stores: 'Aldi' },
			{ scope: 'mine', op: 'move', target: 'all' }
		];

		for (const body of bodies) {
			const res = await invoke(patchGrocery, { ctx: ctx(), user, method: 'PATCH', path, body });
			expect(res).toMatchObject({
				status: 400,
				body: { error: 'op must be check, uncheck, stores, or move' }
			});
		}
	});

	it('answers 400 "Item ID required" for a trailing slash', async () => {
		const user = await seedUser(testDb());

		const res = await invoke(patchGrocery, {
			ctx: ctx(),
			user,
			method: 'PATCH',
			path: '/api/groceries/',
			body: { scope: 'mine', op: 'check' }
		});

		expect(res).toMatchObject({ status: 400, body: { error: 'Item ID required' } });
	});

	it('answers 401 {"error":"Unauthorized"} when signed out', async () => {
		const user = await seedUser(testDb());
		const item = await seedItem({ userId: user.id, name: 'Milk' });

		const res = await invoke(patchGrocery, {
			ctx: ctx(),
			method: 'PATCH',
			path: `/api/groceries/${item.id}`,
			body: { scope: 'mine', op: 'check' }
		});

		expect(res).toMatchObject({ status: 401, body: { error: 'Unauthorized' } });
	});
});

describe('DELETE /api/groceries/[id]', () => {
	it('deletes a Mine item and keeps Store Memory', async () => {
		const user = await seedUser(testDb());
		const item = await seedItem({ userId: user.id, name: 'milk', stores: ['Aldi'] });
		await seedMemory({ userId: user.id, nameKey: 'milk', store: 'Aldi', count: 2 });

		const res = await invoke(deleteGrocery, {
			ctx: ctx(),
			user,
			method: 'DELETE',
			path: `/api/groceries/${item.id}`,
			query: { scope: 'mine' }
		});

		expect(res.status).toBe(200);
		expect(res.body).toEqual({ ok: true });
		const rows = await testDb().select().from(groceryItems).where(eq(groceryItems.id, item.id));
		expect(rows).toEqual([]);
		expect(await memoryRows(user.id)).toEqual([
			{ nameKey: 'milk', store: 'Aldi', count: 2, userId: user.id, familyId: null }
		]);
	});

	it('deletes a Family item', async () => {
		const user = await seedUser(testDb());
		const familyId = await seedFamily('My family');
		await addMember(user.id, familyId);
		const item = await seedItem({ userId: user.id, name: 'Milk', familyId });

		const res = await invoke(deleteGrocery, {
			ctx: ctx(),
			user,
			method: 'DELETE',
			path: `/api/groceries/${item.id}`,
			query: { scope: 'family' }
		});

		expect(res.status).toBe(200);
		expect(res.body).toEqual({ ok: true });
		const family = await invoke(getGroceries, {
			ctx: ctx(),
			user,
			path: '/api/groceries',
			query: { scope: 'family' }
		});
		expect(family.body).toEqual({ items: [] });
	});

	it('answers 404 "Item not found" for an unknown id', async () => {
		const user = await seedUser(testDb());

		const res = await invoke(deleteGrocery, {
			ctx: ctx(),
			user,
			method: 'DELETE',
			path: '/api/groceries/does-not-exist',
			query: { scope: 'mine' }
		});

		expect(res).toMatchObject({ status: 404, body: { error: 'Item not found' } });
	});

	it('answers 404 for another person’s item and leaves it in place', async () => {
		const user = await seedUser(testDb());
		const other = await seedUser(testDb());
		const item = await seedItem({ userId: other.id, name: 'Milk' });

		const res = await invoke(deleteGrocery, {
			ctx: ctx(),
			user,
			method: 'DELETE',
			path: `/api/groceries/${item.id}`,
			query: { scope: 'mine' }
		});

		expect(res).toMatchObject({ status: 404, body: { error: 'Item not found' } });
		const rows = await testDb().select().from(groceryItems).where(eq(groceryItems.id, item.id));
		expect(rows.map((row) => row.id)).toEqual([item.id]);
	});

	it('answers 400 "scope must be mine or family" when ?scope is absent or junk', async () => {
		const user = await seedUser(testDb());
		const item = await seedItem({ userId: user.id, name: 'Milk' });

		const absent = await invoke(deleteGrocery, {
			ctx: ctx(),
			user,
			method: 'DELETE',
			path: `/api/groceries/${item.id}`
		});
		expect(absent).toMatchObject({ status: 400, body: { error: 'scope must be mine or family' } });

		const junk = await invoke(deleteGrocery, {
			ctx: ctx(),
			user,
			method: 'DELETE',
			path: `/api/groceries/${item.id}`,
			query: { scope: 'all' }
		});
		expect(junk).toMatchObject({ status: 400, body: { error: 'scope must be mine or family' } });
		const rows = await testDb().select().from(groceryItems).where(eq(groceryItems.id, item.id));
		expect(rows.map((row) => row.id)).toEqual([item.id]);
	});

	it('answers 400 "Item ID required" for a trailing slash', async () => {
		const user = await seedUser(testDb());

		const res = await invoke(deleteGrocery, {
			ctx: ctx(),
			user,
			method: 'DELETE',
			path: '/api/groceries/',
			query: { scope: 'mine' }
		});

		expect(res).toMatchObject({ status: 400, body: { error: 'Item ID required' } });
	});

	it('answers 401 {"error":"Unauthorized"} when signed out', async () => {
		const user = await seedUser(testDb());
		const item = await seedItem({ userId: user.id, name: 'Milk' });

		const res = await invoke(deleteGrocery, {
			ctx: ctx(),
			method: 'DELETE',
			path: `/api/groceries/${item.id}`,
			query: { scope: 'mine' }
		});

		expect(res).toMatchObject({ status: 401, body: { error: 'Unauthorized' } });
	});
});

describe('GET /api/groceries/colours', () => {
	it('answers the viewer’s own colour rows plus the palette', async () => {
		const user = await seedUser(testDb());
		const other = await seedUser(testDb());
		const familyId = await seedFamily('My family');
		const otherFamilyId = await seedFamily('Other family');
		await addMember(user.id, familyId);
		await addMember(other.id, otherFamilyId);
		await seedColour({ userId: user.id, storeKey: 'aldi', color: 'sky' });
		// A family row remembers the last writer; the family tier ignores that column.
		await seedColour({ userId: other.id, familyId, storeKey: 'lidl', color: 'sage' });
		await seedColour({ userId: other.id, storeKey: 'tesco', color: 'amber' });
		await seedColour({ userId: other.id, familyId: otherFamilyId, storeKey: 'coop', color: 'slate' });

		const res = await invoke(getColours, { ctx: ctx(), user, path: '/api/groceries/colours' });

		expect(res.status).toBe(200);
		expect(res.body).toEqual({
			colours: [
				{ storeKey: 'aldi', color: 'sky', userId: user.id, familyId: null },
				{ storeKey: 'lidl', color: 'sage', userId: other.id, familyId }
			],
			palette: PALETTE
		});
	});

	it('answers only the viewer’s personal rows when they have no family', async () => {
		const user = await seedUser(testDb());
		const familyId = await seedFamily('A family I left');
		await seedColour({ userId: user.id, storeKey: 'aldi', color: 'sky' });
		await seedColour({ userId: user.id, familyId, storeKey: 'lidl', color: 'sage' });

		const res = await invoke(getColours, { ctx: ctx(), user, path: '/api/groceries/colours' });

		expect(res.status).toBe(200);
		expect(res.body).toEqual({
			colours: [{ storeKey: 'aldi', color: 'sky', userId: user.id, familyId: null }],
			palette: PALETTE
		});
	});

	it('answers 401 {"error":"Unauthorized"} when signed out', async () => {
		const res = await invoke(getColours, { ctx: ctx(), path: '/api/groceries/colours' });
		expect(res).toMatchObject({ status: 401, body: { error: 'Unauthorized' } });
	});
});

describe('PATCH /api/groceries/colours', () => {
	it('writes the viewer’s personal colour under the normalized store key', async () => {
		const user = await seedUser(testDb());

		const res = await invoke(patchColours, {
			ctx: ctx(),
			user,
			method: 'PATCH',
			path: '/api/groceries/colours',
			body: { store: ' Aldi ', color: 'sky' }
		});

		expect(res.status).toBe(200);
		expect(res.body).toEqual({ ok: true });
		expect(await colourRows()).toEqual([
			{ storeKey: 'aldi', color: 'sky', userId: user.id, familyId: null }
		]);
	});

	it('updates the same personal row in place on a second write', async () => {
		const user = await seedUser(testDb());
		const path = '/api/groceries/colours';

		await invoke(patchColours, {
			ctx: ctx(),
			user,
			method: 'PATCH',
			path,
			body: { store: 'Aldi', color: 'sky' }
		});
		const res = await invoke(patchColours, {
			ctx: ctx(),
			user,
			method: 'PATCH',
			path,
			body: { store: 'aldi', color: 'sage' }
		});

		expect(res.status).toBe(200);
		expect(res.body).toEqual({ ok: true });
		expect(await colourRows()).toEqual([
			{ storeKey: 'aldi', color: 'sage', userId: user.id, familyId: null }
		]);
	});

	it('treats any scope other than family as personal', async () => {
		const user = await seedUser(testDb());

		const res = await invoke(patchColours, {
			ctx: ctx(),
			user,
			method: 'PATCH',
			path: '/api/groceries/colours',
			body: { store: 'Aldi', color: 'sky', scope: 'all' }
		});

		expect(res.status).toBe(200);
		expect(res.body).toEqual({ ok: true });
		expect(await colourRows()).toEqual([
			{ storeKey: 'aldi', color: 'sky', userId: user.id, familyId: null }
		]);
	});

	// #086 fix-in-port: the family write upserts with
	// `on conflict ("family_id","store_key")`, and Postgres cannot infer the partial
	// unique index (family_id IS NOT NULL) without the predicate, so the statement
	// faults and the route answers 500. S6 fixes this in its own
	// `rewrite(groceries): fix-in-port #086` commit and flips this golden to 200 {ok:true}.
	it('faults with 500 on a family write — #086: partial index not inferred', async () => {
		const user = await seedUser(testDb());
		const familyId = await seedFamily('My family');
		await addMember(user.id, familyId);

		const res = await invoke(patchColours, {
			ctx: ctx(),
			user,
			method: 'PATCH',
			path: '/api/groceries/colours',
			body: { store: 'Aldi', color: 'sky', scope: 'family' }
		});

		expect(res.status).toBe(500);
		expect(res.body).toEqual({ error: 'Failed to set the colour' });
		expect(await colourRows()).toEqual([]);
	});

	it('answers 400 "No family to set a family colour on" without a family', async () => {
		const user = await seedUser(testDb());

		const res = await invoke(patchColours, {
			ctx: ctx(),
			user,
			method: 'PATCH',
			path: '/api/groceries/colours',
			body: { store: 'Aldi', color: 'sky', scope: 'family' }
		});

		expect(res).toMatchObject({
			status: 400,
			body: { error: 'No family to set a family colour on' }
		});
	});

	it('auto clears one store’s personal colour and leaves the other', async () => {
		const user = await seedUser(testDb());
		await seedColour({ userId: user.id, storeKey: 'aldi', color: 'sky' });
		await seedColour({ userId: user.id, storeKey: 'lidl', color: 'sage' });

		const res = await invoke(patchColours, {
			ctx: ctx(),
			user,
			method: 'PATCH',
			path: '/api/groceries/colours',
			body: { store: 'Aldi', color: 'auto' }
		});

		expect(res.status).toBe(200);
		expect(res.body).toEqual({ ok: true });
		expect(await colourRows()).toEqual([
			{ storeKey: 'lidl', color: 'sage', userId: user.id, familyId: null }
		]);
	});

	it('auto clears the family row only when the scope is family', async () => {
		const user = await seedUser(testDb());
		const other = await seedUser(testDb());
		const familyId = await seedFamily('My family');
		await addMember(user.id, familyId);
		await seedColour({ userId: user.id, storeKey: 'aldi', color: 'sky' });
		await seedColour({ userId: other.id, familyId, storeKey: 'aldi', color: 'sage' });

		const res = await invoke(patchColours, {
			ctx: ctx(),
			user,
			method: 'PATCH',
			path: '/api/groceries/colours',
			body: { store: 'aldi', color: 'auto', scope: 'family' }
		});

		expect(res.status).toBe(200);
		expect(res.body).toEqual({ ok: true });
		expect(await colourRows()).toEqual([
			{ storeKey: 'aldi', color: 'sky', userId: user.id, familyId: null }
		]);
	});

	it('answers 400 for a colour outside the declared palette', async () => {
		const user = await seedUser(testDb());

		const res = await invoke(patchColours, {
			ctx: ctx(),
			user,
			method: 'PATCH',
			path: '/api/groceries/colours',
			body: { store: 'Aldi', color: '#ff0000' }
		});

		expect(res).toMatchObject({
			status: 400,
			body: { error: 'That store or colour cannot take a colour' }
		});
		expect(await colourRows()).toEqual([]);
	});

	it('answers 400 for a blank store and for the no-store group', async () => {
		const user = await seedUser(testDb());

		for (const store of ['   ', 'Any store']) {
			const res = await invoke(patchColours, {
				ctx: ctx(),
				user,
				method: 'PATCH',
				path: '/api/groceries/colours',
				body: { store, color: 'sky' }
			});
			expect(res).toMatchObject({
				status: 400,
				body: { error: 'That store or colour cannot take a colour' }
			});
		}
		expect(await colourRows()).toEqual([]);
	});

	it('answers 400 "store and color are required" for a missing or non-string field', async () => {
		const user = await seedUser(testDb());
		const bodies: JsonValue[] = [
			{ color: 'sky' },
			{ store: 'Aldi' },
			{ store: 'Aldi', color: 5 }
		];

		for (const body of bodies) {
			const res = await invoke(patchColours, {
				ctx: ctx(),
				user,
				method: 'PATCH',
				path: '/api/groceries/colours',
				body
			});
			expect(res).toMatchObject({ status: 400, body: { error: 'store and color are required' } });
		}
	});

	it('answers 400 "Invalid JSON body" for a malformed body', async () => {
		const user = await seedUser(testDb());

		const res = await invoke(patchColours, {
			ctx: ctx(),
			user,
			method: 'PATCH',
			path: '/api/groceries/colours',
			rawBody: '{'
		});

		expect(res).toMatchObject({ status: 400, body: { error: 'Invalid JSON body' } });
	});

	it('answers 401 {"error":"Unauthorized"} when signed out', async () => {
		const res = await invoke(patchColours, {
			ctx: ctx(),
			path: '/api/groceries/colours',
			body: { store: 'Aldi', color: 'sky' }
		});
		expect(res).toMatchObject({ status: 401, body: { error: 'Unauthorized' } });
	});
});
