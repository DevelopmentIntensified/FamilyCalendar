/**
 * groceries services against real Postgres: one test per IO Invariant, titled
 * after the rule. Each runs in `rollbackTest`; `testCtx({ db, now })` supplies
 * the clock, so a stamped `checkedAt` is asserted instead of trusted.
 *
 * The scope rules are the ones this file proves hardest: a row outside the
 * requested scope is a 404, never a 403, and `scope: 'family'` resolves through
 * `family`'s `familyIdForActor` (a membership row), so a viewer with no family
 * gets the wire's 400.
 *
 * Expected values come from the legacy actions
 * (`src/lib/server/db/actions/groceries.ts`) and the frozen golden
 * `groceries.http.db.test.ts`.
 *
 * Doc: ./README.md#how-to-test
 */
import { eq, sql } from 'drizzle-orm';
import { describe, expect } from 'vitest';
import { actorFromUser } from '$lib/kernel/ctx/actor';
import type { Db } from '$lib/kernel/db/database.server';
import {
	groceryItems,
	groceryStoreColours,
	groceryStoreMemory
} from '$lib/kernel/db/tables.server';
import { seedUser } from '$lib/kernel/testing/seedRows.server';
import { invokeLoad } from '$lib/kernel/testing/invokeHandlers.server';
import { testCtx } from '$lib/kernel/testing/testCtx.server';
import { rollbackTest } from '$lib/kernel/testing/testDb.server';
import {
	GROCERY_COLOUR_REFUSED_MESSAGE,
	GROCERY_ITEM_NOT_FOUND_MESSAGE,
	GROCERY_NAME_REQUIRED_MESSAGE,
	GROCERY_NO_FAMILY_COLOUR_MESSAGE,
	GROCERY_NO_FAMILY_MOVE_MESSAGE,
	GROCERY_OP_MESSAGE,
	GROCERY_SCOPE_MESSAGE
} from './groceries.contract';
import {
	seedGroceryColour,
	seedGroceryFamily,
	seedGroceryItem,
	seedGroceryMembership,
	seedGroceryMemory
} from './groceries.fixtures.server';
import { groceriesPageLoad } from './groceries.http.server';
import {
	createGroceryItem,
	deleteGroceryItem,
	listGroceryItems,
	listGroceryStoreColours,
	loadGroceriesPage,
	setGroceryStoreColour,
	suggestGroceryStore,
	updateGroceryItem
} from './groceries.service.server';

const NOW = '2026-03-01T09:00:00.000Z';

function ctxFor(db: Db) {
	return testCtx({ db, now: NOW });
}

/** The wire's two scopes, plus the actor everyone in these tests acts as. */
async function seedViewer(db: Db, withFamily = false) {
	const user = await seedUser(db);
	const actor = actorFromUser(user, 'session');
	if (!withFamily) return { user, actor, familyId: null as string | null };
	const familyId = (await seedGroceryFamily(db)).id;
	await seedGroceryMembership(db, user.id, familyId);
	return { user, actor, familyId };
}

