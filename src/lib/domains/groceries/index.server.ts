/**
 * groceries — public server interface: the services, the page load and the six
 * `/api` endpoint handlers.
 *
 * The module's only cross-domain call goes DOWN in rank: `family` (4) supplies
 * the actor's family id through `familyIdForActor`, imported from its own
 * entry (R1: a domain may import a lower-ranked domain). Groceries declares no
 * port, because nothing here needs a higher-ranked module.
 *
 * Doc: ./README.md#public-interface
 */
export {
	createGroceryItem,
	deleteGroceryItem,
	listGroceryItems,
	listGroceryStoreColours,
	loadGroceriesPage,
	setGroceryStoreColour,
	suggestGroceryStore,
	updateGroceryItem,
	type GroceriesPageData,
	type GroceryAddInput,
	type GroceryColourInput,
	type GroceryUpdateInput
} from './groceries.service.server';

export {
	createGroceryItemEndpoint,
	deleteGroceryItemEndpoint,
	groceriesPageLoad,
	listGroceryColoursEndpoint,
	listGroceryItemsEndpoint,
	setGroceryColourEndpoint,
	updateGroceryItemEndpoint
} from './groceries.http.server';
