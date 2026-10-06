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

/**
 * Group items by primary Store (stores[0]), case-agnostic; empty -> NO_STORE_LABEL.
 * Groups are sorted alphabetically so the list scans as a trip; items keep their
 * given order inside a group.
 */
/**
 * A grocery item's store list, with repeats removed.
 *
 * WHY THIS EXISTS
 *
 * `walmart, walmart, costco` is one shop said twice and one other shop. The store
 * field is free text with commas for alternates, so nothing stopped a person
 * typing the same shop twice — and nothing stopped the database storing it either.
 *
 * That became a hard crash rather than a cosmetic flaw. The store chips are a
 * keyed each block keyed by the store name, so a repeated name is a duplicate key
 * and Svelte throws `each_key_duplicate` — the whole groceries page dies, not just
 * the one row. Reported live on the test environment: "duplicate key `walmart` at
 * indexes 2 and 3".
 *
 * Matching is case-insensitive, because "Walmart" and "walmart" are the same shop
 * and a person should not get two chips for it. First spelling wins, so the shop
 * keeps the casing it was first typed with rather than being silently rewritten.
 * Order is otherwise preserved, which matters: the FIRST store is the one the row
 * is filed under and the one the approved design puts the ring on.
 *
 * Dedupe belongs here, at the one place a store list is interpreted, rather than at
 * each of the four places one is rendered. Two of those already dedupe — the
 * known-store list and the by-store grouping both key on a Set/Map — and the third,
 * this chip list, did not. This also repairs rows already in the database, which
 * fixing only the write path would not: the crash comes from reading them.
 */
export function uniqueStores(stores: readonly string[]): string[] {
	const seen = new Set<string>();
	const out: string[] = [];
	for (const raw of stores) {
		const store = raw.trim();
		if (!store) continue;
		const key = store.toLowerCase();
		if (seen.has(key)) continue;
		seen.add(key);
		out.push(store);
	}
	return out;
}

export function groupGroceriesByStore<T extends { stores: string[] }>(
	items: T[]
): { store: string; items: T[] }[] {
	const map = new Map<string, { label: string; items: T[] }>();
	for (const item of items) {
		const label = item.stores[0] ?? NO_STORE_LABEL;
		const key = label.toLowerCase();
		if (!map.has(key)) {
			map.set(key, { label, items: [] });
		}
		map.get(key)!.items.push(item);
	}
	return [...map.values()]
		.sort((a, b) => a.label.localeCompare(b.label, undefined, { sensitivity: 'base' }))
		.map((g) => ({ store: g.label, items: g.items }));
}

/* ── Store colours (096) ────────────────────────────────────────────────────
 *
 * A store is a real-world fact about the household, so the colour belongs to
 * the family — but someone with no family still needs somewhere to put one.
 * That is the dual-scope shape Store Memory already uses and the Tag Table's
 * rule: PERSONAL rows beat FAMILY rows. Then a deterministic default, derived
 * from the store's NAME (never its position, so adding a store never repaints
 * the others). One convention in the app, not two.
 *
 * The key is the group key: `label.toLowerCase()`, which is the same
 * trim-and-lowercase rule the item name uses because every store the server
 * writes is already trimmed. Two spellings of one shop are one group, and so
 * they are one colour.
 *
 * The palette is curated, not free: a store colour is a label, and a label is
 * only recognisable if the set is small and the same everywhere. Six swatches,
 * unlimited stores — so collisions are permitted, never enforced, and always
 * DISCLOSED (the group header names the twin). Six tokens, one store name
 * always printed beside the colour.
 */

export interface StoreColour {
	key: string;
	label: string;
	/** Row chip fill + text. */
	chip: string;
	/** Group header bar tint. */
	bar: string;
	/** The dot on the group header + the primary store's ring. */
	dot: string;
}

export const STORE_COLOURS: readonly StoreColour[] = [
	{
		key: 'terracotta',
		label: 'Terracotta',
		chip: 'bg-orange-100 text-orange-900',
		bar: 'bg-orange-50',
		dot: 'bg-orange-500'
	},
	{
		key: 'sky',
		label: 'Blue',
		chip: 'bg-sky-100 text-sky-900',
		bar: 'bg-sky-50',
		dot: 'bg-sky-500'
	},
	{
		key: 'sage',
		label: 'Mint',
		chip: 'bg-emerald-100 text-emerald-900',
		bar: 'bg-emerald-50',
		dot: 'bg-emerald-500'
	},
	{
		key: 'lilac',
		label: 'Lavender',
		chip: 'bg-violet-100 text-violet-900',
		bar: 'bg-violet-50',
		dot: 'bg-violet-500'
	},
	{
		key: 'amber',
		label: 'Amber',
		chip: 'bg-amber-100 text-amber-900',
		bar: 'bg-amber-50',
		dot: 'bg-amber-500'
	},
	{
		key: 'slate',
		label: 'Slate',
		chip: 'bg-slate-200 text-slate-800',
		bar: 'bg-slate-100',
		dot: 'bg-slate-500'
	}
];