describe('listGroceryItems', () => {
	rollbackTest('answers the open Mine items oldest first, never a checked, foreign or Family row', async (db) => {
		const { user, actor } = await seedViewer(db);
		const other = await seedUser(db);
		const family = await seedGroceryFamily(db);
		const older = await seedGroceryItem(db, {
			userId: user.id,
			name: 'Milk',
			createdAt: new Date('2026-01-01T00:00:00Z')
		});
		const newer = await seedGroceryItem(db, {
			userId: user.id,
			name: 'Eggs',
			createdAt: new Date('2026-01-02T00:00:00Z')
		});
		await seedGroceryItem(db, { userId: user.id, name: 'Bread', checkedAt: NOW });
		await seedGroceryItem(db, { userId: other.id, name: 'Beer' });
		await seedGroceryItem(db, { userId: user.id, name: 'Family milk', familyId: family.id });

		const rows = await listGroceryItems(ctxFor(db), actor, { scope: 'mine' });

		expect(rows.map((row) => row.id)).toEqual([older.id, newer.id]);
	});

	rollbackTest('answers the Family list only from the viewer’s own family', async (db) => {
		const { user, actor, familyId } = await seedViewer(db, true);
		const other = await seedUser(db);
		const otherFamily = await seedGroceryFamily(db, 'Other');
		await seedGroceryMembership(db, other.id, otherFamily.id);
		const familyItem = await seedGroceryItem(db, {
			userId: other.id,
			name: 'Milk',
			familyId: familyId
		});
		await seedGroceryItem(db, { userId: other.id, name: 'Beer', familyId: otherFamily.id });
		await seedGroceryItem(db, { userId: user.id, name: 'Pasta' });

		const rows = await listGroceryItems(ctxFor(db), actor, { scope: 'family' });

		expect(rows.map((row) => row.id)).toEqual([familyItem.id]);
	});

	rollbackTest('answers 400 "scope must be mine or family" for family scope without a family', async (db) => {
		const { actor } = await seedViewer(db);

		await expect(
			listGroceryItems(ctxFor(db), actor, { scope: 'family' })
		).rejects.toMatchObject({ code: 'invalid', message: GROCERY_SCOPE_MESSAGE });
	});
});

describe('suggestGroceryStore', () => {
	rollbackTest('picks the highest-count remembered store, ties going to the first row seen', async (db) => {
		const { user, actor } = await seedViewer(db);
		await seedGroceryMemory(db, { userId: user.id, nameKey: 'milk', store: 'Aldi', count: 2 });
		await seedGroceryMemory(db, { userId: user.id, nameKey: 'milk', store: 'Lidl', count: 5 });

		expect(
			await suggestGroceryStore(ctxFor(db), actor, { scope: 'mine', name: '  Milk  ' })
		).toBe('Lidl');

		await seedGroceryMemory(db, { userId: user.id, nameKey: 'eggs', store: 'Aldi', count: 3 });
		await seedGroceryMemory(db, { userId: user.id, nameKey: 'eggs', store: 'Lidl', count: 3 });
		expect(await suggestGroceryStore(ctxFor(db), actor, { scope: 'mine', name: 'eggs' })).toBe(
			'Aldi'
		);
	});

	rollbackTest('answers null when Store Memory knows nothing or the name is blank', async (db) => {
		const { actor } = await seedViewer(db);
		const ctx = ctxFor(db);

		expect(await suggestGroceryStore(ctx, actor, { scope: 'mine', name: 'Unicorn' })).toBeNull();
		expect(await suggestGroceryStore(ctx, actor, { scope: 'mine', name: '   ' })).toBeNull();
	});
});

