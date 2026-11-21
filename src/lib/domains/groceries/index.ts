/**
 * groceries — public isomorphic interface: contract types, the pure rules, the
 * page's list rules and state class, and the browser api client.
 * Other modules import groceries ONLY through this file, index.server.ts or ui/index.ts (rule R2).
 * Doc: ./README.md#public-interface
 */
export type {
	GroceriesPageData,
	GroceryItemResponse,
	GroceryListItem,
	StoreColourRow
} from './groceries.contract';
export type { GroceryApi } from './groceries.api';
export { createGroceryApi } from './groceries.api';
export {
	STORE_COLOURS,
	applyGroceryColourOverrides,
	defaultGroceryStoreColour,
	groceryColourOverrideKey,
	groceryColourScopeOf,
	groceryStoreGroups,
	groceryStoreKey,
	groceryStoresSharingColour,
	groupGroceryItems,
	hasGroceryColourOverride,
	isStoreColourKey,
	resolveGroceryStoreColour,
	type ColourOverrides,
	type GroceryColourScope,
	type GroceryGroup,
	type GroceryStoreGroup,
	type StoreColour
} from './groceries.colours.rules';
export {
	NO_STORE_LABEL,
	clampGroceryQuantity,
	cleanGroceryStores,
	groceryChangeOf,
	grocerySuggestionName,
	matchingGroceryMemoryRow,
	matchesGrocerySearch,
	mostFrequentGroceryStore,
	normalizeGroceryName,
	parseGroceryQuickAdd
} from './groceries.items.rules';
export {
	GROCERY_API_SCOPES,
	GROCERY_SCOPE_FILTERS,
	groceryScopeFromParam,
	groceryScopeOf,
	isGroceryListScope,
	type GroceryListScope,
	type GroceryScope,
	type GroceryScopeFilter
} from './groceries.scope.rules';
export { GroceriesListState, type GroceryCheckedEntry } from './groceries.list.state.svelte.js';
