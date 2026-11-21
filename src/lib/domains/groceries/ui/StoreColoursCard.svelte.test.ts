/**
 * The Store colours card: every shop the page knows with its dot, a palette +
 * Auto select per shop, ONE Everyone / Just me select for the card, the
 * collision line, and the empty state explaining a shop appears once typed.
 * The card keeps its own scope (115) and steps aside ("editing →") while a
 * group's picker owns a shop.
 *
 * Doc: ../README.md#invariants
 */
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/svelte';
import { memoryToasts } from '$lib/kernel/client/toasts.svelte';
import type { GroceryApi } from '../groceries.api';
import type { GroceriesPageData, GroceryListItem, StoreColourRow } from '../groceries.contract';
import { GroceriesListState } from '../groceries.list.state.svelte';
import StoreColoursCard from './StoreColoursCard.svelte';

afterEach(cleanup);

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

function pageData(overrides: Partial<GroceriesPageData> = {}): GroceriesPageData {
	return {
		mine: [entry({ id: 'm1', stores: ['Aldi'] }), entry({ id: 'm2', stores: ['Lidl'] })],
		family: [],
		hasFamily: true,
		userId: 'u1',
		familyId: 'fam1',
		colours: [],
		...overrides
	};
}

function row(storeKey: string, color: string, familyId: string | null = null): StoreColourRow {
	return { storeKey, color, userId: 'u1', familyId };
}

function makeState(calls: string[] = [], overrides: Partial<GroceriesPageData> = {}) {
	const api: GroceryApi = {
		list: async () => ({ ok: true, data: { items: [] } }),
		suggest: async () => ({ ok: true, data: { store: null } }),
		add: async () => ({
			ok: true,
			data: {
				item: {
					id: 'new',
					userId: 'u1',
					familyId: null,
					name: 'x',
					nameKey: 'x',
					quantity: 1,
					stores: [],
					checkedAt: null,
					createdAt: '2026-03-09T09:00:00.000Z'
				}
			}
		}),
		change: async () => ({ ok: true, data: { ok: true } }),
		remove: async () => ({ ok: true, data: { ok: true } }),
		colours: async () => ({ ok: true, data: { colours: [], palette: [] } }),
		setColour: async (body) => {
			calls.push(`setColour ${body.store} ${body.color} ${String(body.scope)}`);
			return { ok: true, data: { ok: true } };
		}
	};
	return new GroceriesListState(api, memoryToasts(), pageData(overrides));
}

describe('StoreColoursCard', () => {
	it('says a shop appears once typed, rather than showing an empty card', () => {
		const state = makeState([], { mine: [entry({ id: 'm1', stores: [] })] });
		render(StoreColoursCard, { props: { state } });

		expect(
			screen.getByText(
				'No shops yet. Type one on an item and it turns up here with a colour of its own.'
			)
		).toBeInTheDocument();
	});

	it('lists every shop with the dot of its resolved colour, from BOTH scopes', () => {
		const state = makeState([], {
			family: [entry({ id: 'f1', stores: ['Costco'], familyId: 'fam1' })],
			colours: [row('aldi', 'sky')]
		});
		render(StoreColoursCard, { props: { state } });

		expect(screen.getByText('Aldi')).toBeInTheDocument();
		expect(screen.getByText('Lidl')).toBeInTheDocument();
		expect(screen.getByText('Costco')).toBeInTheDocument();
		expect(screen.getByText('Aldi').parentElement?.querySelector('.bg-sky-500')).not.toBeNull();
	});

	it('counts the shops against the palette and says when no two collide', () => {
		const state = makeState([], {
			mine: [entry({ id: 'm1', stores: ['Aldi'] })],
			colours: [row('aldi', 'sky')]
		});
		render(StoreColoursCard, { props: { state } });

		expect(screen.getByText(/1 store, 6 swatches/)).toBeInTheDocument();
		expect(screen.getByText(/No two stores land on the same swatch/)).toBeInTheDocument();
	});

	it('discloses a shared swatch on the card and on the row', () => {
		const state = makeState([], { colours: [row('aldi', 'sky'), row('lidl', 'sky')] });
		render(StoreColoursCard, { props: { state } });

		expect(screen.getByText('shares Blue with Lidl')).toBeInTheDocument();
		expect(screen.getByText(/2 of them land on the same swatch/)).toBeInTheDocument();
		expect(screen.getByText(/Aldi, Lidl/)).toBeInTheDocument();
	});

	it('gives each shop its own picker, starting on Auto and writing through the card’s scope', async () => {
		const calls: string[] = [];
		const state = makeState(calls);
		render(StoreColoursCard, { props: { state } });

		const aldi = screen.getByRole('combobox', { name: 'Colour for Aldi' });
		expect(aldi).toHaveValue('auto');

		await fireEvent.change(aldi, { target: { value: 'amber' } });
		await Promise.resolve();
		await Promise.resolve();

		expect(calls).toEqual(['setColour Aldi amber family']);
		expect(state.pickerValue('Aldi', 'family')).toBe('amber');
	});

	it('writes a personal colour once the card’s Everyone / Just me select moves', async () => {
		const calls: string[] = [];
		const state = makeState(calls);
		render(StoreColoursCard, { props: { state } });

		await fireEvent.change(screen.getByRole('combobox', { name: 'Colour scope for the card' }), {
			target: { value: 'personal' }
		});
		await fireEvent.change(screen.getByRole('combobox', { name: 'Colour for Aldi' }), {
			target: { value: 'lilac' }
		});
		await Promise.resolve();
		await Promise.resolve();

		expect(calls).toEqual(['setColour Aldi lilac personal']);
	});

	it('hides the card’s scope choice when there is no family', () => {
		const state = makeState([], { hasFamily: false, familyId: null });
		render(StoreColoursCard, { props: { state } });

		expect(screen.queryByRole('combobox', { name: 'Colour scope for the card' })).toBeNull();
	});

	it('steps aside while a group’s picker owns a shop', () => {
		const state = makeState();
		state.openColour('Aldi');
		render(StoreColoursCard, { props: { state } });

		expect(screen.getByText('editing →')).toBeInTheDocument();
		expect(screen.queryByRole('combobox', { name: 'Colour for Aldi' })).toBeNull();
	});
});