describe('createGroceryItem', () => {
	rollbackTest('quick-adds a quantity and clamps it to at least 1', async (db) => {
		const { user, actor } = await seedViewer(db);
		const ctx = ctxFor(db);

		const trailing = await createGroceryItem(ctx, actor, { scope: 'mine', input: 'milk 2' });
		expect([trailing.name, trailing.nameKey, trailing.quantity, trailing.stores]).toEqual([
			'milk',
			'milk',
			2,
			[]
		]);
		expect(trailing.createdAt.toISOString()).toBe(NOW);

		const clamped = await createGroceryItem(ctx, actor, { scope: 'mine', input: 'milk 0' });
		expect(clamped.quantity).toBe(1);
		expect(await testDbRows(db, user.id)).toHaveLength(2);
	});

	rollbackTest('cleans the stores it is given and trains Store Memory with them', async (db) => {
		const { user, actor } = await seedViewer(db);

		const item = await createGroceryItem(ctxFor(db), actor, {
			scope: 'mine',
			input: 'milk',
			stores: [' Aldi ', 'aldi', 'Lidl']
		});

		expect(item.stores).toEqual(['Aldi', 'Lidl']);
		expect(await memoryOf(db, user.id)).toEqual([
			{ nameKey: 'milk', store: 'Aldi', count: 1, familyId: null },
			{ nameKey: 'milk', store: 'Lidl', count: 1, familyId: null }
		]);
	});

	rollbackTest('auto-fills the remembered store instead of training memory again', async (db) => {
		const { user, actor } = await seedViewer(db);
		await seedGroceryMemory(db, { userId: user.id, nameKey: 'milk', store: 'Aldi', count: 2 });

		const item = await createGroceryItem(ctxFor(db), actor, { scope: 'mine', input: 'Milk' });

		expect(item.stores).toEqual(['Aldi']);
		expect(await memoryOf(db, user.id)).toEqual([
			{ nameKey: 'milk', store: 'Aldi', count: 2, familyId: null }
		]);
	});

	rollbackTest('trains Family Store Memory under the family, not the user', async (db) => {
		const { user, actor, familyId } = await seedViewer(db, true);

		const item = await createGroceryItem(ctxFor(db), actor, {
			scope: 'family',
			input: 'milk',
			stores: ['Lidl']
		});

		expect([item.userId, item.familyId]).toEqual([user.id, familyId]);
		expect(await memoryOf(db, user.id)).toEqual([
			{ nameKey: 'milk', store: 'Lidl', count: 1, familyId }
		]);
	});

	rollbackTest('answers 400 "Name is required" for a blank quick-add', async (db) => {
		const { actor } = await seedViewer(db);

		await expect(
			createGroceryItem(ctxFor(db), actor, { scope: 'mine', input: '   ' })
		).rejects.toMatchObject({ code: 'invalid', message: GROCERY_NAME_REQUIRED_MESSAGE });
	});

	rollbackTest('answers the scope 400 for family scope without a family, writing nothing', async (db) => {
		const { user, actor } = await seedViewer(db);

		await expect(
			createGroceryItem(ctxFor(db), actor, { scope: 'family', input: 'milk' })
		).rejects.toMatchObject({ code: 'invalid', message: GROCERY_SCOPE_MESSAGE });
		expect(await testDbRows(db, user.id)).toEqual([]);
	});
});

