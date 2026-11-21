/**
 * The groceries page state, in node with a fake api and `memoryToasts()`: the
 * filter and the add form's scope, the debounced Store Memory suggestion, every
 * optimistic write with its rollback and copy, the checked rail's Undo, the
 * local list edits and the scoped colour flips (115).
 *
 * No DOM and no `vi.mock` (R9): the api is a plain object, and the Store Memory
 * debounce runs on `manualScheduler`.
 *
 * Doc: ./README.md#invariants
 */
import { describe, expect, it } from 'vitest';
import { memoryToasts } from '$lib/kernel/client/toasts.svelte';
import { manualScheduler } from '$lib/kernel/testing/manualScheduler';
import type { GroceryApi } from './groceries.api';
import {
	type GroceriesPageData,
	type GroceryItemResponse,
	type GroceryListItem,
	type StoreColourRow
} from './groceries.contract';
import { GroceriesListState } from './groceries.list.state.svelte';

const VIEWER = 'u1';
const FAMILY = 'fam1';

function entry(overrides: Partial<GroceryListItem> & { id: string }): GroceryListItem {
	return {
		name: 'Milk',
		quantity: 1,
		stores: ['Aldi'],
		familyId: null,
		createdAt: '2026-03-01T09:00:00.000Z',
		...overrides
	};
}

function wireItem(overrides: Partial<GroceryItemResponse> & { id: string }): GroceryItemResponse {
	return {
		userId: VIEWER,
		familyId: null,
		name: 'Milk',
		nameKey: 'milk',
		quantity: 1,
		stores: [],
		checkedAt: null,
		createdAt: '2026-03-09T09:00:00.000Z',
		...overrides
	};
}

function pageData(overrides: Partial<GroceriesPageData> = {}): GroceriesPageData {
	return {
		mine: [
			entry({ id: 'm1', name: 'Milk', stores: ['Aldi'], quantity: 2 }),
			entry({
				id: 'm2',
				name: 'Eggs',
				stores: ['Lidl'],
				createdAt: '2026-03-02T09:00:00.000Z'
			})
		],
		family: [
			entry({
				id: 'f1',
				name: 'Bread',
				stores: ['Aldi'],
				familyId: FAMILY,
				createdAt: '2026-03-03T09:00:00.000Z'
			})
		],
		hasFamily: true,
		userId: VIEWER,
		familyId: FAMILY,
		colours: [],
		...overrides
	};
}

function row(storeKey: string, color: string, familyId: string | null = null): StoreColourRow {
	return { storeKey, color, userId: VIEWER, familyId };
}

/** A fake api that records its calls; each method's answer can be overridden. */
function fakeApi(overrides: Partial<GroceryApi> = {}): GroceryApi & { calls: string[] } {
	const calls: string[] = [];
	return {
		calls,
		list: async (scope) => {
			calls.push(`list ${scope}`);
			return { ok: true, data: { items: [] } };
		},
		suggest: async (scope, name) => {
			calls.push(`suggest ${scope} ${name}`);
			return { ok: true, data: { store: null } };
		},
		add: async (body) => {
			calls.push(`add ${body.scope} ${body.input}`);
			return { ok: true, data: { item: wireItem({ id: 'new', name: body.input }) } };
		},
		change: async (id, body) => {
			calls.push(`change ${id} ${String(body.op)}`);
			return { ok: true, data: { ok: true } };
		},
		remove: async (id, scope) => {
			calls.push(`remove ${id} ${scope}`);
			return { ok: true, data: { ok: true } };
		},
		colours: async () => {
			calls.push('colours');
			return { ok: true, data: { colours: [], palette: [] } };
		},
		setColour: async (body) => {
			calls.push(`setColour ${body.store} ${body.color} ${String(body.scope)}`);
			return { ok: true, data: { ok: true } };
		},
		...overrides
	};
}

function makeState(options: {
	api?: Partial<GroceryApi>;
	data?: GroceriesPageData;
	scopeParam?: string | null;
}) {
	const api = fakeApi(options.api);
	const toasts = memoryToasts();
	const scheduler = manualScheduler();
	const state = new GroceriesListState(api, toasts, options.data ?? pageData(), {
		scopeParam: options.scopeParam ?? null,
		schedule: scheduler.schedule
	});
	return { api, toasts, scheduler, state };
}

