/**
 * groceries services: one function per use case, `(ctx, actor, input)`.
 *
 * Authorization lives here, and it is the SCOPE itself: a row outside the
 * requested scope (another person's Mine row, another family's row, an
 * unknown id) is indistinguishable from a missing one and answers the one 404,
 * so this module never leaks an existence it did not resolve. The API's `scope`
 * becomes a `GroceryScope` through `family`'s `familyIdForActor` (rank 4, so a
 * direct call through its entry): membership is family's rule, and
 * `familyId: null` is the actor's own list.
 *
 * The wire's rules live one home each: quick-add, store cleaning, the memory
 * pick and the op narrowing are the rules file; the queries are the repo; this
 * file is the use-case that sequences them. Time comes from `ctx.clock.now()`,
 * and the add / store-edit writes run in one `withTx` so an item and the Store
 * Memory it trains cannot disagree.
 *
 * Doc: ./README.md#public-interface
 */
import type { Actor } from '$lib/kernel/ctx/actor';
import type { Ctx } from '$lib/kernel/ctx/ctx.server';
import { withTx } from '$lib/kernel/db/database.server';
import type { GroceryItemRow } from '$lib/kernel/db/tables.server';
import { invalid, notFound } from '$lib/kernel/errors/appError';
import { familyIdForActor } from '$lib/domains/family/index.server';
import {
	GROCERY_COLOUR_REFUSED_MESSAGE,
	GROCERY_ITEM_NOT_FOUND_MESSAGE,
	GROCERY_NAME_REQUIRED_MESSAGE,
	GROCERY_NO_FAMILY_COLOUR_MESSAGE,
	GROCERY_NO_FAMILY_MOVE_MESSAGE,
	GROCERY_OP_MESSAGE,
	GROCERY_SCOPE_MESSAGE,
	type GroceriesPageData,
	type GroceryColoursResponse,
	type StoreColourRow
} from './groceries.contract';
import {
	STORE_COLOURS,
	groceryColourKeyOf,
	groceryColourScopeOf,
	isStoreColourKey
} from './groceries.colours.rules';
import {
	clampGroceryQuantity,
	cleanGroceryStores,
	groceryChangeOf,
	matchingGroceryMemoryRow,
	mostFrequentGroceryStore,
	normalizeGroceryName,
	parseGroceryQuickAdd
} from './groceries.items.rules';
import {
	checkGroceryItem,
	deleteGroceryColour,
	incrementGroceryMemory,
	insertGroceryItem,
	insertGroceryMemory,
	listGroceryColourRows,
	listGroceryMemoryRows,
	listOpenGroceryItems,
	moveGroceryItem as moveGroceryItemRow,
	removeGroceryItem as removeGroceryItemRow,
	setGroceryItemStores,
	uncheckGroceryItem,
	upsertGroceryColour
} from './groceries.repo.server';
import type { GroceryListScope, GroceryScope } from './groceries.scope.rules';

// --- Scope ------------------------------------------------------------------

/**
 * The list a call acts on. `mine` is always the actor's own rows; `family`
 * asks the `family` port for the actor's family and refuses with the caller's
 * message when there is none (`scope must be mine or family` on a read/write,
 * `No family to move to` on a move — the wire keeps both).
 */
async function groceryScopeFor(
	ctx: Ctx,
	actor: Actor,
	scope: GroceryListScope,
	noFamilyMessage: string
): Promise<GroceryScope> {
	if (scope === 'mine') return { userId: actor.id, familyId: null };
	const familyId = await familyIdForActor(ctx, actor);
	if (!familyId) throw invalid(noFamilyMessage);
	return { userId: actor.id, familyId };
}

// --- Store Memory -----------------------------------------------------------

/**
 * Confirm each cleaned store once for an item name: the remembered row's count
 * goes up, or a new row starts at 1. Stores arrive cleaned and de-duplicated,
 * so one read of the scope's rows answers every store in the list.
 */
async function trainGroceryMemory(
	ctx: Ctx,
	scope: GroceryScope,
	nameKey: string,
	stores: readonly string[]
): Promise<void> {
	if (stores.length === 0) return;
	const rows = await listGroceryMemoryRows(ctx.db, scope, nameKey);
	const now = ctx.clock.now();
	for (const store of stores) {
		const existing = matchingGroceryMemoryRow(rows, store);
		if (existing) await incrementGroceryMemory(ctx.db, existing.id, now);
		else await insertGroceryMemory(ctx.db, { scope, nameKey, store, now });
	}
}

/**
 * A new item's stores: a list the caller typed is trained into Store Memory
 * and stored as given (cleaned); no list at all auto-fills the one store the
 * scope remembers most often, which trains nothing.
 */