describe('updateGroceryItem', () => {
	rollbackTest('checks an item off with the ctx clock and unchecks it back onto the list', async (db) => {
		const { user, actor } = await seedViewer(db);
		const item = await seedGroceryItem(db, { userId: user.id, name: 'Milk' });
		const ctx = ctxFor(db);

		await updateGroceryItem(ctx, actor, { scope: 'mine', id: item.id, op: 'check' });
		expect(await checkedAtMillis(db, item.id)).toBe(new Date(NOW).getTime());

		await updateGroceryItem(ctx, actor, { scope: 'mine', id: item.id, op: 'uncheck' });
		expect(await checkedAtMillis(db, item.id)).toBeNull();
	});

	rollbackTest('replaces the stores and trains Store Memory from the new list', async (db) => {
		const { user, actor } = await seedViewer(db);
		const item = await seedGroceryItem(db, { userId: user.id, name: 'milk', stores: ['Aldi'] });
		await seedGroceryMemory(db, { userId: user.id, nameKey: 'milk', store: 'Aldi', count: 3 });

		await updateGroceryItem(ctxFor(db), actor, {
			scope: 'mine',
			id: item.id,
			op: 'stores',
			stores: ['Lidl', '  lidl ', 'Aldi']
		});

		expect(await storesOf(db, item.id)).toEqual(['Lidl', 'Aldi']);
		expect(await memoryOf(db, user.id)).toEqual([
			{ nameKey: 'milk', store: 'Aldi', count: 4, familyId: null },
			{ nameKey: 'milk', store: 'Lidl', count: 1, familyId: null }
		]);
	});

	rollbackTest('accepts an empty store list and so clears every store on the row (Q-037)', async (db) => {
		const { user, actor } = await seedViewer(db);
		const item = await seedGroceryItem(db, { userId: user.id, name: 'milk', stores: ['Aldi', 'Lidl'] });

		await updateGroceryItem(ctxFor(db), actor, {
			scope: 'mine',
			id: item.id,
			op: 'stores',
			stores: []
		});

		expect(await storesOf(db, item.id)).toEqual([]);
	});

	rollbackTest('moving a Family item to Mine re-owns it to the mover', async (db) => {
		const { user, actor, familyId } = await seedViewer(db, true);
		if (!familyId) throw new Error('seedViewer(db, true) seeds a family');
		const other = await seedUser(db);
		await seedGroceryMembership(db, other.id, familyId);
		const item = await seedGroceryItem(db, { userId: other.id, name: 'Milk', familyId });

		await updateGroceryItem(ctxFor(db), actor, {
			scope: 'family',
			id: item.id,
			op: 'move',
			target: 'mine'
		});

		const [row] = await db.select().from(groceryItems).where(eq(groceryItems.id, item.id));
		expect([row.userId, row.familyId]).toEqual([user.id, null]);
	});

	rollbackTest('moves a Mine item onto the Family list', async (db) => {
		const { user, actor, familyId } = await seedViewer(db, true);
		const item = await seedGroceryItem(db, { userId: user.id, name: 'Milk' });

		await updateGroceryItem(ctxFor(db), actor, {
			scope: 'mine',
			id: item.id,
			op: 'move',
			target: 'family'
		});

		const [row] = await db.select().from(groceryItems).where(eq(groceryItems.id, item.id));
		expect([row.userId, row.familyId]).toEqual([user.id, familyId]);
	});

	rollbackTest('answers 400 "No family to move to" without a family', async (db) => {
		const { user, actor } = await seedViewer(db);
		const item = await seedGroceryItem(db, { userId: user.id, name: 'Milk' });

		await expect(
			updateGroceryItem(ctxFor(db), actor, {
				scope: 'mine',
				id: item.id,
				op: 'move',
				target: 'family'
			})
		).rejects.toMatchObject({ code: 'invalid', message: GROCERY_NO_FAMILY_MOVE_MESSAGE });
	});

	rollbackTest('answers 400 "op must be check, uncheck, stores, or move" for every op it cannot run', async (db) => {
		const { user, actor } = await seedViewer(db);
		const item = await seedGroceryItem(db, { userId: user.id, name: 'Milk' });
		const ctx = ctxFor(db);
		const bodies: Record<string, unknown>[] = [
			{},
			{ op: 'explode' },
			{ op: 'stores' },
			{ op: 'stores', stores: 'Aldi' },
			{ op: 'move', target: 'all' }
		];

		for (const body of bodies) {
			await expect(
				updateGroceryItem(ctx, actor, { scope: 'mine', id: item.id, ...body })
			).rejects.toMatchObject({ code: 'invalid', message: GROCERY_OP_MESSAGE });
		}
	});

	rollbackTest('answers the one 404 for an unknown id, another person’s item and another family’s item', async (db) => {
		const { actor } = await seedViewer(db, true);
		const other = await seedUser(db);
		const otherFamily = await seedGroceryFamily(db, 'Other');
		await seedGroceryMembership(db, other.id, otherFamily.id);
		const foreignMine = await seedGroceryItem(db, { userId: other.id, name: 'Milk' });
		const foreignFamily = await seedGroceryItem(db, {
			userId: other.id,
			name: 'Beer',
			familyId: otherFamily.id
		});
		const ctx = ctxFor(db);

		for (const input of [
			{ scope: 'mine' as const, id: 'does-not-exist' },
			{ scope: 'mine' as const, id: foreignMine.id },
			{ scope: 'family' as const, id: foreignFamily.id }
		]) {
			await expect(updateGroceryItem(ctx, actor, { ...input, op: 'check' })).rejects.toMatchObject({
				code: 'notFound',
				message: GROCERY_ITEM_NOT_FOUND_MESSAGE
			});
		}
		// The viewer's own family list stays the one they belong to.
		expect(await listGroceryItems(ctx, actor, { scope: 'family' })).toEqual([]);
	});
});

