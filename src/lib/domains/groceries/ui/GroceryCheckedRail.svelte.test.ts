/**
 * The checked-off rail: absent until something is checked this session, every
 * entry struck through with the badge of the list it came from, and unchecking
 * on THAT scope rather than on the filter.
 *
 * Doc: ../README.md#invariants
 */
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/svelte';
import { memoryToasts } from '$lib/kernel/client/toasts.svelte';
import type { GroceryApi } from '../groceries.api';
import type { GroceriesPageData, GroceryListItem } from '../groceries.contract';
import { GroceriesListState } from '../groceries.list.state.svelte';
import GroceryCheckedRail from './GroceryCheckedRail.svelte';

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
		mine: [entry({ id: 'm1', name: 'Milk' })],
		family: [entry({ id: 'f1', name: 'Bread', familyId: 'fam1' })],
		hasFamily: true,
		userId: 'u1',
		familyId: 'fam1',
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
			calls.push(`change ${id} ${String(body.op)} ${body.scope}`);
			return { ok: true, data: { ok: true } };
		},
		remove: async () => ({ ok: true, data: { ok: true } }),
		colours: async () => ({ ok: true, data: { colours: [], palette: [] } }),
		setColour: async () => ({ ok: true, data: { ok: true } }),
		...overrides
	};
	const state = new GroceriesListState(api, memoryToasts(), pageData());
	return state;
}

describe('GroceryCheckedRail', () => {
	it('does not exist before anything is checked off', () => {
		const state = makeState();
		render(GroceryCheckedRail, { props: { state } });

		expect(screen.queryByRole('region', { name: 'Checked off' })).toBeNull();
	});

	it('holds what was checked this session, struck through with its scope badge', () => {
		const state = makeState();
		const bread = state.family[0];
		if (!bread) throw new Error('expected a Family row');
		state.checked = [{ item: bread, scope: 'family' }];
		render(GroceryCheckedRail, { props: { state } });

		expect(screen.getByRole('region', { name: 'Checked off' })).toHaveTextContent(
			'Checked off (1)'
		);
		expect(screen.getByText('Bread')).toHaveClass('line-through');
		expect(screen.getByText('Family')).toBeInTheDocument();
		expect(screen.getByRole('checkbox', { name: 'Uncheck Bread' })).toHaveAttribute(
			'aria-checked',
			'true'
		);
	});

	it('unchecks on the scope the row came from, not on the filter', async () => {
		const calls: string[] = [];
		const state = makeState(calls);
		state.setFilter('mine');
		const bread = state.family[0];
		if (!bread) throw new Error('expected a Family row');
		state.checked = [{ item: bread, scope: 'family' }];
		state.family = [];
		render(GroceryCheckedRail, { props: { state } });

		await fireEvent.click(screen.getByRole('checkbox', { name: 'Uncheck Bread' }));

		expect(calls).toEqual(['change f1 uncheck family']);
		expect(state.checked).toEqual([]);
		expect(state.family.map((item) => item.id)).toEqual(['f1']);
	});

	it('keeps a row in the rail when the uncheck is refused', async () => {
		const state = makeState([], {
			change: async () => ({ ok: false, status: 500, error: 'Failed to update item' })
		});
		const milk = state.mine[0];
		if (!milk) throw new Error('expected a Mine row');
		state.checked = [{ item: milk, scope: 'mine' }];
		render(GroceryCheckedRail, { props: { state } });

		await fireEvent.click(screen.getByRole('checkbox', { name: 'Uncheck Milk' }));
		await Promise.resolve();
		await Promise.resolve();

		expect(state.checked).toHaveLength(1);
		expect(state.error).toBe("Couldn't put that back. Try again.");
	});
});
