/**
 * groceries list rules: the page's pure logic, one home each — the group
 * summary line, the filter counts, the store names the page offers and paints,
 * the collision map, the picker's scoped value, the empty-state copy, the two
 * failure sentences, the add toast's truthful store (Q-038 B) and the local
 * list edits a write applies once the server has agreed.
 *
 * Why the local edits: legacy called `invalidateAll()` after every write and
 * let the loader re-read both lists. The rewrite answers from the response it
 * already has (the add route returns the created row), so the page keeps the
 * same visible result without a second round trip. The rules below are those
 * edits, pure and table-tested; the state class only sequences them.
 *
 * Nothing here reads the clock, the DOM or the network: every input is a
 * parameter. "Now" never appears, and the item order is the row's own
 * `createdAt`, so an insert lands where the loader would have put it.
 *
 * Doc: ./README.md#invariants
 */
import type { GroceryListItem, StoreColourRow } from './groceries.contract';
import {
	STORE_COLOURS,
	groceryColourOverrideKey,
	groceryStoreKey,
	isStoreColourKey,
	resolveGroceryStoreColour,
	type ColourOverrides,
	type GroceryColourScope
} from './groceries.colours.rules';
import { NO_STORE_LABEL } from './groceries.items.rules';
import {
	groceryScopeOf,
	type GroceryListScope,
	type GroceryScope,
	type GroceryScopeFilter
} from './groceries.scope.rules';

/** "2 items · 3 total" — the Store summary line. One item is not "1 items". */
export function grocerySummaryLine(items: readonly { readonly quantity: number }[]): string {
	const total = items.reduce((sum, item) => sum + item.quantity, 0);
	return `${items.length} ${items.length === 1 ? 'item' : 'items'} · ${total} total`;
}

/** How many rows the filter chip counts: `all` counts the one list. */
export function groceryScopeCount(
	items: readonly Pick<GroceryListItem, 'familyId'>[],
	filter: GroceryScopeFilter
): number {
	if (filter === 'all') return items.length;
	return items.filter((item) => groceryScopeOf(item) === filter).length;
}

/**
 * Every store name these rows mention, in first-seen order, ONE PER SHOP.
 * One list for two jobs on the page: the chip set a collision is disclosed
 * against, and the `known-stores` datalist an add is typed against (there the
 * caller passes BOTH scopes' rows, so a shop already on the other list is
 * offered too).
 *
 * De-duplicated by `groceryStoreKey` (trim + lowercase), not by exact spelling:
 * two rows may carry "Aldi" and "aldi", and both lists key their `{#each}` by
 * the store key — a second spelling would be a duplicate key and kill the page
 * (the `each_key_duplicate` class this module already paid for). The first
 * spelling wins, as everywhere else; a blank store is no shop and is skipped.
 */
export function groceryStoreNames(
	items: readonly { readonly stores: readonly string[] }[]
): string[] {
	const seen = new Set<string>();
	const names: string[] = [];
	for (const item of items) {
		for (const store of item.stores) {
			const key = groceryStoreKey(store);
			if (!key || seen.has(key)) continue;
			seen.add(key);
			names.push(store.trim());
		}
	}
	return names;
}

/**
 * The shops the Store colours card lists: a blank store is no store, and
 * "Any store" is the ABSENCE of one, never a shop to colour.
 */
export function groceryColourStores(names: readonly string[]): string[] {
	return names.filter((name) => name.trim() && name.trim() !== NO_STORE_LABEL);
}

/**
 * The shops sharing a swatch, flattened. Six swatches over unbounded shops
 * makes a collision ordinary, so it is disclosed on the card and on the group
 * header rather than prevented.
 */
export function grocerySharedColourStores(
	stores: readonly string[],
	rows: readonly StoreColourRow[],
	scope: GroceryScope
): string[] {
	const bySwatch = new Map<string, string[]>();
	for (const store of stores) {
		const tint = resolveGroceryStoreColour(store, rows, scope);
		if (!tint) continue;
		const group = bySwatch.get(tint.key) ?? [];
		group.push(store);
		bySwatch.set(tint.key, group);
	}
	return [...bySwatch.values()].filter((shops) => shops.length > 1).flat();
}

/**
 * What a picker shows for ONE shop in ONE scope: the pending override if there
 * is one, else the stored row AT that scope, else `auto`.
 *
 * The answer is scoped on purpose (115): reading it back from the resolved
 * tint would let the control re-label a colour the other scope owns, and would
 * mark two options selected at once.
 */
export function groceryPickerValue(
	rows: readonly StoreColourRow[],
	overrides: ColourOverrides,
	scope: GroceryColourScope,
	store: string,
	viewer: GroceryScope
): string {
	const key = groceryStoreKey(store);
	const pending = overrides[groceryColourOverrideKey(scope, key)];
	if (pending) return pending;
	const familyId = scope === 'family' ? viewer.familyId : null;
	const stored = rows.find((row) => row.storeKey === key && row.familyId === familyId);
	if (stored && isStoreColourKey(stored.color)) return stored.color;
	return 'auto';
}