describe('deleteGroceryItem', () => {
	rollbackTest('removes the row and keeps Store Memory', async (db) => {
		const { user, actor } = await seedViewer(db);
		const item = await seedGroceryItem(db, { userId: user.id, name: 'milk', stores: ['Aldi'] });
		await seedGroceryMemory(db, { userId: user.id, nameKey: 'milk', store: 'Aldi', count: 2 });

		await deleteGroceryItem(ctxFor(db), actor, { scope: 'mine', id: item.id });

		expect(await testDbRows(db, user.id)).toEqual([]);
		expect(await memoryOf(db, user.id)).toEqual([
			{ nameKey: 'milk', store: 'Aldi', count: 2, familyId: null }
		]);
	});

	rollbackTest('answers 404 for another person’s item and leaves it in place', async (db) => {
		const { actor } = await seedViewer(db);
		const other = await seedUser(db);
		const item = await seedGroceryItem(db, { userId: other.id, name: 'Milk' });

		await expect(
			deleteGroceryItem(ctxFor(db), actor, { scope: 'mine', id: item.id })
		).rejects.toMatchObject({ code: 'notFound', message: GROCERY_ITEM_NOT_FOUND_MESSAGE });
		const [row] = await db.select().from(groceryItems).where(eq(groceryItems.id, item.id));
		expect(row.id).toBe(item.id);
	});
});

describe('listGroceryStoreColours', () => {
	rollbackTest('answers the viewer’s personal rows and their family’s, never another person’s, plus the palette', async (db) => {
		const { user, actor, familyId } = await seedViewer(db, true);
		const other = await seedUser(db);
		const otherFamily = await seedGroceryFamily(db, 'Other');
		await seedGroceryMembership(db, other.id, otherFamily.id);
		await seedGroceryColour(db, { userId: user.id, storeKey: 'aldi', color: 'sky' });
		await seedGroceryColour(db, {
			userId: other.id,
			familyId,
			storeKey: 'lidl',
			color: 'sage'
		});
		await seedGroceryColour(db, { userId: other.id, storeKey: 'tesco', color: 'amber' });
		await seedGroceryColour(db, {
			userId: other.id,
			familyId: otherFamily.id,
			storeKey: 'coop',
			color: 'slate'
		});

		const response = await listGroceryStoreColours(ctxFor(db), actor);

		expect(response.colours).toEqual([
			{ storeKey: 'aldi', color: 'sky', userId: user.id, familyId: null },
			{ storeKey: 'lidl', color: 'sage', userId: other.id, familyId }
		]);
		expect(response.palette).toEqual([
			{ key: 'terracotta', label: 'Terracotta' },
			{ key: 'sky', label: 'Blue' },
			{ key: 'sage', label: 'Mint' },
			{ key: 'lilac', label: 'Lavender' },
			{ key: 'amber', label: 'Amber' },
			{ key: 'slate', label: 'Slate' }
		]);
	});

	rollbackTest('answers only the viewer’s personal rows when they have no family', async (db) => {
		const { user, actor } = await seedViewer(db);
		const family = await seedGroceryFamily(db, 'A family I left');
		await seedGroceryColour(db, { userId: user.id, storeKey: 'aldi', color: 'sky' });
		await seedGroceryColour(db, { userId: user.id, familyId: family.id, storeKey: 'lidl', color: 'sage' });

		const response = await listGroceryStoreColours(ctxFor(db), actor);

		expect(response.colours).toEqual([
			{ storeKey: 'aldi', color: 'sky', userId: user.id, familyId: null }
		]);
	});
});

