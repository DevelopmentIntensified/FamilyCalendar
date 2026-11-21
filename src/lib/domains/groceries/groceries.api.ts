/**
 * groceries api: the browser client for this module's six `/api` routes, on
 * the kernel api client (K-07). Returns `ApiResult`, so the page's state class
 * rolls back and explains instead of catching.
 *
 * The wire's asymmetries are named here so no component rediscovers them: the
 * scope travels in the QUERY for the list read and the delete, and in the BODY
 * for the add, the item patch and the colour write (Q-034).
 *
 * Doc: ./README.md#public-interface
 */
import { createApiClient, type ApiClient, type ApiResult } from '$lib/kernel/client/apiClient';
import type {
	GroceryAddBody,
	GroceryChangeBody,
	GroceryColourBody,
	GroceryColoursResponse,
	GroceryCreatedResponse,
	GroceryItemsResponse,
	GroceryOkResponse,
	GroceryStoreSuggestionResponse
} from './groceries.contract';
import type { GroceryListScope } from './groceries.scope.rules';

/** The browser surface of this module's endpoints, one method per route. */
export type GroceryApi = {
	list(scope: GroceryListScope): Promise<ApiResult<GroceryItemsResponse>>;
	suggest(
		scope: GroceryListScope,
		name: string
	): Promise<ApiResult<GroceryStoreSuggestionResponse>>;
	add(body: GroceryAddBody): Promise<ApiResult<GroceryCreatedResponse>>;
	change(id: string, body: GroceryChangeBody): Promise<ApiResult<GroceryOkResponse>>;
	remove(id: string, scope: GroceryListScope): Promise<ApiResult<GroceryOkResponse>>;
	colours(): Promise<ApiResult<GroceryColoursResponse>>;
	setColour(body: GroceryColourBody): Promise<ApiResult<GroceryOkResponse>>;
};

export function createGroceryApi(client: ApiClient = createApiClient()): GroceryApi {
	return {
		/** `GET /api/groceries?scope=`: the open items of one scope, oldest first. */
		list(scope: GroceryListScope): Promise<ApiResult<GroceryItemsResponse>> {
			return client.request('GET', `/api/groceries?scope=${encodeURIComponent(scope)}`);
		},
		/** `GET /api/groceries?scope=&suggest=1&name=`: the remembered store, or null. */
		suggest(
			scope: GroceryListScope,
			name: string
		): Promise<ApiResult<GroceryStoreSuggestionResponse>> {
			return client.request(
				'GET',
				`/api/groceries?scope=${encodeURIComponent(scope)}&suggest=1&name=${encodeURIComponent(name)}`
			);
		},
		/** `POST /api/groceries`: quick-add plus an optional store list, 201 with the row. */
		add(body: GroceryAddBody): Promise<ApiResult<GroceryCreatedResponse>> {
			return client.request('POST', '/api/groceries', body);
		},
		/** `PATCH /api/groceries/[id]`: check / uncheck / stores / move. */
		change(id: string, body: GroceryChangeBody): Promise<ApiResult<GroceryOkResponse>> {
			return client.request('PATCH', `/api/groceries/${encodeURIComponent(id)}`, body);
		},
		/** `DELETE /api/groceries/[id]?scope=` — the scope is in the QUERY here. */
		remove(id: string, scope: GroceryListScope): Promise<ApiResult<GroceryOkResponse>> {
			return client.request(
				'DELETE',
				`/api/groceries/${encodeURIComponent(id)}?scope=${encodeURIComponent(scope)}`
			);
		},
		/** `GET /api/groceries/colours`: the viewer's rows plus the palette. */
		colours(): Promise<ApiResult<GroceryColoursResponse>> {
			return client.request('GET', '/api/groceries/colours');
		},
		/** `PATCH /api/groceries/colours`: write or clear one store's colour in one scope. */
		setColour(body: GroceryColourBody): Promise<ApiResult<GroceryOkResponse>> {
			return client.request('PATCH', '/api/groceries/colours', body);
		}
	};
}
