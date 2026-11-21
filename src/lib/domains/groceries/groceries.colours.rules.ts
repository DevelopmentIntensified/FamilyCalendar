/**
 * groceries colour rules: the closed six-swatch Store Colour palette, the
 * store key, the name-derived default, the three-tier resolution (personal →
 * family → name), grouping + colour as ONE concept (#115), collision
 * disclosure, and the optimistic override map.
 *
 * Grouping and colour stay one function because a store group IS a coloured
 * thing: splitting them is how the page ended up with four calls and two key
 * conventions. The key is `groceryStoreKey` everywhere — grouping, the row
 * lookup and the database column — so two spellings of one shop are one
 * group, one colour, one row.
 *
 * Nothing here reads the clock or the database: the rows and the scope are
 * parameters.
 *
 * Doc: ./README.md#invariants
 */
import { nameColor } from '$lib/kernel/ui/colorHash';
import type { StoreColourRow } from './groceries.contract';
import { normalizeGroceryName, NO_STORE_LABEL } from './groceries.items.rules';
import type { GroceryScope } from './groceries.scope.rules';

/**
 * The palette: six curated swatches, never a free colour field. A store colour
 * is a label, and a label is only recognisable if the set is small and the
 * same everywhere. Six swatches and unlimited stores means collisions are
 * permitted, never prevented, and always DISCLOSED.
 *
 * `key` is the wire value and the database column value; `chip`/`bar`/`dot`
 * are the classes the page paints them with.
 */
export const STORE_COLOURS = [
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
] as const;

/** One declared swatch. */
export type StoreColour = (typeof STORE_COLOURS)[number];

/** The key a write may send; nothing else ever reaches a chip. */
export type StoreColourKey = StoreColour['key'];

/** Only a declared swatch key; a free colour string never reaches a chip. */
export function isStoreColourKey(value: unknown): value is StoreColourKey {
	return typeof value === 'string' && STORE_COLOURS.some((colour) => colour.key === value);
}

/**
 * The store's own key: trim + lowercase, the same rule as the item history
 * key. One body, two names: a store key and an item name key are different
 * domain words for the same normalisation, and sharing the implementation is
 * what stops `" Costco "` from becoming a second shop.
 */
export const groceryStoreKey = normalizeGroceryName;

/**
 * The colour key a store name is stored under, or `null` when it has no store:
 * blank, or exactly "Any store" (the ABSENCE of a store, not a shop, so never
 * tinted and never written). The read path (`resolveGroceryStoreColour`) and the
 * write path (the S5 colour write's refusal) share this one guard. Legacy
 * compares the label case-sensitively, so a lowercase "any store" is a real shop.
 */
export function groceryColourKeyOf(name: string | null | undefined): string | null {
	if (!name) return null;
	const label = name.trim();
	if (!label || label === NO_STORE_LABEL) return null;
	return groceryStoreKey(label);
}

/**
 * The declared swatch for a key. `resolveGroceryStoreColour` filters out
 * undeclared keys with `isStoreColourKey` before any tier runs, so the fall
 * back to the first swatch only satisfies the type; it is never reached.
 */
function colourSwatch(key: string): StoreColour {
	return STORE_COLOURS.find((colour) => colour.key === key) ?? STORE_COLOURS[0];
}

/**
 * The name-derived default: `nameColor(storeKey) % 6`. Deliberately NOT
 * position-based — the set of stores on the page is not an input, so adding a
 * store never repaints the others. It uses the repo's ONE name hash
 * (`kernel/ui/colorHash`), so the same name keeps its swatch everywhere.
 */
export function defaultGroceryStoreColour(name: string): StoreColour {
	const index = nameColor(groceryStoreKey(name)) % STORE_COLOURS.length;
	return STORE_COLOURS[index];
}

/**
 * Personal, then family, then the name-derived default. `rows` is every colour
 * row visible to the viewer (both scopes), and the resolution is by the
 * VIEWER's scope, not by which list is open — so a colour set on the family
 * list reads the same on a personal one.
 *
 * `null` means there is no store to colour. An undeclared colour in a row is
 * ignored (that tier simply does not apply) rather than rendered.
 */
export function resolveGroceryStoreColour(
	name: string | null | undefined,
	rows: readonly StoreColourRow[],
	scope: GroceryScope
): StoreColour | null {
	const key = groceryColourKeyOf(name);
	if (!key) return null;
	const forStore = rows.filter((row) => row.storeKey === key && isStoreColourKey(row.color));
	const personal = forStore.find((row) => row.familyId === null && row.userId === scope.userId);
	if (personal) return colourSwatch(personal.color);
	const family = forStore.find((row) => row.familyId !== null && row.familyId === scope.familyId);
	if (family) return colourSwatch(family.color);
	return defaultGroceryStoreColour(key);
}

/** One store group with its items, in list order. No colour yet (see below). */
export type GroceryStoreGroup<T extends { readonly stores: readonly string[] }> = {
	readonly store: string;
	readonly items: T[];
};

/** One store group on the page: its label, its items in list order, its colour. */
export type GroceryGroup<T extends { readonly stores: readonly string[] }> =
	GroceryStoreGroup<T> & { readonly colour: StoreColour | null };

/**
 * The store groups WITHOUT a colour, for a caller that only shows names (the
 * Day Dashboard card). Same grouping rule as `groupGroceryItems`, which is
 * this plus one `resolveGroceryStoreColour` per group — so there is one home
 * for the key and the order, not a card copy that can drift.
 *
 * Grouped by `stores[0]` (the primary store), the storeless under
 * `NO_STORE_LABEL`; groups sorted by label alphabetically, case-insensitively;
 * items keep the order they arrived in (oldest first, from the list read).
 */