describe('setGroceryStoreColour', () => {
	rollbackTest('writes the viewer’s personal colour under the normalized store key', async (db) => {
		const { user, actor } = await seedViewer(db);

		await setGroceryStoreColour(ctxFor(db), actor, { store: ' Aldi ', color: 'sky' });

		expect(await coloursOf(db)).toEqual([
			{ storeKey: 'aldi', color: 'sky', userId: user.id, familyId: null }
		]);
	});

	rollbackTest('updates the same personal row in place on a second write', async (db) => {
		const { user, actor } = await seedViewer(db);
		const ctx = ctxFor(db);

		await setGroceryStoreColour(ctx, actor, { store: 'Aldi', color: 'sky' });
		await setGroceryStoreColour(ctx, actor, { store: 'aldi', color: 'sage' });

		expect(await coloursOf(db)).toEqual([
			{ storeKey: 'aldi', color: 'sage', userId: user.id, familyId: null }
		]);
	});

	rollbackTest('treats any scope other than family as personal', async (db) => {
		const { user, actor } = await seedViewer(db);

		await setGroceryStoreColour(ctxFor(db), actor, {
			store: 'Aldi',
			color: 'sky',
			scope: 'all'
		});

		expect(await coloursOf(db)).toEqual([
			{ storeKey: 'aldi', color: 'sky', userId: user.id, familyId: null }
		]);
	});

	rollbackTest('auto clears one store’s personal colour and leaves the other', async (db) => {
		const { user, actor } = await seedViewer(db);
		await seedGroceryColour(db, { userId: user.id, storeKey: 'aldi', color: 'sky' });
		await seedGroceryColour(db, { userId: user.id, storeKey: 'lidl', color: 'sage' });

		await setGroceryStoreColour(ctxFor(db), actor, { store: 'Aldi', color: 'auto' });

		expect(await coloursOf(db)).toEqual([
			{ storeKey: 'lidl', color: 'sage', userId: user.id, familyId: null }
		]);
	});

	rollbackTest('auto clears the family row only when the scope is family', async (db) => {
		const { user, actor, familyId } = await seedViewer(db, true);
		if (!familyId) throw new Error('seedViewer(db, true) seeds a family');
		const other = await seedUser(db);
		await seedGroceryMembership(db, other.id, familyId);
		await seedGroceryColour(db, { userId: user.id, storeKey: 'aldi', color: 'sky' });
		await seedGroceryColour(db, {
			userId: other.id,
			familyId,
			storeKey: 'aldi',
			color: 'sage'
		});

		await setGroceryStoreColour(ctxFor(db), actor, {
			store: 'aldi',
			color: 'auto',
			scope: 'family'
		});

		expect(await coloursOf(db)).toEqual([
			{ storeKey: 'aldi', color: 'sky', userId: user.id, familyId: null }
		]);
	});

	rollbackTest('answers 400 "No family to set a family colour on" without a family', async (db) => {
		const { actor } = await seedViewer(db);

		await expect(
			setGroceryStoreColour(ctxFor(db), actor, { store: 'Aldi', color: 'sky', scope: 'family' })
		).rejects.toMatchObject({ code: 'invalid', message: GROCERY_NO_FAMILY_COLOUR_MESSAGE });
	});

	rollbackTest('rejects a colour outside the declared palette, a blank store and the no-store group', async (db) => {
		const { actor } = await seedViewer(db);
		const ctx = ctxFor(db);
		const bodies = [
			{ store: 'Aldi', color: '#ff0000' },
			{ store: '   ', color: 'sky' },
			{ store: 'Any store', color: 'sky' }
		];

		for (const body of bodies) {
			await expect(setGroceryStoreColour(ctx, actor, body)).rejects.toMatchObject({
				code: 'invalid',
				message: GROCERY_COLOUR_REFUSED_MESSAGE
			});
		}
		expect(await coloursOf(db)).toEqual([]);
	});

	rollbackTest('writes a family colour and updates it in place (Q-039 B)', async (db) => {
		const { user, actor, familyId } = await seedViewer(db, true);
		const ctx = ctxFor(db);

		await setGroceryStoreColour(ctx, actor, { store: 'Aldi', color: 'sky', scope: 'family' });
		await setGroceryStoreColour(ctx, actor, { store: 'aldi', color: 'sage', scope: 'family' });

		expect(await coloursOf(db)).toEqual([
			{ storeKey: 'aldi', color: 'sage', userId: user.id, familyId }
		]);
	});
});

