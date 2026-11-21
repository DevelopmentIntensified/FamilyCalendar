import {
	createGroceryItemEndpoint,
	listGroceryItemsEndpoint
} from '$lib/domains/groceries/index.server';

export const GET = listGroceryItemsEndpoint.handler;
export const POST = createGroceryItemEndpoint.handler;