/** Only a declared swatch key; a free colour string never reaches a chip. */
export function isStoreColourKey(v: unknown): v is string {
	return typeof v === 'string' && STORE_COLOURS.some((c) => c.key === v);
}

function swatch(key: string): StoreColour {
	return STORE_COLOURS.find((c) => c.key === key) ?? STORE_COLOURS[0];
}

/** The store's own key: trim + lowercase, exactly what the group keys on. */
export function storeKey(name: string): string {
	return name.trim().toLowerCase();
}

/** The colour key this store is stored under, or null when it has no store. */
function colourKeyFor(name: string | null | undefined): string | null {
	if (!name) return null;
	const label = name.trim();
	// "Any store" is the absence of a store, not a shop. Never tinted.
	if (!label || label === NO_STORE_LABEL) return null;
	return storeKey(label);
}

/**
 * The name-derived default. Deliberately NOT position-based: the set of
 * stores on the page is not an input, so adding one never repaints another.
 * Uses the repo's existing charCode-sum hash (contactColors.ts, avatarColor.ts).
 */
export function defaultStoreColourKey(name: string): string {
	const key = storeKey(name);
	let hash = 0;
	for (let i = 0; i < key.length; i++) hash = key.charCodeAt(i) + ((hash << 5) - hash);
	return STORE_COLOURS[Math.abs(hash) % STORE_COLOURS.length].key;
}

/** A colour row: the table's shape, minus the columns the UI never reads. */
export interface StoreColourRow {
	storeKey: string;
	color: string;
	userId: string;
	familyId: string | null;
}

export interface StoreColourViewer {
	userId: string;
	familyId: string | null;
}

/**
 * Personal, then family, then the deterministic default. `rows` is every
 * colour row visible to the viewer (both scopes); the resolution is by the
 * VIEWER, not by which list is open, so a colour set on the family list reads
 * the same on a personal one. Null = no store, or no colour to carry.
 */
export function colourFor(
	name: string | null | undefined,
	rows: StoreColourRow[],
	viewer: StoreColourViewer
): StoreColour | null {
	const key = colourKeyFor(name);
	if (!key) return null;
	const mine = rows.filter((r) => r.storeKey === key && isStoreColourKey(r.color));
	const personal = mine.find((r) => r.familyId === null && r.userId === viewer.userId);
	if (personal) return swatch(personal.color);
	const family = mine.find((r) => r.familyId !== null && r.familyId === viewer.familyId);
	if (family) return swatch(family.color);
	return swatch(defaultStoreColourKey(key));
}

/**
 * The other stores on the same swatch. A collision is allowed but never
 * silent — the group header says who it shares with, and the store name is
 * always printed beside the colour.
 */
export function storesSharingColour(
	name: string,
	allStoreNames: string[],
	rows: StoreColourRow[],
	viewer: StoreColourViewer
): string[] {
	const colour = colourFor(name, rows, viewer);
	if (!colour) return [];
	return allStoreNames.filter((other) => {
		if (storeKey(other) === storeKey(name)) return false;
		return colourFor(other, rows, viewer)?.key === colour.key;
	});
}

/**
 * Resolve every store label on the page, keyed by the label AS WRITTEN, so a
 * caller reading `groups` can look a group up without re-normalising.
 */
export function resolveGroceryColours(
	storeNames: string[],
	rows: StoreColourRow[],
	viewer: StoreColourViewer
): Map<string, StoreColour | null> {
	return new Map(storeNames.map((n) => [n, colourFor(n, rows, viewer)]));
}

/* ── Optimistic colour overrides (115) ────────────────────────────────────
 *
 * A flip repaints before the server answers, so the page keeps the pending
 * value itself. That map used to be keyed by the STORE NAME ALONE, which is
 * the whole bug: "what colour is Aldi" has two answers — yours and the
 * family's — and one key can only hold one of them. Worse, each override's
 * `familyId` was rebuilt from the scope control's CURRENT value, so merely
 * flipping Everyone/Just me moved an existing override to the other scope
 * without a single write happening.
 *
 * The rule, stated once so no call site can forget it: **an override carries
 * its own scope, and the key carries it too.** Nothing downstream can re-label
 * an override, because the label is already inside the value.
 */

