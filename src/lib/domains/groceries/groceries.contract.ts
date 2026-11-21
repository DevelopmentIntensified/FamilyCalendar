/**
 * groceries contract: the zod schemas and types for every `/api` request and
 * response the frozen goldens pin. The repo's rows (with real `Date`s) are
 * the kernel table types; they never sit on the wire.
 *
 * Response dates are ISO strings, because that is what the wire and
 * `groceries.http.db.test.ts` carry; a `Date` never sits on the wire. The
 * error copy is the legacy wording, verbatim, as exported constants: the route
 * files that used to hold these strings die with the port, so this is their
 * one home until S6 registers them with `endpoint()`.
 *
 * A non-object body is validated by the object schemas below, whose `error` is
 * the message legacy answered for it (`scope must be mine or family` for the
 * body routes, `store and color are required` for the colour route).
 *
 * Doc: ./README.md#invariants
 */
import { isoInstant, oneOf, z } from '$lib/kernel/validation/validators';
import { GROCERY_API_SCOPES } from './groceries.scope.rules';

// --- Wire copy --------------------------------------------------------------

/** Every body/query route's 400 for a scope that is absent, `all` or junk. */
export const GROCERY_SCOPE_MESSAGE = 'scope must be mine or family';

/** `POST /api/groceries` with quick-add text that parses to an empty name. */
export const GROCERY_NAME_REQUIRED_MESSAGE = 'Name is required';

/** The `[id]` parameter; a trailing slash leaves it empty (Q-033). */
export const GROCERY_ITEM_ID_MESSAGE = 'Item ID required';

/** The one 404 body, for any row outside the requested scope. */
export const GROCERY_ITEM_NOT_FOUND_MESSAGE = 'Item not found';

/**
 * A malformed or empty JSON body: the sentence legacy's own `request.json()`
 * catch answered. It is the body route's, not the schema's — a literal `null`
 * parses and reaches the schema, which then answers the route's own 400
 * (Q-111), so the two cases keep two different answers.
 */
export const GROCERY_INVALID_JSON_MESSAGE = 'Invalid JSON body';

/** `PATCH /api/groceries/[id]` with an op, or a `stores`/`target` payload, it cannot run. */
export const GROCERY_OP_MESSAGE = 'op must be check, uncheck, stores, or move';

/** `move` to Family when the mover has no family. */
export const GROCERY_NO_FAMILY_MOVE_MESSAGE = 'No family to move to';

/** `PATCH /api/groceries/colours` without a string `store` or `color`. */
export const GROCERY_COLOUR_REQUIRED_MESSAGE = 'store and color are required';

/** `scope: 'family'` on a colour write when the writer has no family. */
export const GROCERY_NO_FAMILY_COLOUR_MESSAGE = 'No family to set a family colour on';

/** A blank store, the no-store group, or a colour outside the palette. */
export const GROCERY_COLOUR_REFUSED_MESSAGE = 'That store or colour cannot take a colour';

// --- `/api/groceries` (GET) -------------------------------------------------

/**
 * `GET /api/groceries?scope=&suggest=&name=`. `scope` is required; `suggest`
 * and `name` are plain strings and their truthiness decides the read (see
 * `grocerySuggestionName`), so they stay permissive here.
 */
export const GroceryListQuery = z.object({
	scope: oneOf(GROCERY_API_SCOPES, GROCERY_SCOPE_MESSAGE),
	suggest: z.string().optional(),
	name: z.string().optional()
});
export type GroceryListQuery = z.infer<typeof GroceryListQuery>;

// --- `/api/groceries` (POST) ------------------------------------------------

/**
 * A non-string quick-add input is "" — legacy parsed that to an empty name and
 * answered `Name is required`, not a schema error.
 */
const wireQuickAdd = z.preprocess(
	(value) => (typeof value === 'string' ? value : ''),
	z.string()
);

/**
 * `stores` is optional and NOT validated as typed input: a non-array is "no
 * stores given" and non-string entries are dropped, which is what the legacy
 * route filtered. Both feed the same auto-fill-or-train decision.
 */
const wireAddedStores = z.preprocess(
	(value) =>
		Array.isArray(value)
			? value.filter((store): store is string => typeof store === 'string')
			: undefined,
	z.array(z.string()).optional()
);

/** `POST /api/groceries` body. */
export const GroceryAddBody = z.object(
	{
		scope: oneOf(GROCERY_API_SCOPES, GROCERY_SCOPE_MESSAGE),
		input: wireQuickAdd,
		stores: wireAddedStores
	},
	{ error: GROCERY_SCOPE_MESSAGE }
);
export type GroceryAddBody = z.infer<typeof GroceryAddBody>;

// --- `/api/groceries/[id]` (PATCH) -----------------------------------------

/**
 * `PATCH /api/groceries/[id]` body. `scope` comes from the BODY (Q-034) and is
 * validated here; `op`, `stores` and `target` are narrowed by
 * `groceryChangeOf` so that one rule owns every shape it refuses and every
 * coercion it applies.
 */
export const GroceryChangeBody = z.object(
	{
		scope: oneOf(GROCERY_API_SCOPES, GROCERY_SCOPE_MESSAGE),
		op: z.unknown().optional(),
		stores: z.unknown().optional(),
		target: z.unknown().optional()
	},
	{ error: GROCERY_SCOPE_MESSAGE }
);
export type GroceryChangeBody = z.infer<typeof GroceryChangeBody>;