describe('loadGroceriesPage', () => {
	rollbackTest('reads both item legs and the colour rows in one call', async (db) => {
		const { user, actor, familyId } = await seedViewer(db, true);
		const mine = await seedGroceryItem(db, { userId: user.id, name: 'Milk' });
		const family = await seedGroceryItem(db, { userId: user.id, name: 'Bread', familyId });
		await seedGroceryColour(db, { userId: user.id, storeKey: 'aldi', color: 'sky' });

		const page = await loadGroceriesPage(ctxFor(db), actor);

		expect(page.mine.map((row) => row.id)).toEqual([mine.id]);
		expect(page.family.map((row) => row.id)).toEqual([family.id]);
		expect(page.colours).toEqual([
			{ storeKey: 'aldi', color: 'sky', userId: user.id, familyId: null }
		]);
		expect([page.hasFamily, page.userId, page.familyId]).toEqual([true, user.id, familyId]);
	});

	rollbackTest('answers no Family leg for a viewer without a family', async (db) => {
		const { user, actor } = await seedViewer(db);

		const page = await loadGroceriesPage(ctxFor(db), actor);

		expect(page.family).toEqual([]);
		expect([page.hasFamily, page.userId, page.familyId]).toEqual([false, user.id, null]);
	});

	rollbackTest('degrades every failed leg to [] instead of failing the page', async (db) => {
		const { user, actor, familyId } = await seedViewer(db, true);
		const ctx = ctxFor(db);
		// A database that answers the membership read (the actor's family, as legacy
		// resolved it before its legs) and then fails: each leg's catch must turn the
		// failure into its own empty list, which is what the legacy `leg()` wrapper did.
		let answered = 0;
		const flaky = new Proxy(ctx.db, {
			get(target, property, receiver) {
				if (property === 'select') {
					return (...args: unknown[]) => {
						answered += 1;
						if (answered > 1) throw new Error('database is down');
						return Reflect.apply(target.select, target, args) as unknown;
					};
				}
				const value = Reflect.get(target, property, receiver) as unknown;
				return typeof value === 'function' ? value.bind(target) : value;
			}
		}) as Db;

		const page = await loadGroceriesPage({ ...ctx, db: flaky }, actor);

		expect([page.mine, page.family, page.colours]).toEqual([[], [], []]);
		expect([page.hasFamily, page.userId, page.familyId]).toEqual([true, user.id, familyId]);
	});

	rollbackTest('redirects a signed-out viewer to /login', async (db) => {
		await expect(
			invokeLoad(groceriesPageLoad, { ctx: ctxFor(db), path: '/calendar/groceries' })
		).rejects.toMatchObject({ status: 302, location: '/login' });
	});
});

// --- Row reads the assertions share -----------------------------------------

async function testDbRows(db: Db, userId: string) {
	return await db.select().from(groceryItems).where(eq(groceryItems.userId, userId));
}

/** The stored `checkedAt` as epoch milliseconds, whatever text the driver hands back. */
async function checkedAtMillis(db: Db, id: string): Promise<number | null> {
	const [row] = await db
		.select({ at: sql<string | null>`extract(epoch from ${groceryItems.checkedAt}) * 1000` })
		.from(groceryItems)
		.where(eq(groceryItems.id, id));
	return !row || row.at === null ? null : Number(row.at);
}

async function storesOf(db: Db, id: string): Promise<string[]> {
	const [row] = await db
		.select({ stores: groceryItems.stores })
		.from(groceryItems)
		.where(eq(groceryItems.id, id));
	return row.stores;
}

async function memoryOf(db: Db, userId: string) {
	return await db
		.select({
			nameKey: groceryStoreMemory.nameKey,
			store: groceryStoreMemory.store,
			count: groceryStoreMemory.count,
			familyId: groceryStoreMemory.familyId
		})
		.from(groceryStoreMemory)
		.where(eq(groceryStoreMemory.userId, userId))
		.orderBy(groceryStoreMemory.store);
}

async function coloursOf(db: Db) {
	return await db
		.select({
			storeKey: groceryStoreColours.storeKey,
			color: groceryStoreColours.color,
			userId: groceryStoreColours.userId,
			familyId: groceryStoreColours.familyId
		})
		.from(groceryStoreColours)
		.orderBy(groceryStoreColours.storeKey);
}
