/**
 * One grocery row as the person sees it: the check-off box, `name ×quantity`,
 * the scope badge in WORDS, every store as its own coloured chip with "or"
 * before the alternates, the primary marked by a filled dot and a heavier ring
 * (so colour is free to mean "which shop"), and the edit / move / delete
 * controls with the inline store editor.
 *
 * Replaces the legacy `groceries/page.svelte.test.ts` row cases; the page's
 * data is a real state class with a fake api and no DOM fetch.
 *
 * Doc: ../README.md#invariants
 */
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/svelte';
import { memoryToasts } from '$lib/kernel/client/toasts.svelte';
import type { GroceryApi } from '../groceries.api';
import type { GroceriesPageData, GroceryListItem } from '../groceries.contract';
import { GroceriesListState } from '../groceries.list.state.svelte';
import GroceryRow from './GroceryRow.svelte';

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
		mine: [entry({ id: 'm1', name: 'Milk', quantity: 2, stores: ['Aldi', 'Costco'] })],
		family: [],
		hasFamily: false,
		userId: 'u1',
		familyId: null,
		colours: [],
		...overrides
	};
}

function makeState(calls: string[] = [], overrides: Partial<GroceryApi> = {}) {
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
		change: async (id, body) => {
			calls.push(`change ${id} ${String(body.op)}`);
			return { ok: true, data: { ok: true } };
		},
		remove: async (id) => {
			calls.push(`remove ${id}`);
			return { ok: true, data: { ok: true } };
		},
		colours: async () => ({ ok: true, data: { colours: [], palette: [] } }),
		setColour: async () => ({ ok: true, data: { ok: true } }),
		...overrides
	};
	return new GroceriesListState(api, memoryToasts(), pageData());
}

function renderRow(item: GroceryListItem, calls: string[] = []) {
	const state = makeState(calls);
	render(GroceryRow, { props: { state, item } });
	return state;
}

describe('GroceryRow', () => {
	it('prints the name, the quantity and the scope as a word', () => {
		renderRow(entry({ id: 'm1', name: 'Milk', quantity: 2 }));
		expect(screen.getByText('Milk')).toBeInTheDocument();
		expect(screen.getByText('×2')).toBeInTheDocument();
		expect(screen.getByText('Mine')).toBeInTheDocument();
		expect(screen.getByRole('checkbox', { name: 'Check off Milk' })).toHaveAttribute(
			'aria-checked',
			'false'
		);
	});

	it('gives EVERY store its own coloured chip, with "or" before the alternates', () => {
		renderRow(entry({ id: 'm1', stores: ['Aldi', 'Costco'] }));

		const aldi = screen.getByTitle(/^Aldi — /);
		const costco = screen.getByTitle(/^Costco — /);
		expect(aldi).toHaveClass('bg-emerald-100', 'text-emerald-900');
		expect(costco).toHaveClass('bg-sky-100', 'text-sky-900');
		expect(screen.getByText('or')).toBeInTheDocument();
	});

	it('keeps the primary store on a SECOND channel: a filled dot and a heavier ring', () => {
		renderRow(entry({ id: 'm1', stores: ['Aldi', 'Costco'] }));

		expect(screen.getByTitle(/^Aldi — /)).toHaveClass('ring-2');
		expect(screen.getByTitle(/^Costco — /)).toHaveClass('ring-1');
	});

	it('prints no "or" on a row with only one shop', () => {
		renderRow(entry({ id: 'm1', stores: ['Aldi'] }));
		expect(screen.queryByText('or')).toBeNull();
	});

	it('prints no chips at all for a row with no store', () => {
		renderRow(entry({ id: 'm1', stores: [] }));
		expect(document.querySelector('.ring-current')).toBeNull();
	});

	it('checks the row off from its box', async () => {
		const calls: string[] = [];
		const state = renderRow(entry({ id: 'm1' }), calls);

		await fireEvent.click(screen.getByRole('checkbox', { name: 'Check off Milk' }));

		expect(calls).toEqual(['change m1 check']);
		expect(state.mine).toEqual([]);
	});

	it('opens the inline store editor seeded with the row’s own list, and saves it cleaned', async () => {
		const calls: string[] = [];
		renderRow(entry({ id: 'm1', stores: ['Aldi', 'Costco'] }), calls);

		await fireEvent.click(screen.getByRole('button', { name: 'Edit stores for Milk' }));
		const input = screen.getByRole('textbox', { name: 'Stores for Milk' });
		expect(input).toHaveValue('Aldi, Costco');

		await fireEvent.input(input, { target: { value: 'Tescos, tescos' } });
		await fireEvent.click(screen.getByRole('button', { name: 'Save stores for Milk' }));

		expect(calls).toEqual(['change m1 stores']);
	});

	it('cancels the store editor without writing', async () => {
		const calls: string[] = [];
		renderRow(entry({ id: 'm1' }), calls);

		await fireEvent.click(screen.getByRole('button', { name: 'Edit stores for Milk' }));
		await fireEvent.click(screen.getByRole('button', { name: 'Cancel editing Milk' }));

		expect(screen.queryByRole('textbox', { name: 'Stores for Milk' })).toBeNull();
		expect(calls).toEqual([]);
	});

	it('names the destination scope on the move control and moves there', async () => {
		const calls: string[] = [];
		renderRow(entry({ id: 'm1', familyId: 'fam1' }), calls);

		expect(screen.getByText('Family')).toBeInTheDocument();
		await fireEvent.click(screen.getByRole('button', { name: 'Move Milk to Mine' }));

		expect(calls).toEqual(['change m1 move']);
	});

	it('deletes the row from its own control', async () => {
		const calls: string[] = [];
		renderRow(entry({ id: 'm1' }), calls);

		await fireEvent.click(screen.getByRole('button', { name: 'Delete Milk' }));

		expect(calls).toEqual(['remove m1']);
	});
});
