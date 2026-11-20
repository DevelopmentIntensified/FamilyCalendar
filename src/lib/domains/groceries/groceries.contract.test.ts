/**
 * The wire contract: every `/api` body, query and response schema. The 400
 * copy and the absent-vs-null coercions are the legacy wire (the goldens in
 * `groceries.http.db.test.ts` pin it), so the S6 handlers must parse with
 * exactly these schemas.
 *
 * Doc: ./README.md#invariants
 */
import { describe, expect, it } from 'vitest';
import { firstIssueMessage, z } from '$lib/kernel/validation/validators';
import {
	GROCERY_COLOUR_REFUSED_MESSAGE,
	GROCERY_COLOUR_REQUIRED_MESSAGE,
	GROCERY_ITEM_ID_MESSAGE,
	GROCERY_ITEM_NOT_FOUND_MESSAGE,
	GROCERY_NAME_REQUIRED_MESSAGE,
	GROCERY_NO_FAMILY_COLOUR_MESSAGE,
	GROCERY_NO_FAMILY_MOVE_MESSAGE,
	GROCERY_OP_MESSAGE,
	GROCERY_SCOPE_MESSAGE,
	GroceryAddBody,
	GroceryChangeBody,
	GroceryColourBody,
	GroceryColoursResponse,
	GroceryCreatedResponse,
	GroceryDeleteQuery,
	GroceryItemParams,
	GroceryItemResponse,
	GroceryItemsResponse,
	GroceryListQuery,
	GroceryOkResponse,
	GroceryStoreSuggestionResponse
} from './groceries.contract';

function messageOf(schema: z.ZodType, value: unknown): string | null {
	const result = schema.safeParse(value);
	return result.success ? null : firstIssueMessage(result.error);
}

const itemWire = {
	id: 'i1',
	userId: 'u1',
	familyId: null as string | null,
	name: 'Milk',
	nameKey: 'milk',
	quantity: 2,
	stores: ['Aldi', 'Lidl'],
	checkedAt: null as string | null,
	createdAt: '2026-01-01T00:00:00.000Z'
};

describe('wire copy', () => {
	it('is the legacy wording, verbatim', () => {
		expect({
			scope: GROCERY_SCOPE_MESSAGE,
			name: GROCERY_NAME_REQUIRED_MESSAGE,
			id: GROCERY_ITEM_ID_MESSAGE,
			notFound: GROCERY_ITEM_NOT_FOUND_MESSAGE,
			op: GROCERY_OP_MESSAGE,
			noFamilyMove: GROCERY_NO_FAMILY_MOVE_MESSAGE,
			colourRequired: GROCERY_COLOUR_REQUIRED_MESSAGE,
			noFamilyColour: GROCERY_NO_FAMILY_COLOUR_MESSAGE,
			colourRefused: GROCERY_COLOUR_REFUSED_MESSAGE
		}).toEqual({
			scope: 'scope must be mine or family',
			name: 'Name is required',
			id: 'Item ID required',
			notFound: 'Item not found',
			op: 'op must be check, uncheck, stores, or move',
			noFamilyMove: 'No family to move to',
			colourRequired: 'store and color are required',
			noFamilyColour: 'No family to set a family colour on',
			colourRefused: 'That store or colour cannot take a colour'
		});
	});
});

describe('GroceryListQuery', () => {
	it.each<[string, Record<string, string>]>([
		['mine', { scope: 'mine' }],
		['family', { scope: 'family' }],
		['a suggest read', { scope: 'mine', suggest: '1', name: 'milk' }],
		['an empty suggest', { scope: 'family', suggest: '', name: '' }]
	])('parses %s', (_label, query) => {
		expect(GroceryListQuery.parse(query)).toEqual(query);
	});

	it.each<[string, Record<string, string>]>([
		['an absent scope', {}],
		['all, which exists only on the page', { scope: 'all' }],
		['junk', { scope: 'nonsense' }],
		['a different case', { scope: 'Mine' }],
		['an empty scope', { scope: '' }]
	])('answers the scope 400 for %s', (_label, query) => {
		expect(messageOf(GroceryListQuery, query)).toBe(GROCERY_SCOPE_MESSAGE);
	});
});

