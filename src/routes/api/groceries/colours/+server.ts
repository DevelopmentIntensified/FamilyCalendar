import {
	listGroceryColoursEndpoint,
	setGroceryColourEndpoint
} from '$lib/domains/groceries/index.server';

export const GET = listGroceryColoursEndpoint.handler;
export const PATCH = setGroceryColourEndpoint.handler;