describe('GroceriesListState — the one list and its filter', () => {
	it('opens on All unless ?scope= names a real scope; junk falls back to All', () => {
		expect(makeState({}).state.filter).toBe('all');
		expect(makeState({ scopeParam: 'mine' }).state.filter).toBe('mine');
		expect(makeState({ scopeParam: 'everything' }).state.filter).toBe('all');
	});

	it('counts each filter over BOTH scopes, not the visible list', () => {
		const { state } = makeState({});
		expect([state.count('all'), state.count('mine'), state.count('family')]).toEqual([3, 2, 1]);
	});

	it('narrows to one scope and widens back', () => {
		const { state } = makeState({});
		state.setFilter('family');
		expect(state.visibleItems.map((item) => item.id)).toEqual(['f1']);
		state.setFilter('all');
		expect(state.visibleItems.map((item) => item.id)).toEqual(['f1', 'm1', 'm2']);
	});

	it('picking a scope filter follows into the add form, so the two cannot disagree', () => {
		const { state } = makeState({});
		expect(state.addScope).toBe('family');
		state.setFilter('mine');
		expect(state.addScope).toBe('mine');
		state.setFilter('all');
		expect(state.addScope).toBe('mine');
	});

	it('groups by store across scopes, with the family row filed under the same shop', () => {
		const { state } = makeState({});
		expect(state.groups.map((group) => [group.store, group.items.map((item) => item.id)])).toEqual([
			['Aldi', ['f1', 'm1']],
			['Lidl', ['m2']]
		]);
	});

	it('summarises each group with its item count and total quantity', () => {
		const { state } = makeState({});
		const aldi = state.groups[0];
		if (!aldi) throw new Error('expected the Aldi group');
		expect(state.summary(aldi.items)).toBe('2 items · 3 total');
	});

	it('searches by item name and by store, and says what it is searching for', () => {
		const { state } = makeState({});
		state.setSearch('lidl');
		expect(state.visibleItems.map((item) => item.id)).toEqual(['m2']);
		expect(state.queryActive).toBe(true);
		state.setSearch('  ');
		expect(state.queryActive).toBe(false);
		expect(state.visibleItems).toHaveLength(3);
	});

	it('writes the empty state per filter and per search', () => {
		const { state } = makeState({});
		state.setSearch('zzz');
		expect(state.emptyCopy).toBe('No items match “zzz”.');
		state.setSearch('');
		state.setFilter('mine');
		state.setSearch('zzz');
		expect(state.emptyCopy).toBe('No items match “zzz”.');
		state.setSearch('');
		state.mine = [];
		expect(state.emptyCopy).toBe('Your list is empty. Add the first item.');
	});
});

describe('GroceriesListState — quick-add', () => {
	it('looks the Store Memory suggestion up after the typing pause, for the form’s scope', async () => {
		const seen: string[] = [];
		const { scheduler, state } = makeState({
			api: {
				suggest: async (scope, name) => {
					seen.push(`${scope} ${name}`);
					return { ok: true, data: { store: 'Aldi' } };
				}
			}
		});
		state.setFilter('mine');
		state.setInput('mi');
		expect(seen).toEqual([]);
		scheduler.fireAll();
		await Promise.resolve();
		await Promise.resolve();
		expect(seen).toEqual(['mine mi']);
		expect(state.suggested).toBe('Aldi');
	});

	it('clears the suggestion when the field empties, and copies it into the store field', () => {
		const { state } = makeState({});
		state.suggested = 'Aldi';
		state.useSuggestion();
		expect(state.storeInput).toBe('Aldi');
		state.setInput('');
		expect(state.suggested).toBeNull();
	});

	it('adds to the form’s scope and toasts the store the CREATED row carries (Q-038 B)', async () => {
		const bodies: { scope: string; input: string; stores?: string[] }[] = [];
		const { toasts, state } = makeState({
			api: {
				add: async (body) => {
					bodies.push(body);
					return {
						ok: true,
						data: {
							item: wireItem({ id: 'new', name: 'Oat milk', stores: ['Whole Foods Market'] })
						}
					};
				}
			}
		});
		state.setInput('oat milk');
		state.setAddScope('family');
		await state.add();

		expect(bodies).toEqual([{ scope: 'family', input: 'oat milk', stores: undefined }]);
		expect(state.family.map((item) => item.id)).toContain('new');
		expect(state.input).toBe('');
		expect(toasts.items).toEqual([
			{ kind: 'success', text: 'Added "oat milk" to Family — Whole Foods Market.' }
		]);
	});

	it('cleans and de-duplicates the typed store list before sending it', async () => {
		const bodies: { scope: string; input: string; stores?: string[] }[] = [];
		const { state } = makeState({
			api: {
				add: async (body) => {
					bodies.push(body);
					return { ok: true, data: { item: wireItem({ id: 'new' }) } };
				}
			}
		});
		state.setInput('milk');
		state.setStoreInput(' Aldi, aldi , Costco ');
		await state.add();
		expect(bodies).toEqual([{ scope: 'family', input: 'milk', stores: ['Aldi', 'Costco'] }]);
	});

	it('names the refusal in the error region and keeps the typed text', async () => {
		const { state } = makeState({
			api: { add: async () => ({ ok: false, status: 400, error: 'Name is required' }) }
		});
		state.setInput('   ');
		expect(state.error).toBe('');
		state.setInput('milk');
		await state.add();
		expect(state.error).toBe('Name is required');
		expect(state.input).toBe('milk');
	});
});