describe('GroceryAddBody', () => {
	it('parses the documented body', () => {
		expect(GroceryAddBody.parse({ scope: 'family', input: 'milk 2', stores: ['Aldi'] })).toEqual({
			scope: 'family',
			input: 'milk 2',
			stores: ['Aldi']
		});
	});

	it.each<[string, unknown]>([
		['an absent scope', { input: 'milk' }],
		['all', { scope: 'all', input: 'milk' }],
		['junk', { scope: 'nonsense', input: 'milk' }],
		['a non-string scope', { scope: 1, input: 'milk' }],
		['an array body', []],
		['a string body', 'milk'],
		['a number body', 42]
	])('answers the scope 400 for %s', (_label, body) => {
		expect(messageOf(GroceryAddBody, body)).toBe(GROCERY_SCOPE_MESSAGE);
	});

	it.each<[string, Record<string, unknown>]>([
		['absent', { scope: 'mine' }],
		['null', { scope: 'mine', input: null }],
		['a number', { scope: 'mine', input: 5 }],
		['an object', { scope: 'mine', input: { text: 'milk' } }]
	])('turns a %s input into the empty text the route then refuses as a name', (_label, body) => {
		// Legacy: `isString(body.input) ? body.input : ''` -> "Name is required", not a schema 400.
		expect(GroceryAddBody.parse(body).input).toBe('');
	});

	it.each<[string, Record<string, unknown>, string[] | undefined]>([
		['absent stores are "none given"', { scope: 'mine', input: 'milk' }, undefined],
		['null stores are "none given"', { scope: 'mine', input: 'milk', stores: null }, undefined],
		['a string stores is "none given"', { scope: 'mine', input: 'milk', stores: 'Aldi' }, undefined],
		['an empty list stays empty', { scope: 'mine', input: 'milk', stores: [] }, []],
		[
			'non-string entries are dropped, never a 400',
			{ scope: 'mine', input: 'milk', stores: ['Aldi', 3, null, 'Lidl', {}] },
			['Aldi', 'Lidl']
		],
		[
			'entries are not cleaned on the wire (the write path does that)',
			{ scope: 'mine', input: 'milk', stores: [' Aldi ', 'aldi', ''] },
			[' Aldi ', 'aldi', '']
		]
	])('%s', (_label, body, expected) => {
		expect(GroceryAddBody.parse(body).stores).toEqual(expected);
	});
});

describe('GroceryChangeBody', () => {
	it('parses a body and leaves op, stores and target for groceryChangeOf', () => {
		const body = { scope: 'family', op: 'move', stores: 'junk', target: 'mine' };
		expect(GroceryChangeBody.parse(body)).toEqual(body);
	});

	it('needs only a scope; an absent op is the op 400 the narrowing rule answers', () => {
		expect(GroceryChangeBody.parse({ scope: 'mine' })).toEqual({ scope: 'mine' });
	});

	it.each<[string, unknown]>([
		['an absent scope', { op: 'check' }],
		['all', { scope: 'all', op: 'check' }],
		['junk', { scope: 'nonsense', op: 'check' }],
		['a non-string scope', { scope: true, op: 'check' }],
		['an array body', []],
		['a string body', 'check']
	])('answers the scope 400 for %s', (_label, body) => {
		expect(messageOf(GroceryChangeBody, body)).toBe(GROCERY_SCOPE_MESSAGE);
	});
});

describe('GroceryItemParams', () => {
	it('parses an id and leaves it exactly as it came', () => {
		expect(GroceryItemParams.parse({ id: 'item-1' })).toEqual({ id: 'item-1' });
		expect(GroceryItemParams.parse({ id: ' padded ' })).toEqual({ id: ' padded ' });
	});

	it.each<[string, unknown]>([
		// Q-033: a trailing slash leaves the last path segment empty.
		['an empty id (a trailing slash)', { id: '' }],
		['an absent id', {}]
	])('answers 400 "Item ID required" for %s', (_label, params) => {
		expect(messageOf(GroceryItemParams, params)).toBe(GROCERY_ITEM_ID_MESSAGE);
	});
});

describe('GroceryDeleteQuery', () => {
	it.each<[string, string]>([
		['mine', 'mine'],
		['family', 'family']
	])('parses scope=%s', (_label, scope) => {
		expect(GroceryDeleteQuery.parse({ scope })).toEqual({ scope });
	});

	it.each<[string, Record<string, string>]>([
		// Q-034: DELETE takes its scope in the QUERY; there is no body.
		['an absent scope', {}],
		['all', { scope: 'all' }],
		['junk', { scope: 'nonsense' }]
	])('answers the scope 400 for %s', (_label, query) => {
		expect(messageOf(GroceryDeleteQuery, query)).toBe(GROCERY_SCOPE_MESSAGE);
	});
});