export function groceryStoreGroups<T extends { readonly stores: readonly string[] }>(
	items: readonly T[]
): GroceryStoreGroup<T>[] {
	const groups = new Map<string, { label: string; items: T[] }>();
	for (const item of items) {
		const label = item.stores[0] ?? NO_STORE_LABEL;
		const key = groceryStoreKey(label);
		const group = groups.get(key);
		if (group) group.items.push(item);
		else groups.set(key, { label, items: [item] });
	}
	return [...groups.values()]
		.sort((a, b) => a.label.localeCompare(b.label, undefined, { sensitivity: 'base' }))
		.map((group) => ({ store: group.label, items: group.items }));
}

/**
 * The store groups, each with its resolved colour — grouping and colour as one
 * concept (#115). `groceryStoreGroups` is the grouping half; this is the page's
 * one call, so no caller re-assembles the two key conventions.
 */
export function groupGroceryItems<T extends { readonly stores: readonly string[] }>(
	items: readonly T[],
	rows: readonly StoreColourRow[],
	scope: GroceryScope
): GroceryGroup<T>[] {
	return groceryStoreGroups(items).map((group) => ({
		...group,
		colour: resolveGroceryStoreColour(group.store, rows, scope)
	}));
}

/**
 * The other stores on the same swatch. A collision is allowed but never
 * silent: the group header names the twin, and the store name is always
 * printed beside the colour. The no-store group is not a shop, so it shares
 * with nothing.
 */
export function groceryStoresSharingColour(
	name: string,
	allStoreNames: readonly string[],
	rows: readonly StoreColourRow[],
	scope: GroceryScope
): string[] {
	const colour = resolveGroceryStoreColour(name, rows, scope);
	if (!colour) return [];
	const key = groceryStoreKey(name);
	return allStoreNames.filter(
		(other) =>
			groceryStoreKey(other) !== key &&
			resolveGroceryStoreColour(other, rows, scope)?.key === colour.key
	);
}

/* ── Optimistic colour overrides ────────────────────────────────────────────
 *
 * A flip repaints before the server answers, so the page keeps the pending
 * value itself. That map used to be keyed by the STORE NAME ALONE, which is
 * the whole bug: "what colour is Aldi" has two answers — yours and the
 * family's — and one key can only hold one of them. Worse, each override was
 * re-derived from the scope control's CURRENT value, so merely flipping
 * Everyone/Just me moved an existing override to the other scope without a
 * single write happening.
 *
 * The rule, stated once so no call site can forget it: an override carries its
 * own scope, and the key carries it too.
 */

/** Which row a colour write targets. Mirrors the colour body's `scope`. */
export type GroceryColourScope = 'family' | 'personal';

/** The override map: `scope:storeKey` → a swatch key. */
export type ColourOverrides = Readonly<Record<string, string>>;

/**
 * The colour scope a write names: only the exact string `family` writes the
 * shared row, anything else (including a number, `all`, or `Family`) is the
 * writer's own colour.
 */
export function groceryColourScopeOf(raw: unknown): GroceryColourScope {
	return raw === 'family' ? 'family' : 'personal';
}

/** The key an override for one shop in one scope is stored under. */
export function groceryColourOverrideKey(scope: GroceryColourScope, storeKey: string): string {
	return `${scope}:${storeKey}`;
}

/** Is this shop overridden in THIS scope? */
export function hasGroceryColourOverride(
	overrides: ColourOverrides,
	scope: GroceryColourScope,
	storeKey: string
): boolean {
	const colour = overrides[groceryColourOverrideKey(scope, storeKey)];
	return typeof colour === 'string' && colour.length > 0;
}

/**
 * The colour row an override stands for, at the scope the override was MADE at.
 *
 * A viewer with no family has nowhere to put an "everyone" colour, so `family`
 * resolves to `familyId: null` there — the same row a personal one would
 * write, which is the honest answer: with no family, everyone's list is yours.
 */
function optimisticGroceryColourRow(
	scope: GroceryColourScope,
	storeKey: string,
	color: string,
	viewer: GroceryScope
): StoreColourRow {
	return {
		storeKey,
		color,
		userId: viewer.userId,
		familyId: scope === 'family' ? viewer.familyId : null
	};
}

/**
 * The loaded rows with every pending override merged in, in the override's OWN
 * scope. An override replaces a loaded row only when it names the same scope,
 * so a personal override never erases the family's answer — `resolve…` reads
 * both and personal still wins.
 *
 * A key with no scope in it is the pre-#115 shape: it cannot be honoured
 * safely (it has no scope to honour), so it is dropped and the page repaints
 * from the server's truth rather than guessing one.
 */
export function applyGroceryColourOverrides(
	rows: readonly StoreColourRow[],
	overrides: ColourOverrides,
	viewer: GroceryScope
): StoreColourRow[] {
	const merged = rows.slice();
	for (const [entry, color] of Object.entries(overrides)) {
		if (!color) continue;
		const at = entry.indexOf(':');
		if (at < 1) continue;
		const scope = entry.slice(0, at);
		if (scope !== 'family' && scope !== 'personal') continue;
		const row = optimisticGroceryColourRow(scope, entry.slice(at + 1), color, viewer);
		const existing = merged.findIndex(
			(other) =>
				other.storeKey === row.storeKey &&
				other.familyId === row.familyId &&
				other.userId === row.userId
		);
		if (existing >= 0) merged[existing] = row;
		else merged.push(row);
	}
	return merged;
}