describe('GroceriesListState — check-off and the checked rail', () => {
	it('checks a row off optimistically, then moves it to the rail with an Undo toast', async () => {
		const { toasts, state } = makeState({});
		const milk = state.mine[0];
		if (!milk) throw new Error('expected a Mine row');

		const promise = state.check(milk);
		expect(state.allItems.map((item) => item.id)).not.toContain('m1');
		await promise;

		expect(state.checked).toEqual([{ item: milk, scope: 'mine' }]);
		expect(toasts.items[0]?.text).toBe('Checked off "Milk".');
		expect(toasts.items[0]?.action?.label).toBe('Undo');
	});

	it('puts a row back when the check is refused, and names the failure', async () => {
		const { state } = makeState({
			api: { change: async () => ({ ok: false, status: 500, error: 'Failed to update item' }) }
		});
		const milk = state.mine[0];
		if (!milk) throw new Error('expected a Mine row');

		await state.check(milk);

		expect(state.mine.map((item) => item.id)).toEqual(['m1', 'm2']);
		expect(state.checked).toEqual([]);
		expect(state.error).toBe("Couldn't check that off. Try again.");
	});

	it('unchecks on the scope the row came from and puts it back on that list', async () => {
		const { api, toasts, state } = makeState({});
		const bread = state.family[0];
		if (!bread) throw new Error('expected a Family row');
		state.checked = [{ item: bread, scope: 'family' }];
		state.family = [];

		await state.uncheck(bread, 'family');

		expect(api.calls).toEqual(['change f1 uncheck']);
		expect(state.family.map((item) => item.id)).toEqual(['f1']);
		expect(toasts.items[0]?.text).toBe('Put "Bread" back on the list.');
	});

	it('keeps the row in the rail when uncheck is refused', async () => {
		const { state } = makeState({
			api: { change: async () => ({ ok: false, status: 0, error: 'Network problem. Try again.' }) }
		});
		const milk = state.mine[0];
		if (!milk) throw new Error('expected a Mine row');
		state.checked = [{ item: milk, scope: 'mine' }];

		await state.uncheck(milk, 'mine');

		expect(state.checked).toHaveLength(1);
		expect(state.error).toBe("Couldn't put that back — check your connection and try again.");
	});

	it('is optimistic with the scope the row lives on, not the filter', async () => {
		const { api, state } = makeState({});
		state.setFilter('family');
		const milk = state.mine[0];
		if (!milk) throw new Error('expected a Mine row');

		await state.check(milk);

		expect(api.calls).toEqual(['change m1 check']);
		expect(state.checked[0]?.scope).toBe('mine');
	});
});