async function groceryStoresFor(
	ctx: Ctx,
	scope: GroceryScope,
	nameKey: string,
	stores: readonly string[]
): Promise<string[]> {
	if (stores.length > 0) {
		await trainGroceryMemory(ctx, scope, nameKey, stores);
		return [...stores];
	}
	const suggested = mostFrequentGroceryStore(await listGroceryMemoryRows(ctx.db, scope, nameKey));
	return suggested ? [suggested] : [];
}

// --- Items ------------------------------------------------------------------

/** `GET /api/groceries`: the open items of one scope, oldest first. */
export async function listGroceryItems(
	ctx: Ctx,
	actor: Actor,
	input: { readonly scope: GroceryListScope }
): Promise<GroceryItemRow[]> {
	const scope = await groceryScopeFor(ctx, actor, input.scope, GROCERY_SCOPE_MESSAGE);
	return await listOpenGroceryItems(ctx.db, scope);
}

/** `GET /api/groceries?suggest=&name=`: the store Store Memory suggests, or `null`. */
export async function suggestGroceryStore(
	ctx: Ctx,
	actor: Actor,
	input: { readonly scope: GroceryListScope; readonly name: string }
): Promise<string | null> {
	const scope = await groceryScopeFor(ctx, actor, input.scope, GROCERY_SCOPE_MESSAGE);
	const nameKey = normalizeGroceryName(input.name);
	if (!nameKey) return null;
	return mostFrequentGroceryStore(await listGroceryMemoryRows(ctx.db, scope, nameKey));
}

/** What the add door accepts: quick-add text plus an optional store list. */
export type GroceryAddInput = {
	readonly scope: GroceryListScope;
	/** Quick-add text: an optional leading or trailing quantity and the name. */
	readonly input: string;
	/** Already wire-filtered (strings only); cleaned by the write path. */
	readonly stores?: readonly string[];
};

/**
 * `POST /api/groceries`: quick-add → a stored item, 201 on the wire. A blank
 * name is the `Name is required` 400 (the route refused it before the legacy
 * action, whose `null` return was therefore unreachable — dropped).
 */
export async function createGroceryItem(
	ctx: Ctx,
	actor: Actor,
	input: GroceryAddInput
): Promise<GroceryItemRow> {
	const scope = await groceryScopeFor(ctx, actor, input.scope, GROCERY_SCOPE_MESSAGE);
	const parsed = parseGroceryQuickAdd(input.input);
	if (!parsed.name) throw invalid(GROCERY_NAME_REQUIRED_MESSAGE);
	const name = parsed.name;
	const nameKey = normalizeGroceryName(name);
	const stores = cleanGroceryStores(input.stores ?? []);
	return await withTx(ctx, async (txCtx) => {
		const itemStores = await groceryStoresFor(txCtx, scope, nameKey, stores);
		return await insertGroceryItem(txCtx.db, {
			scope,
			name,
			nameKey,
			quantity: clampGroceryQuantity(parsed.quantity),
			stores: itemStores,
			now: txCtx.clock.now()
		});
	});
}

/** What the PATCH door accepts: the scope, the id and the raw op fields the rule narrows. */
export type GroceryUpdateInput = {
	readonly scope: GroceryListScope;
	/** The `[id]` path segment, as the wire carries it (Q-033). */
	readonly id: string;
	readonly op?: unknown;
	readonly stores?: unknown;
	readonly target?: unknown;
};

/**
 * `PATCH /api/groceries/[id]`: check / uncheck / replace stores / move, one
 * use-case. `groceryChangeOf` owns every shape it refuses (one message), a move
 * re-owns the row to the mover, and a store edit trains Store Memory from the
 * list that was stored.
 */
export async function updateGroceryItem(
	ctx: Ctx,
	actor: Actor,
	input: GroceryUpdateInput
): Promise<void> {
	const scope = await groceryScopeFor(ctx, actor, input.scope, GROCERY_SCOPE_MESSAGE);
	const change = groceryChangeOf(input);
	if (!change) throw invalid(GROCERY_OP_MESSAGE);

	if (change.op === 'move') {
		const target = await groceryScopeFor(ctx, actor, change.target, GROCERY_NO_FAMILY_MOVE_MESSAGE);
		const row = await moveGroceryItemRow(ctx.db, scope, input.id, target);
		if (!row) throw notFound(GROCERY_ITEM_NOT_FOUND_MESSAGE);
		return;
	}

	if (change.op === 'stores') {
		const stores = cleanGroceryStores(change.stores);
		await withTx(ctx, async (txCtx) => {
			const row = await setGroceryItemStores(txCtx.db, scope, input.id, stores);
			if (!row) throw notFound(GROCERY_ITEM_NOT_FOUND_MESSAGE);
			await trainGroceryMemory(txCtx, scope, row.nameKey, stores);
		});
		return;
	}

	const row =
		change.op === 'check'
			? await checkGroceryItem(ctx.db, scope, input.id, ctx.clock.now())
			: await uncheckGroceryItem(ctx.db, scope, input.id);
	if (!row) throw notFound(GROCERY_ITEM_NOT_FOUND_MESSAGE);
}

