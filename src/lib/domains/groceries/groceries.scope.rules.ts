/**
 * groceries scope rules: the one list's filter vocabulary (All / Family /
 * Mine), the wire's two API scopes, and a row's own scope.
 *
 * Two vocabularies on purpose. `all` exists only on the page: a junk or absent
 * `?scope=` falls back to it there, so the page shows everything instead of
 * nothing. The API accepts exactly `mine` and `family` and answers 400 for
 * anything else, because a request that names no scope is a client bug, not a
 * filter choice (Q-034 — scope travels per verb and the installed client sends
 * each shape).
 *
 * Doc: ./README.md#invariants
 */

/** The wire's two scopes, in the order the UI lists them after All. */
export const GROCERY_API_SCOPES = ['mine', 'family'] as const;

/** The scope of an API read or write: Mine (familyId NULL) or the family's. */
export type GroceryListScope = (typeof GROCERY_API_SCOPES)[number];

/** The page's filter over ONE list; `all` shows both scopes at once. */
export const GROCERY_SCOPE_FILTERS = [
	{ key: 'all', label: 'All' },
	{ key: 'family', label: 'Family' },
	{ key: 'mine', label: 'Mine' }
] as const;

export type GroceryScopeFilter = (typeof GROCERY_SCOPE_FILTERS)[number]['key'];

/**
 * Whose list a read or write acts on: `familyId: null` is the person's own
 * (Mine) rows, a family id is the shared list. The same shape is the person a
 * Store Colour resolves for, so the module has one scope concept, not a
 * "viewer" and a "scope" that can drift apart.
 */
export type GroceryScope = {
	readonly userId: string;
	readonly familyId: string | null;
};

/** Is this the wire's `mine` or `family`? Case-sensitive, like the API. */
export function isGroceryListScope(value: unknown): value is GroceryListScope {
	return GROCERY_API_SCOPES.some((scope) => scope === value);
}

/**
 * The filter a `?scope=` selects. The dashboard card links as `?scope=mine`,
 * and the promise that link makes is "show me MY list"; junk falls back to
 * `all` rather than showing nothing.
 */
export function groceryScopeFromParam(raw: string | null | undefined): GroceryScopeFilter {
	return isGroceryListScope(raw) ? raw : 'all';
}

/**
 * A row's scope is a property of the row, never of which list loaded it:
 * `familyId` NULL is Mine, set is Family. A falsy `familyId` (null, or the
 * empty string a bad write could leave) reads as Mine, exactly as the legacy
 * truthiness did.
 */
export function groceryScopeOf(row: { readonly familyId: string | null }): GroceryListScope {
	return row.familyId ? 'family' : 'mine';
}
