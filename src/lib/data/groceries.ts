/**
 * Grocery pure helpers (057) — CLIENT-SAFE, zero server imports.
 * Store Memory + grouping logic shared by server actions and UI.
 */

export const NO_STORE_LABEL = 'Any store';

/** History key: trim + lowercase. Blank -> ''. */
export function normalizeGroceryName(name: string): string {
	return name.trim().toLowerCase();
}

/** Quick-add: optional leading/trailing integer = quantity, rest = name. */
export function parseGroceryQuickAdd(input: string): { name: string; quantity: number } {
	const trimmed = input.trim();
	if (!trimmed) return { name: '', quantity: 1 };
	let m = trimmed.match(/^(.*?)\s+(\d{1,4})$/);
	if (m) return { name: m[1].trim(), quantity: parseInt(m[2], 10) };
	m = trimmed.match(/^(\d{1,4})\s+(.*)$/);
	if (m) return { name: m[2].trim(), quantity: parseInt(m[1], 10) };
	return { name: trimmed, quantity: 1 };
}

/** Most-frequent store from memory rows; ties -> first seen. */
export function mostFrequentStore(rows: { store: string; count: number }[]): string | null {
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

/** Group items by primary store (stores[0]), case-agnostic; empty -> NO_STORE_LABEL. */
export function groupGroceriesByStore<T extends { stores: string[] }>(
	items: T[]
): { store: string; items: T[] }[] {
	const order: string[] = [];
	const map = new Map<string, { label: string; items: T[] }>();
	for (const item of items) {
		const label = item.stores[0] ?? NO_STORE_LABEL;
		const key = label.toLowerCase();
		if (!map.has(key)) {
			map.set(key, { label, items: [] });
			order.push(key);
		}
		map.get(key)!.items.push(item);
	}
	return order.map((key) => ({ store: map.get(key)!.label, items: map.get(key)!.items }));
}