/** `DELETE /api/groceries/[id]?scope=`: remove the row; Store Memory survives. */
export async function deleteGroceryItem(
	ctx: Ctx,
	actor: Actor,
	input: { readonly scope: GroceryListScope; readonly id: string }
): Promise<void> {
	const scope = await groceryScopeFor(ctx, actor, input.scope, GROCERY_SCOPE_MESSAGE);
	const row = await removeGroceryItemRow(ctx.db, scope, input.id);
	if (!row) throw notFound(GROCERY_ITEM_NOT_FOUND_MESSAGE);
}

// --- Store Colours ----------------------------------------------------------

/**
 * `GET /api/groceries/colours`: every colour row the viewer can resolve
 * against, plus the palette the page paints from. The rows are read at the
 * viewer's scope (personal winners included, other people's personal rows
 * never), and the resolution itself stays the rules'.
 */
export async function listGroceryStoreColours(
	ctx: Ctx,
	actor: Actor
): Promise<GroceryColoursResponse> {
	const familyId = await familyIdForActor(ctx, actor);
	const colours = await listGroceryColourRows(ctx.db, { userId: actor.id, familyId });
	return {
		colours,
		palette: STORE_COLOURS.map((colour) => ({ key: colour.key, label: colour.label }))
	};
}

/** What the colour write accepts: the shop, the swatch key or `auto`, and the row it targets. */
export type GroceryColourInput = {
	readonly store: string;
	readonly color: string;
	/** Only the exact string `family` is the family's row; anything else is the writer's. */
	readonly scope?: unknown;
};

/**
 * `PATCH /api/groceries/colours`: write or clear one store's colour in one
 * scope. Nothing is written for a blank store, the no-store group, an
 * undeclared swatch, or the family scope without a family — the column is free
 * text, so this is the only guard between a crafted request and a colour no
 * chip can render.
 */
export async function setGroceryStoreColour(
	ctx: Ctx,
	actor: Actor,
	input: GroceryColourInput
): Promise<void> {
	const storeKey = groceryColourKeyOf(input.store);
	if (!storeKey) throw invalid(GROCERY_COLOUR_REFUSED_MESSAGE);
	const target = groceryColourScopeOf(input.scope);
	const familyId = target === 'family' ? await familyIdForActor(ctx, actor) : null;
	if (target === 'family' && !familyId) throw invalid(GROCERY_NO_FAMILY_COLOUR_MESSAGE);
	const scope: GroceryScope = { userId: actor.id, familyId };
	if (input.color === 'auto') {
		await deleteGroceryColour(ctx.db, scope, storeKey);
		return;
	}
	if (!isStoreColourKey(input.color)) throw invalid(GROCERY_COLOUR_REFUSED_MESSAGE);
	// Q-039 (owner: B): the legacy family upsert named no partial-index
	// predicate, so Postgres could not infer the arbiter and every family write
	// faulted with a 500. The repo names the predicate on both branches, so the
	// family write lands like the personal one.
	await upsertGroceryColour(ctx.db, { scope, storeKey, color: input.color, now: ctx.clock.now() });
}

// --- Page -------------------------------------------------------------------

/**
 * The page's whole read in one call: the two item legs and the colour rows,
 * each degrading to `[]` rather than failing the page (the legacy `leg()`
 * wrapper). `hasFamily` drives the "Add to" Family option and the "No family
 * yet…" line; the page's own filter, search and optimistic state stay in the
 * page.
 */
export async function loadGroceriesPage(
	ctx: Ctx,
	actor: Actor
): Promise<GroceriesPageData> {
	const familyId = await familyIdForActor(ctx, actor);
	const leg = async <T>(read: () => Promise<T>, fallback: T): Promise<T> => {
		try {
			return await read();
		} catch {
			return fallback;
		}
	};
	const [mine, family, colours] = await Promise.all([
		leg<GroceryItemRow[]>(
			() => listOpenGroceryItems(ctx.db, { userId: actor.id, familyId: null }),
			[]
		),
		familyId
			? leg<GroceryItemRow[]>(() => listOpenGroceryItems(ctx.db, { userId: actor.id, familyId }), [])
			: Promise.resolve<GroceryItemRow[]>([]),
		leg<StoreColourRow[]>(() => listGroceryColourRows(ctx.db, { userId: actor.id, familyId }), [])
	]);
	return { mine, family, hasFamily: !!familyId, userId: actor.id, familyId, colours };
}