/**
 * The `[id]` path segment both `[id]` routes take (Q-033: it is the last one).
 * Legacy only refused an empty one (`if (!id)`), so it is neither trimmed nor
 * otherwise reshaped: whatever else it holds is the id to look up.
 */
export const GroceryItemParams = z.object({
	id: z.string({ error: GROCERY_ITEM_ID_MESSAGE }).min(1, { error: GROCERY_ITEM_ID_MESSAGE })
});
export type GroceryItemParams = z.infer<typeof GroceryItemParams>;

// --- `/api/groceries/[id]` (DELETE) ----------------------------------------

/** `DELETE /api/groceries/[id]?scope=` — the scope is in the QUERY here (Q-034). */
export const GroceryDeleteQuery = z.object(
	{ scope: oneOf(GROCERY_API_SCOPES, GROCERY_SCOPE_MESSAGE) },
	{ error: GROCERY_SCOPE_MESSAGE }
);
export type GroceryDeleteQuery = z.infer<typeof GroceryDeleteQuery>;

// --- `/api/groceries/colours` (PATCH) --------------------------------------

/**
 * `PATCH /api/groceries/colours` body: `store` and `color` must be strings
 * (blank is a later refusal, not a schema error), and `scope` is anything —
 * only the exact string `family` writes the shared row, everything else is
 * the writer's own colour (`groceryColourScopeOf`).
 */
export const GroceryColourBody = z.object(
	{
		store: z.string({ error: GROCERY_COLOUR_REQUIRED_MESSAGE }),
		color: z.string({ error: GROCERY_COLOUR_REQUIRED_MESSAGE }),
		scope: z.unknown().optional()
	},
	{ error: GROCERY_COLOUR_REQUIRED_MESSAGE }
);
export type GroceryColourBody = z.infer<typeof GroceryColourBody>;

// --- Responses --------------------------------------------------------------

/**
 * One grocery item as JSON. `checkedAt` is the column's TEXT value and every
 * item on the wire is open, so it is always `null`; `createdAt` is the real
 * instant, ISO-serialized.
 */
export const GroceryItemResponse = z.object({
	id: z.string(),
	userId: z.string(),
	familyId: z.string().nullable(),
	name: z.string(),
	nameKey: z.string(),
	quantity: z.number().int(),
	stores: z.array(z.string()),
	checkedAt: z.string().nullable(),
	createdAt: isoInstant()
});
export type GroceryItemResponse = z.infer<typeof GroceryItemResponse>;

/** `GET /api/groceries` without `suggest`: the open items of one scope, oldest first. */
export const GroceryItemsResponse = z.object({ items: z.array(GroceryItemResponse) });
export type GroceryItemsResponse = z.infer<typeof GroceryItemsResponse>;

/** `GET /api/groceries?suggest=1&name=`: the remembered store, or `null`. */
export const GroceryStoreSuggestionResponse = z.object({ store: z.string().nullable() });
export type GroceryStoreSuggestionResponse = z.infer<typeof GroceryStoreSuggestionResponse>;

/** `POST /api/groceries` → 201 with the created row. */
export const GroceryCreatedResponse = z.object({ item: GroceryItemResponse });
export type GroceryCreatedResponse = z.infer<typeof GroceryCreatedResponse>;

/** `PATCH`/`DELETE` success, both routes. */
export const GroceryOkResponse = z.object({ ok: z.literal(true) });
export type GroceryOkResponse = z.infer<typeof GroceryOkResponse>;

/** One Store Colour row on the wire; the same shape the rules resolve against. */
export const GroceryColourRowResponse = z.object({
	storeKey: z.string(),
	color: z.string(),
	userId: z.string(),
	familyId: z.string().nullable()
});
export type StoreColourRow = z.infer<typeof GroceryColourRowResponse>;

/** One swatch the palette offers: the key a write may send and its plain label. */
export const GroceryColourSwatchResponse = z.object({
	key: z.string(),
	label: z.string()
});
export type GroceryColourSwatch = z.infer<typeof GroceryColourSwatchResponse>;

/** `GET /api/groceries/colours`. */
export const GroceryColoursResponse = z.object({
	colours: z.array(GroceryColourRowResponse),
	palette: z.array(GroceryColourSwatchResponse)
});
export type GroceryColoursResponse = z.infer<typeof GroceryColoursResponse>;

// --- Page model -------------------------------------------------------------

/**
 * One Grocery Item as the page and its components see it: exactly the fields
 * the list renders and edits. The loader hands repo rows (`createdAt` is a
 * `Date`) and `POST /api/groceries` hands a wire row (ISO string), so the
 * instant is either — the page only uses it to keep the oldest-first order
 * after a local insert.
 */
export type GroceryListItem = {
	readonly id: string;
	readonly name: string;
	readonly quantity: number;
	readonly stores: readonly string[];
	readonly familyId: string | null;
	readonly createdAt: Date | string;
};

/**
 * The `/calendar/groceries` page model: both item lists, the colour rows and
 * the viewer. It is isomorphic (not wire) so the page's state class and its
 * `ui/` components can type their props without importing a `.server` file.
 */
export type GroceriesPageData = {
	readonly mine: GroceryListItem[];
	readonly family: GroceryListItem[];
	readonly hasFamily: boolean;
	readonly userId: string;
	readonly familyId: string | null;
	readonly colours: StoreColourRow[];
};