describe('GroceriesListState — store editor, move, delete', () => {
	it('saves the cleaned store list and confirms it', async () => {
		const { api, toasts, state } = makeState({});
		const milk = state.mine[0];
		if (!milk) throw new Error('expected a Mine row');
		state.startEditing(milk);
		expect(state.editStores).toBe('Aldi');
		state.setEditStores(' Tesco, tesco ');
		await state.saveStores(milk);

		expect(api.calls).toEqual(['change m1 stores']);
		expect(state.mine[0]?.stores).toEqual(['Tesco']);
		expect(state.editingId).toBeNull();
		expect(toasts.items[0]?.text).toBe('Stores updated for "Milk".');
	});

	it('keeps the editor open and the old stores when the save is refused', async () => {
		const { state } = makeState({
			api: { change: async () => ({ ok: false, status: 400, error: 'Item not found' }) }
		});
		const milk = state.mine[0];
		if (!milk) throw new Error('expected a Mine row');
		state.startEditing(milk);
		state.setEditStores('Tesco');
		await state.saveStores(milk);

		expect(state.editingId).toBe('m1');
		expect(state.mine[0]?.stores).toEqual(['Aldi']);
		expect(state.error).toBe("Couldn't save stores. Try again.");
	});

	it('moves a row to ITS other scope and names the destination', async () => {
		const { api, toasts, state } = makeState({});
		const milk = state.mine[0];
		if (!milk) throw new Error('expected a Mine row');

		await state.move(milk);

		expect(api.calls).toEqual(['change m1 move']);
		expect(state.mine.map((item) => item.id)).toEqual(['m2']);
		// The family list is oldest-first too, so the moved row lands before Bread.
		expect(state.family.map((item) => item.id)).toEqual(['m1', 'f1']);
		expect(state.family.find((item) => item.id === 'm1')?.familyId).toBe(FAMILY);
		expect(toasts.items[0]?.text).toBe('Moved "Milk" to Family.');
	});

	it('removes a row and keeps the copy’s promise about Store Memory', async () => {
		const { api, toasts, state } = makeState({});
		const milk = state.mine[0];
		if (!milk) throw new Error('expected a Mine row');

		await state.removeItem(milk);

		expect(api.calls).toEqual(['remove m1 mine']);
		expect(state.allItems.map((item) => item.id)).not.toContain('m1');
		expect(toasts.items[0]?.text).toBe('Removed "Milk" — store memory kept.');
	});

	it('leaves the row alone and names the failure when the delete is refused', async () => {
		const { state } = makeState({
			api: { remove: async () => ({ ok: false, status: 404, error: 'Item not found' }) }
		});
		const milk = state.mine[0];
		if (!milk) throw new Error('expected a Mine row');

		await state.removeItem(milk);

		expect(state.allItems.map((item) => item.id)).toContain('m1');
		expect(state.error).toBe("Couldn't remove that. Try again.");
	});
});

describe('GroceriesListState — store colours (096/115)', () => {
	it('paints a store by name before any row is written, and flips it with a truthful toast', async () => {
		const { api, toasts, state } = makeState({});
		expect(state.colourOf('Aldi')?.label).toBe('Mint');

		await state.setColour('Aldi', 'sky', 'family');

		expect(api.calls).toEqual(['setColour Aldi sky family']);
		expect(state.colourOf('Aldi')?.label).toBe('Blue');
		expect(state.pickerValue('Aldi', 'family')).toBe('sky');
		expect(toasts.items[0]?.text).toBe('Aldi is now Blue.');
	});

	it('says a personal flip is the person’s alone', async () => {
		const { toasts, state } = makeState({});
		await state.setColour('Aldi', 'amber', 'personal');
		expect(toasts.items[0]?.text).toBe('Aldi is now Amber (just you).');
	});

	it('auto clears that ONE scope’s row and says so', async () => {
		const { state } = makeState({
			data: pageData({ colours: [row('aldi', 'sky'), row('aldi', 'sage', FAMILY)] })
		});
		await state.setColour('Aldi', 'auto', 'personal');
		expect(state.pickerValue('Aldi', 'personal')).toBe('auto');
		expect(state.pickerValue('Aldi', 'family')).toBe('sage');
	});

	it('reverts the optimistic flip and names the failure when the write is refused', async () => {
		const { state } = makeState({
			data: pageData({ colours: [row('aldi', 'sky')] }),
			api: { setColour: async () => ({ ok: false, status: 500, error: 'Failed to set the colour' }) }
		});
		await state.setColour('Aldi', 'sage', 'family');
		expect(state.colourOf('Aldi')?.label).toBe('Blue');
		expect(state.error).toBe("Couldn't set that colour. Try again.");
		expect(state.colourBusy).toBe(false);
	});

	it('does not re-label a flip when the Everyone / Just me control moves afterwards (115)', async () => {
		const { state } = makeState({});
		await state.setColour('Aldi', 'sky', 'personal');
		state.setColourScope('family');
		state.setRailScope('family');
		expect(state.pickerValue('Aldi', 'personal')).toBe('sky');
		expect(state.pickerValue('Aldi', 'family')).toBe('auto');
	});

	it('opens a group picker on Everyone when there is a family, and Just me when there is not', () => {
		const withFamily = makeState({}).state;
		withFamily.openColour('Aldi');
		expect([withFamily.colourStore, withFamily.colourScope]).toEqual(['Aldi', 'family']);

		const lone = makeState({
			data: pageData({ hasFamily: false, familyId: null, family: [] })
		}).state;
		lone.openColour('Aldi');
		expect([lone.colourStore, lone.colourScope]).toEqual(['Aldi', 'personal']);
	});

	it('lists the card’s shops from BOTH scopes and discloses a shared swatch', () => {
		const { state } = makeState({
			data: pageData({
				colours: [row('aldi', 'sky'), row('lidl', 'sky')]
			})
		});
		expect(state.colourStores).toEqual(['Aldi', 'Lidl']);
		expect(state.sharedStores).toEqual(['Aldi', 'Lidl']);
	});
});