describe('GroceryColourBody', () => {
	it('parses the documented body', () => {
		const body = { store: 'Aldi', color: 'sky', scope: 'family' };
		expect(GroceryColourBody.parse(body)).toEqual(body);
	});

	it.each<[string, Record<string, unknown>]>([
		['a blank store', { store: '   ', color: 'sky' }],
		['the no-store label', { store: 'Any store', color: 'sky' }],
		['a colour outside the palette', { store: 'Aldi', color: 'chartreuse' }],
		['auto', { store: 'Aldi', color: 'auto' }]
	])('leaves %s to the write rule, not the schema', (_label, body) => {
		expect(GroceryColourBody.safeParse(body).success).toBe(true);
	});

	it.each<[string, unknown]>([
		['the exact string family', 'family'],
		['junk', 'nonsense'],
		['a number', 7],
		['an object', { x: 1 }]
	])('passes a %s scope through; groceryColourScopeOf decides what it means', (_label, scope) => {
		expect(GroceryColourBody.parse({ store: 'Aldi', color: 'sky', scope }).scope).toEqual(scope);
	});

	it.each<[string, unknown]>([
		['an absent store', { color: 'sky' }],
		['an absent colour', { store: 'Aldi' }],
		['a non-string store', { store: 5, color: 'sky' }],
		['a non-string colour', { store: 'Aldi', color: null }],
		['an empty object', {}],
		['an array body', []],
		['a string body', 'x']
	])('answers 400 "store and color are required" for %s', (_label, body) => {
		expect(messageOf(GroceryColourBody, body)).toBe(GROCERY_COLOUR_REQUIRED_MESSAGE);
	});
});

describe('response schemas', () => {
	it('describes one item on the wire, with an ISO createdAt and never a Date', () => {
		expect(GroceryItemResponse.parse(itemWire)).toEqual(itemWire);
		expect(GroceryItemResponse.safeParse({ ...itemWire, createdAt: new Date() }).success).toBe(false);
		expect(GroceryItemResponse.safeParse({ ...itemWire, createdAt: 'yesterday' }).success).toBe(false);
	});

	it('describes a Family item and a checked-off timestamp', () => {
		const family = { ...itemWire, familyId: 'fam1', checkedAt: '2026-01-02T00:00:00.000Z' };
		expect(GroceryItemResponse.parse(family)).toEqual(family);
	});

	it.each<[string, Record<string, unknown>]>([
		['a fractional quantity', { quantity: 1.5 }],
		['a non-array stores', { stores: 'Aldi' }],
		['a missing nameKey', { nameKey: undefined }]
	])('refuses an item with %s', (_label, override) => {
		expect(GroceryItemResponse.safeParse({ ...itemWire, ...override }).success).toBe(false);
	});

	it('describes the list, the suggestion and the created item', () => {
		expect(GroceryItemsResponse.parse({ items: [itemWire] })).toEqual({ items: [itemWire] });
		expect(GroceryItemsResponse.parse({ items: [] })).toEqual({ items: [] });
		expect(GroceryStoreSuggestionResponse.parse({ store: 'Aldi' })).toEqual({ store: 'Aldi' });
		expect(GroceryStoreSuggestionResponse.parse({ store: null })).toEqual({ store: null });
		expect(GroceryCreatedResponse.parse({ item: itemWire })).toEqual({ item: itemWire });
	});

	it('describes the acknowledgement, which is only ever ok: true', () => {
		expect(GroceryOkResponse.parse({ ok: true })).toEqual({ ok: true });
		expect(GroceryOkResponse.safeParse({ ok: false }).success).toBe(false);
	});

	it('describes the colours read: rows plus the palette', () => {
		const wire = {
			colours: [
				{ storeKey: 'aldi', color: 'sky', userId: 'u1', familyId: null },
				{ storeKey: 'aldi', color: 'sage', userId: 'u2', familyId: 'fam1' }
			],
			palette: [
				{ key: 'terracotta', label: 'Terracotta' },
				{ key: 'sky', label: 'Blue' }
			]
		};
		expect(GroceryColoursResponse.parse(wire)).toEqual(wire);
		expect(GroceryColoursResponse.parse({ colours: [], palette: [] })).toEqual({
			colours: [],
			palette: []
		});
		expect(GroceryColoursResponse.safeParse({ colours: [{ storeKey: 'aldi' }], palette: [] }).success).toBe(
			false
		);
	});
});