/**
 * The list's empty state, which is per filter AND per search — "your list is
 * empty" would be a lie while the family list has rows.
 */
export function groceryEmptyCopy(input: {
	readonly query: string;
	readonly filter: GroceryScopeFilter;
	readonly hasFamily: boolean;
}): string {
	const query = input.query.trim();
	if (query) return `No items match “${query}”.`;
	if (input.filter === 'mine') return 'Your list is empty. Add the first item.';
	if (input.filter === 'family') {
		return input.hasFamily
			? 'The family list is empty. Add the first item.'
			: 'No family list yet — join or create a family to use the shared list.';
	}
	return 'Both lists are empty. Add the first item.';
}

/**
 * A refused request and a dead network read differently (239): the api client
 * reports `status: 0` when `fetch` never reached the server, so that is the
 * offline case and every other status is a real refusal.
 */
export function groceryFailureCopy(what: string, status: number): string {
	return status === 0 ? `${what} — check your connection and try again.` : `${what}. Try again.`;
}

/**
 * The add toast: the scope, then the store the CREATED row actually carries
 * (Q-038 B) — the server may have auto-filled one the person did not type, so
 * the remembered guess would name a shop the row does not have. Same sentence
 * shape as legacy, truthful value; no store on the row, no clause.
 *
 * The quoted name is the typed quick-add text (`"milk 2"`), exactly as legacy
 * echoed it.
 */
export function groceryAddedToast(
	quickAdd: string,
	target: GroceryListScope,
	item: { readonly stores: readonly string[] } | null
): string {
	const scope = target === 'mine' ? 'Mine' : 'Family';
	const store = item?.stores[0];
	return `Added "${quickAdd.trim()}" to ${scope}${store ? ` — ${store}` : ''}.`;
}

/** The colour flip's confirmation, naming the swatch and whether it is yours alone. */
export function groceryColourToast(
	store: string,
	color: string,
	scope: GroceryColourScope
): string {
	if (color === 'auto') return `${store} is back to its own default colour.`;
	const label = STORE_COLOURS.find((swatch) => swatch.key === color)?.label ?? color;
	return `${store} is now ${label}${scope === 'personal' ? ' (just you)' : ''}.`;
}

/* ── Local list edits ─────────────────────────────────────────────────────── */

/** The instant a row was created, for the oldest-first order. */
export function groceryEntryTime(entry: { readonly createdAt: Date | string }): number {
	return typeof entry.createdAt === 'string'
		? Date.parse(entry.createdAt)
		: entry.createdAt.getTime();
}

/**
 * The rows plus one row, in the order the loader would have answered: oldest
 * first. A new item is appended (its instant is the newest); an unchecked row
 * lands back among its neighbours by its original instant, not at the end.
 */
export function groceryItemsWith<T extends { readonly createdAt: Date | string }>(
	items: readonly T[],
	item: T
): T[] {
	const at = items.findIndex((other) => groceryEntryTime(other) > groceryEntryTime(item));
	return at < 0 ? [...items, item] : [...items.slice(0, at), item, ...items.slice(at)];
}

/** The rows without one row (checked off, deleted, or moved to the other list). */
export function groceryItemsWithout<T extends { readonly id: string }>(
	items: readonly T[],
	id: string
): T[] {
	return items.filter((item) => item.id !== id);
}

/** The rows with one row's store list replaced (the inline store editor). */
export function groceryItemsStoresReplaced(
	items: readonly GroceryListItem[],
	id: string,
	stores: readonly string[]
): GroceryListItem[] {
	return items.map((item) => (item.id === id ? { ...item, stores } : item));
}

/**
 * A moved row as the target list holds it: the scope is the row's own
 * `familyId` (null is Mine), and the move re-owns it to the mover — exactly
 * the service's write, applied locally so the row appears on the other list.
 */
export function groceryItemMoved(
	entry: GroceryListItem,
	target: GroceryListScope,
	viewer: GroceryScope
): GroceryListItem {
	return { ...entry, familyId: target === 'family' ? viewer.familyId : null };
}

/**
 * The colour rows as one write leaves them: a swatch replaces the row at that
 * scope (or starts one), and `auto` deletes it there. The write path's own
 * rule, applied locally so a flipped colour reads back without a reload.
 */
export function groceryColourRowsApplied(
	rows: readonly StoreColourRow[],
	input: {
		readonly store: string;
		readonly color: string;
		readonly scope: GroceryColourScope;
		readonly viewer: GroceryScope;
	}
): StoreColourRow[] {
	const storeKey = groceryStoreKey(input.store);
	const familyId = input.scope === 'family' ? input.viewer.familyId : null;
	const at = rows.findIndex((row) => row.storeKey === storeKey && row.familyId === familyId);
	if (input.color === 'auto') {
		if (at < 0) return [...rows];
		return [...rows.slice(0, at), ...rows.slice(at + 1)];
	}
	const row: StoreColourRow = {
		storeKey,
		color: input.color,
		userId: input.viewer.userId,
		familyId
	};
	if (at < 0) return [...rows, row];
	return [...rows.slice(0, at), row, ...rows.slice(at + 1)];
}
