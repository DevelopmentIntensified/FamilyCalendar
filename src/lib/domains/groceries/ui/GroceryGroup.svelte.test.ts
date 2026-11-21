/**
 * One Store group as the person sees it: the colour bar and dot, the
 * "2 items · 3 total" summary, the collision line naming the twin, and the
 * inline Colour picker (every declared swatch + Auto, Everyone / Just me with
 * a family, Done). The "Any store" group is the absence of a shop, so it gets
 * neither a tint nor a picker.
 *
 * Doc: ../README.md#invariants
 */
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/svelte';
import { memoryToasts } from '$lib/kernel/client/toasts.svelte';
import type { GroceryApi } from '../groceries.api';
import type { GroceriesPageData, GroceryListItem, StoreColourRow } from '../groceries.contract';
import { GroceriesListState } from '../groceries.list.state.svelte';
import GroceryGroup from './GroceryGroup.svelte';

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
		mine: [
			entry({ id: 'm1', name: 'Milk', quantity: 2 }),
			entry({ id: 'm2', name: 'Eggs', createdAt: '2026-03-02T09:00:00.000Z' })
		],
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

function renderGroup(state: GroceriesListState, store = 'Aldi') {
	const group = state.groups.find((candidate) => candidate.store === store);
	if (!group) throw new Error(`expected the ${store} group`);
	const twins = group.colour ? state.twinsOf(store) : [];
	render(GroceryGroup, { props: { state, group, twins } });
	return group;
}

describe('GroceryGroup', () => {
	it('wears the store’s own colour on the bar and the dot, and summarises the group', () => {
		const state = makeState();
		renderGroup(state);

		const heading = screen.getByRole('heading', { name: 'Aldi' });
		// "aldi" hashes to sage, so the bar and dot are the mint swatch.
		const bar = heading.closest('div');
		expect(bar).toHaveClass('bg-emerald-50');
		expect(screen.getByText(/2 items · 3 total/)).toBeInTheDocument();
	});

	it('discloses a shared swatch on the group header instead of hiding it', () => {
		const state = makeState([], {
			mine: [entry({ id: 'm1', stores: ['Aldi'] }), entry({ id: 'm2', stores: ['Costco'] })],
			colours: [row('aldi', 'sky'), row('costco', 'sky')]
		});
		const group = state.groups.find((candidate) => candidate.store === 'Aldi');
		if (!group) throw new Error('expected the Aldi group');
		render(GroceryGroup, { props: { state, group, twins: state.twinsOf('Aldi') } });

		expect(screen.getByText(/shares Blue with Costco/)).toBeInTheDocument();
	});

	it('opens the inline picker with every declared swatch plus Auto', async () => {
		const state = makeState();
		renderGroup(state);

		expect(screen.queryByRole('combobox', { name: 'Colour for Aldi' })).toBeNull();
		await fireEvent.click(screen.getByRole('button', { name: 'Edit colour for Aldi' }));

		const picker = screen.getByRole('combobox', { name: 'Colour for Aldi' });
		const options = [...picker.querySelectorAll('option')].map((option) => option.textContent);
		expect(options).toEqual(['Terracotta', 'Blue', 'Mint', 'Lavender', 'Amber', 'Slate', 'Auto']);
		expect(screen.getByRole('radio', { name: 'Everyone' })).toBeChecked();
		expect(screen.getByRole('radio', { name: 'Just me' })).not.toBeChecked();
	});

	it('flips the colour from the picker and closes once the server agrees', async () => {
		const calls: string[] = [];
		const state = makeState(calls);
		renderGroup(state);

		await fireEvent.click(screen.getByRole('button', { name: 'Edit colour for Aldi' }));
		await fireEvent.change(screen.getByRole('combobox', { name: 'Colour for Aldi' }), {
			target: { value: 'amber' }
		});
		await Promise.resolve();
		await Promise.resolve();

		expect(calls).toEqual(['setColour Aldi amber family']);
		expect(state.colourOf('Aldi')?.label).toBe('Amber');
		expect(screen.queryByRole('combobox', { name: 'Colour for Aldi' })).toBeNull();
	});

	it('closes on Done without writing anything', async () => {
		const calls: string[] = [];
		const state = makeState(calls);
		renderGroup(state);

		await fireEvent.click(screen.getByRole('button', { name: 'Edit colour for Aldi' }));
		await fireEvent.click(screen.getByRole('button', { name: 'Done editing colour for Aldi' }));

		expect(calls).toEqual([]);
		expect(screen.queryByRole('combobox', { name: 'Colour for Aldi' })).toBeNull();
		expect(screen.getByRole('button', { name: 'Edit colour for Aldi' })).toBeInTheDocument();
	});

	it('writes a personal colour after the Everyone / Just me control moves', async () => {
		const calls: string[] = [];
		const state = makeState(calls);
		renderGroup(state);

		await fireEvent.click(screen.getByRole('button', { name: 'Edit colour for Aldi' }));
		await fireEvent.click(screen.getByRole('radio', { name: 'Just me' }));
		await fireEvent.change(screen.getByRole('combobox', { name: 'Colour for Aldi' }), {
			target: { value: 'lilac' }
		});
		await Promise.resolve();
		await Promise.resolve();

		expect(calls).toEqual(['setColour Aldi lilac personal']);
	});

	it('hides the Everyone / Just me choice when there is no family', async () => {
		const state = makeState([], { hasFamily: false, familyId: null });
		renderGroup(state);

		await fireEvent.click(screen.getByRole('button', { name: 'Edit colour for Aldi' }));
		expect(screen.queryByRole('radio', { name: 'Everyone' })).toBeNull();
	});

	it('never tints or colours the "Any store" group — an absent store is not a shop', () => {
		const state = makeState([], {
			mine: [entry({ id: 'm1', name: 'Something', stores: [] })]
		});
		renderGroup(state, 'Any store');

		expect(screen.queryByRole('button', { name: /Edit colour/ })).toBeNull();
		expect(screen.getByRole('heading', { name: 'Any store' }).closest('div')).toHaveClass(
			'bg-slate-50'
		);
	});
});