/** Which row a colour write targets. Mirrors the write API's `scope`. */
export type ColourScopeKey = 'family' | 'personal';

/** The override map: `scope:storeKey` → a swatch key. */
export type ColourOverrides = Readonly<Record<string, string>>;

/** The key an override for one shop in one scope is stored under. */
export function colourOverrideKey(scope: ColourScopeKey, key: string): string {
	return `${scope}:${key}`;
}

/** Is this shop overridden in THIS scope? */
export function hasColourOverride(
	overrides: ColourOverrides,
	scope: ColourScopeKey,
	key: string
): boolean {
	const colour = overrides[colourOverrideKey(scope, key)];
	return typeof colour === 'string' && colour.length > 0;
}

/**
 * The colour row an override stands for, at the scope the override was MADE at.
 *
 * A viewer with no family has nowhere to put an "everyone" colour, so `family`
 * resolves to `null` there — the same row a personal one would write, which is
 * the honest answer: with no family, everyone's list is yours.
 */
export function optimisticColourRow(
	scope: ColourScopeKey,
	key: string,
	color: string,
	viewer: StoreColourViewer
): StoreColourRow {
	return {
		storeKey: key,
		color,
		userId: viewer.userId,
		familyId: scope === 'family' ? viewer.familyId : null
	};
}

/**
 * The loader's rows with every pending override merged in, in the override's
 * OWN scope.
 *
 * An override replaces a loaded row only when it names the same scope, so a
 * personal override never erases the family's answer — `colourFor` reads both
 * and personal still wins, which is the precedence rule stated once.
 */
export function withColourOverrides(
	rows: readonly StoreColourRow[],
	overrides: ColourOverrides,
	viewer: StoreColourViewer
): StoreColourRow[] {
	const merged = rows.slice();
	for (const [entry, color] of Object.entries(overrides)) {
		if (!color) continue;
		const at = entry.indexOf(':');
		// A key with no scope in it is the pre-115 shape; it cannot be honoured
		// safely (it has no scope to honour) and dropping it repaints from the
		// server's truth rather than guessing one.
		if (at < 1) continue;
		const scope = entry.slice(0, at) as ColourScopeKey;
		if (scope !== 'family' && scope !== 'personal') continue;
		const row = optimisticColourRow(scope, entry.slice(at + 1), color, viewer);
		const existing = merged.findIndex(
			(r) => r.storeKey === row.storeKey && r.familyId === row.familyId && r.userId === row.userId
		);
		if (existing >= 0) merged[existing] = row;
		else merged.push(row);
	}
	return merged;
}

/* ── One list, a scope filter (097) ─────────────────────────────────────────
 *
 * The two scope tabs are gone: one list, one filter, both scopes visible. The
 * filter is the same idiom the tasks page uses (single-select chips over ONE
 * main list, `TaskToolbar.svelte`), so the two pages filter the same way.
 */

export type GroceryScopeKey = 'all' | 'family' | 'mine';

export const SCOPE_FILTERS: { key: GroceryScopeKey; label: string }[] = [
	{ key: 'all', label: 'All' },
	{ key: 'family', label: 'Family' },
	{ key: 'mine', label: 'Mine' }
];

/**
 * The dashboard's per-scope card links here as `?scope=mine`, and the promise
 * that link makes is "show me MY list". The parameter keeps its meaning — it
 * selects the FILTER now, not a tab — and junk falls back to "all" rather than
 * showing nothing.
 */
export function scopeFromParam(raw: string | null | undefined): GroceryScopeKey {
	return raw === 'family' || raw === 'mine' ? raw : 'all';
}

/**
 * A row's scope is a property of the row, never of which list loaded it:
 * `familyId IS NULL` is Mine, `familyId` set is Family. This is what lets one
 * list hold both scopes and still let every row, check-off and uncheck act on
 * the scope the item actually came from.
 */
export function scopeOf(row: { familyId: string | null }): Exclude<GroceryScopeKey, 'all'> {
	return row.familyId ? 'family' : 'mine';
}

/**
 * The search predicate, matching the tasks-page idiom (`familyTaskList.ts`
 * `matchesSearch`): bound `searchQuery` state, trim + lowercase, an empty
 * query matches everything. Groceries match on the item name and on the store,
 * because "aldi" is how people look for a thing on this page.
 */
export function matchesGrocerySearch(
	item: { name: string; stores: string[] },
	searchQuery: string
): boolean {
	const q = searchQuery.trim().toLowerCase();
	if (!q) return true;
	if (item.name.toLowerCase().includes(q)) return true;
	return item.stores.some((s) => s.toLowerCase().includes(q));
}
