/**
 * groceries http: the six `/api` handlers over the services, plus the
 * `/calendar/groceries` page load.
 *
 * Reproduces the legacy wire exactly: signed-in (`user`) on every route, no
 * rate limit today, 201 on add, the scope in the BODY for PATCH and in the
 * QUERY for DELETE (Q-034), the `[id]` as the path's last segment (Q-033), and
 * the legacy 500 copy per route. No SQL and no rules — the services own both.
 *
 * The three body routes read their own JSON through `groceryJsonBody`:
 * `endpoint()`'s default mode answers the kernel's `Invalid JSON`, and its
 * lenient mode hands the schema `null` for a malformed body as well — but a
 * malformed body keeps `Invalid JSON body` while a literal `null` reaches the
 * schema and gets the route's own 400 (Q-111). One sentence per case needs the
 * read to happen before the schema, here.
 *
 * Doc: ./README.md#public-interface
 */
import type { GroceryItemRow } from '$lib/kernel/db/tables.server';
import { invalid } from '$lib/kernel/errors/appError';
import { created, endpoint, ok } from '$lib/kernel/http/endpoint.server';
import { pageLoad } from '$lib/kernel/http/pageHandlers.server';
import { toInstantString } from '$lib/kernel/time/dates';
import { firstIssueMessage, z } from '$lib/kernel/validation/validators';
import {
	GROCERY_INVALID_JSON_MESSAGE,
	GroceryAddBody,
	GroceryChangeBody,
	GroceryColourBody,
	GroceryDeleteQuery,
	GroceryItemParams,
	GroceryListQuery,
	type GroceryColoursResponse,
	type GroceryCreatedResponse,
	type GroceryItemResponse,
	type GroceryItemsResponse,
	type GroceryOkResponse,
	type GroceryStoreSuggestionResponse
} from './groceries.contract';
import { grocerySuggestionName } from './groceries.items.rules';
import {
	createGroceryItem,
	deleteGroceryItem,
	listGroceryItems,
	listGroceryStoreColours,
	loadGroceriesPage,
	setGroceryStoreColour,
	suggestGroceryStore,
	updateGroceryItem
} from './groceries.service.server';

/** A stored `Date` is always valid; a null instant is a fault, not a wire value. */
function instant(value: Date): string {
	const text = toInstantString(value);
	if (text === null) throw new Error('groceries http: invalid timestamp');
	return text;
}

/** One item as the wire sends it: the row, with `createdAt` as its ISO instant. */
function groceryItemWire(row: GroceryItemRow): GroceryItemResponse {
	return { ...row, createdAt: instant(row.createdAt) };
}

/** The `{ok:true}` body both write routes answer (PATCH and DELETE). */
const OK: GroceryOkResponse = { ok: true };

/**
 * The `[id]` segment: the path's LAST one, exactly as legacy read it
 * (`url.pathname.split('/').pop()`), so a trailing slash leaves it empty and
 * the contract answers `Item ID required` (Q-033). It is deliberately not read
 * from `event.params`: the wire's rule is the path segment itself.
 */
function groceryItemId(pathname: string): string {
	return GroceryItemParams.parse({ id: pathname.split('/').pop() ?? '' }).id;
}

/**
 * One JSON body, read the way legacy's own `request.json()` did: a malformed
 * or empty body is `Invalid JSON body`, then the contract decides everything
 * else (Q-111 keeps the parsed `null` on the schema's own 400).
 */
async function groceryJsonBody<S extends z.ZodType>(
	request: Request,
	schema: S
): Promise<z.output<S>> {
	let text: string;
	try {
		text = await request.text();
	} catch {
		throw invalid(GROCERY_INVALID_JSON_MESSAGE);
	}
	if (!text.trim()) throw invalid(GROCERY_INVALID_JSON_MESSAGE);
	let raw: unknown;
	try {
		raw = JSON.parse(text);
	} catch {
		throw invalid(GROCERY_INVALID_JSON_MESSAGE);
	}
	const parsed = schema.safeParse(raw);
	if (!parsed.success) throw invalid(firstIssueMessage(parsed.error));
	return parsed.data;
}

