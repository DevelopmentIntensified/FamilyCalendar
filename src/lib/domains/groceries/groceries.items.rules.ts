/**
 * groceries item rules: the quick-add parse, the history key, the one store
 * clean (write-path clean and chip read-path dedupe are the same rule), the
 * Store Memory suggestion, the search predicate, the suggest-read truthiness
 * and the PATCH op narrowing.
 *
 * Nothing here reads the clock, the environment or the database: every input
 * is a parameter. The suggestion is "highest count, ties → first row seen",
 * which is why the rows arrive in the order the database returned them — the
 * rule never sorts them.
 *
 * Doc: ./README.md#invariants
 */
import { isGroceryListScope, type GroceryListScope } from './groceries.scope.rules';

/** The group name the items with no store are filed under. Not a shop. */
export const NO_STORE_LABEL = 'Any store';

/** History key: trim + lowercase. Blank -> ''. */
export function normalizeGroceryName(name: string): string {
	return name.trim().toLowerCase();
}

/**
 * Quick-add: an optional leading OR trailing 1–4 digit integer is the
 * quantity, the rest is the name. Five digits are part of the name, because a
 * quantity that long is a year or a price, not a count. Blank input is an
 * empty name, which the add use-case refuses. The trailing quantity is tried
 * first, so when both ends carry a number the trailing one wins
 * (`2 milk 3` is 3 of "2 milk"). The parse leaves a zero as written; flooring
 * to at least 1 is the add use-case's rule.
 */
export function parseGroceryQuickAdd(input: string): { name: string; quantity: number } {
	const trimmed = input.trim();
	if (!trimmed) return { name: '', quantity: 1 };
	let match = trimmed.match(/^(.*?)\s+(\d{1,4})$/);
	if (match) return { name: match[1].trim(), quantity: Number.parseInt(match[2], 10) };
	match = trimmed.match(/^(\d{1,4})\s+(.*)$/);
	if (match) return { name: match[2].trim(), quantity: Number.parseInt(match[1], 10) };
	return { name: trimmed, quantity: 1 };
}

/**
 * The quantity an item is stored with: floored, never below 1. An absent
 * quantity is 1. (A parsed `0` or a client's `-3` both become 1.)
 */
export function clampGroceryQuantity(quantity: number | undefined): number {
	return Math.max(1, Math.floor(quantity ?? 1));
}

/**
 * An item's store list: trimmed, blanks dropped, case-insensitively
 * de-duplicated, the first spelling and the first position kept.
 *
 * ONE HOME. The write path cleans before storing and the read path dedupes
 * before rendering chips, and they were two copies of this rule; a repeated
 * store is a duplicate Svelte key that kills the whole page
 * (`each_key_duplicate`), so the second copy is how the crash came back. Rows
 * already in the database are repaired here too, because the crash comes from
 * reading them.
 *
 * Order is meaningful: `[0]` is the primary store, the one the row is filed
 * under and the one the ring marks.
 */
export function cleanGroceryStores(stores: readonly string[]): string[] {
	const seen = new Set<string>();
	const cleaned: string[] = [];
	for (const raw of stores) {
		const store = raw.trim();
		if (!store) continue;
		const key = normalizeGroceryName(store);
		if (seen.has(key)) continue;
		seen.add(key);
		cleaned.push(store);
	}
	return cleaned;
}

/**
 * The Store Memory suggestion for one item name: the highest count, ties going
 * to the first row seen (the database's order is the tie-breaker, so it is
 * never re-sorted here). `null` when memory knows nothing, including when it
 * only holds zero-count rows.
 */
export function mostFrequentGroceryStore(
	rows: readonly { readonly store: string; readonly count: number }[]
): string | null {
	let best: string | null = null;
	let bestCount = 0;
	for (const row of rows) {
		if (row.count > bestCount) {
			best = row.store;
			bestCount = row.count;
		}
	}
	return best;
}

/**
 * The remembered row a trained store lands on: the one whose store matches
 * case-insensitively (the label is trimmed, as every cleaned store already
 * is), else `null` and the store is a new row at count 1. The first match
 * wins, in the database's row order.
 */
export function matchingGroceryMemoryRow<T extends { readonly store: string }>(
	rows: readonly T[],
	store: string
): T | null {
	const label = store.trim().toLowerCase();
	return rows.find((row) => row.store.toLowerCase() === label) ?? null;
}

/**
 * The search predicate, the tasks-page idiom: trim + lowercase, an empty query
 * matches everything. Groceries match on the item name AND on any of its
 * stores, because "aldi" is how people look for a thing on this page.
 */
export function matchesGrocerySearch(
	item: { readonly name: string; readonly stores: readonly string[] },
	searchQuery: string
): boolean {
	const query = searchQuery.trim().toLowerCase();
	if (!query) return true;
	if (item.name.toLowerCase().includes(query)) return true;
	return item.stores.some((store) => store.toLowerCase().includes(query));
}

/**
 * The name a `GET /api/groceries?suggest=&name=` read suggests for, or `null`
 * when the request is not a suggest read.
 *
 * Legacy truthiness, kept on purpose: `if (suggest && isString(name))`. So an
 * empty `?suggest=` is "no suggestion asked for" while `?suggest=0` is a real
 * one, and `?name` without `?suggest` is ignored. A present but empty name is
 * still a suggest read — it just finds nothing, which is the honest answer.
 */
export function grocerySuggestionName(query: {
	readonly suggest?: string | null;
	readonly name?: string | null;
}): string | null {
	if (!query.suggest || typeof query.name !== 'string') return null;
	return query.name;
}

/** A PATCH op the item update can actually run. */
export type GroceryChange =
	| { readonly op: 'check' | 'uncheck' }
	| { readonly op: 'stores'; readonly stores: string[] }
	| { readonly op: 'move'; readonly target: GroceryListScope };

/**
 * The one runnable op in a PATCH body, or `null` when the body asks for
 * nothing the wire accepts.
 *
 * This is the legacy `if` chain with its coercions captured once: `stores`
 * must be an ARRAY (a single string is not a store list) and only its string
 * entries survive (a number in the array was always ignored, never a 400); a
 * `move` target outside `mine`/`family` is the same 400 as an unknown op, not
 * its own message. The list is NOT cleaned here — cleaning is the write
 * path's rule, and `setGroceryItemStores` runs it.
 *
 * An empty `stores` array is a real op: it clears every store on the row
 * (Q-037, an empty field honestly means "no store").
 */
export function groceryChangeOf(body: {
	readonly op?: unknown;
	readonly stores?: unknown;
	readonly target?: unknown;
}): GroceryChange | null {
	if (body.op === 'check' || body.op === 'uncheck') return { op: body.op };
	if (body.op === 'stores' && Array.isArray(body.stores)) {
		const stores = body.stores.filter((store): store is string => typeof store === 'string');
		return { op: 'stores', stores };
	}
	if (body.op === 'move' && isGroceryListScope(body.target)) {
		return { op: 'move', target: body.target };
	}
	return null;
}
