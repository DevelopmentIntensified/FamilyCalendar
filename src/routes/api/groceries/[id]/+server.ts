import {
	deleteGroceryItemEndpoint,
	updateGroceryItemEndpoint
} from '$lib/domains/groceries/index.server';

export const PATCH = updateGroceryItemEndpoint.handler;
export const DELETE = deleteGroceryItemEndpoint.handler;