/**
 * `GET /api/groceries?scope=&suggest=&name=`: the open items of one scope, or
 * the remembered store when `?suggest` and `?name` ask for one.
 */
export const listGroceryItemsEndpoint = endpoint({
	auth: 'user',
	query: GroceryListQuery,
	failMessage: 'Failed to fetch groceries',
	handle: async ({ ctx, actor, query }) => {
		const name = grocerySuggestionName(query);
		if (name !== null) {
			const store = await suggestGroceryStore(ctx, actor, { scope: query.scope, name });
			const response: GroceryStoreSuggestionResponse = { store };
			return ok(response);
		}
		const items = await listGroceryItems(ctx, actor, { scope: query.scope });
		const response: GroceryItemsResponse = { items: items.map(groceryItemWire) };
		return ok(response);
	}
});

/** `POST /api/groceries`: quick-add, 201 with the created row. */
export const createGroceryItemEndpoint = endpoint({
	auth: 'user',
	failMessage: 'Failed to add item',
	handle: async ({ ctx, actor, event }) => {
		const body = await groceryJsonBody(event.request, GroceryAddBody);
		const item = await createGroceryItem(ctx, actor, body);
		const response: GroceryCreatedResponse = { item: groceryItemWire(item) };
		return created(response);
	}
});

/** `PATCH /api/groceries/[id]`: check / uncheck / replace stores / move. */
export const updateGroceryItemEndpoint = endpoint({
	auth: 'user',
	failMessage: 'Failed to update item',
	handle: async ({ ctx, actor, event }) => {
		// The id is refused before the body is read, as legacy's route did (Q-033).
		const id = groceryItemId(event.url.pathname);
		const body = await groceryJsonBody(event.request, GroceryChangeBody);
		await updateGroceryItem(ctx, actor, {
			scope: body.scope,
			id,
			op: body.op,
			stores: body.stores,
			target: body.target
		});
		return ok(OK);
	}
});

/** `DELETE /api/groceries/[id]?scope=`: remove the row, keep Store Memory. */
export const deleteGroceryItemEndpoint = endpoint({
	auth: 'user',
	query: GroceryDeleteQuery,
	failMessage: 'Failed to delete item',
	handle: async ({ ctx, actor, query, event }) => {
		const id = groceryItemId(event.url.pathname);
		await deleteGroceryItem(ctx, actor, { scope: query.scope, id });
		return ok(OK);
	}
});

/** `GET /api/groceries/colours`: the viewer's colour rows plus the palette. */
export const listGroceryColoursEndpoint = endpoint({
	auth: 'user',
	failMessage: 'Failed to fetch store colours',
	handle: async ({ ctx, actor }) => {
		const response: GroceryColoursResponse = await listGroceryStoreColours(ctx, actor);
		return ok(response);
	}
});

/** `PATCH /api/groceries/colours`: write or clear one store's colour in one scope. */
export const setGroceryColourEndpoint = endpoint({
	auth: 'user',
	failMessage: 'Failed to set the colour',
	handle: async ({ ctx, actor, event }) => {
		const body = await groceryJsonBody(event.request, GroceryColourBody);
		await setGroceryStoreColour(ctx, actor, body);
		return ok(OK);
	}
});

/**
 * `load` for `/calendar/groceries`: signed-in only (302 to `/login` otherwise),
 * returning the whole page model (legacy's `{mine, family, hasFamily, userId,
 * familyId, colours}`; S7 redesigns the page model with the screen).
 */
export const groceriesPageLoad = pageLoad({
	auth: 'user',
	handle: async ({ ctx, actor }) => loadGroceriesPage(ctx, actor)
});
