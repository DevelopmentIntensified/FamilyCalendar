/**
 * The page body as a whole: the `grocery-layout` grid the page catalog waits
 * on, the one list grouped by Store, the rail's three cards, and the empty
 * state per filter. The api is a prop (the browser default talks to
 * `/api/groceries`), so the test never fetches.
 *
 * Doc: ../README.md#invariants
 */
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/svelte';
import type { GroceryApi } from '../groceries.api';
import type { GroceriesPageData, GroceryListItem } from '../groceries.contract';
import GroceriesScreen from './GroceriesScreen.svelte';

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
			entry({ id: 'm1', name: 'Whole milk', quantity: 2, stores: ['Aldi'] }),
			entry({ id: 'm2', name: 'Eggs', stores: ['Lidl'], createdAt: '2026-03-02T09:00:00.000Z' })
		],
		family: [],
		hasFamily: false,
		userId: 'u1',
		familyId: null,
		colours: [],
		...overrides
	};
}

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
	setColour: async () => ({ ok: true, data: { ok: true } })
};

describe('GroceriesScreen', () => {
	it('lays out the one list beside the rail, with the grid the catalog waits on', () => {
		render(GroceriesScreen, { props: { data: pageData(), api } });

		expect(screen.getByRole('heading', { level: 1, name: 'Groceries' })).toBeInTheDocument();
		expect(screen.getByTestId('grocery-layout')).toHaveClass(
			'min-[950px]:grid-cols-[21rem_minmax(0,1fr)]'
		);
		expect(screen.getByRole('region', { name: 'Store colours' })).toBeInTheDocument();
		expect(screen.getByRole('group', { name: 'Filter groceries by scope' })).toBeInTheDocument();
	});

	it('groups the list by store and prints each group’s summary', () => {
		render(GroceriesScreen, { props: { data: pageData(), api } });

		expect(screen.getByRole('region', { name: 'Aldi' })).toBeInTheDocument();
		expect(screen.getByRole('region', { name: 'Lidl' })).toBeInTheDocument();
		expect(screen.getByText(/1 item · 2 total/)).toBeInTheDocument();
		expect(screen.getByText('Whole milk')).toBeInTheDocument();
	});

	it('shows the empty state of the filter that is empty, not of the page', async () => {
		render(GroceriesScreen, { props: { data: pageData(), api } });

		await fireEvent.click(screen.getByRole('button', { name: /^Family/ }));

		expect(
			screen.getByText('No family list yet — join or create a family to use the shared list.')
		).toBeInTheDocument();
	});

	it('applies ?scope= as the opening filter', () => {
		render(GroceriesScreen, { props: { data: pageData(), api, scopeParam: 'mine' } });

		expect(screen.getByRole('button', { name: /^Mine/ })).toHaveAttribute('aria-pressed', 'true');
	});
});
