/**
 * The rail as the person sees it: the scope filter chips with their counts
 * (and the add form following the filter), the "No family yet…" line, the
 * search box with its hint and clear button, the quick-add form with the
 * explicit "Add to" scope, the Store Memory suggestion chip, the
 * `known-stores` datalist and the inline error region.
 *
 * Doc: ../README.md#invariants
 */
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/svelte';
import { memoryToasts } from '$lib/kernel/client/toasts.svelte';
import { manualScheduler } from '$lib/kernel/testing/manualScheduler';
import type { GroceryApi } from '../groceries.api';
import type { GroceriesPageData, GroceryListItem } from '../groceries.contract';
import { GroceriesListState } from '../groceries.list.state.svelte';
import GrocerySideRail from './GrocerySideRail.svelte';

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
			entry({ id: 'm1', name: 'Milk', stores: ['Aldi'] }),
			entry({ id: 'm2', name: 'Eggs', stores: ['Lidl'], createdAt: '2026-03-02T09:00:00.000Z' })
		],
		family: [entry({ id: 'f1', name: 'Bread', familyId: 'fam1' })],
		hasFamily: true,
		userId: 'u1',
		familyId: 'fam1',
		colours: [],
		...overrides
	};
}

function makeState(calls: string[] = [], overrides: Partial<GroceriesPageData> = {}) {
	const api: GroceryApi = {
		list: async () => ({ ok: true, data: { items: [] } }),
		suggest: async (scope, name) => {
			calls.push(`suggest ${scope} ${name}`);
			return { ok: true, data: { store: 'Aldi' } };
		},
		add: async (body) => {
			calls.push(`add ${body.scope} ${body.input} ${(body.stores ?? []).join('|')}`);
			return {
				ok: true,
				data: {
					item: {
						id: 'new',
						userId: 'u1',
						familyId: body.scope === 'family' ? 'fam1' : null,
						name: body.input,
						nameKey: body.input.toLowerCase(),
						quantity: 1,
						stores: body.stores ?? [],
						checkedAt: null,
						createdAt: '2026-03-09T09:00:00.000Z'
					}
				}
			};
		},
		change: async () => ({ ok: true, data: { ok: true } }),
		remove: async () => ({ ok: true, data: { ok: true } }),
		colours: async () => ({ ok: true, data: { colours: [], palette: [] } }),
		setColour: async () => ({ ok: true, data: { ok: true } })
	};
	const toasts = memoryToasts();
	const schedule = manualScheduler().schedule;
	const state = new GroceriesListState(api, toasts, pageData(overrides), { schedule });
	return { state, toasts };
}

describe('GrocerySideRail', () => {
	it('carries the scope chips with their counts, All pressed on open', () => {
		const { state } = makeState();
		render(GrocerySideRail, { props: { state } });

		expect(screen.getByRole('button', { name: /^All/ })).toHaveAttribute('aria-pressed', 'true');
		expect(screen.getByRole('button', { name: /^All/ })).toHaveTextContent('3');
		expect(screen.getByRole('button', { name: /^Family/ })).toHaveTextContent('1');
		expect(screen.getByRole('button', { name: /^Mine/ })).toHaveTextContent('2');
	});

	it('narrows to one scope and follows into the add form', async () => {
		const { state } = makeState();
		render(GrocerySideRail, { props: { state } });

		await fireEvent.click(screen.getByRole('button', { name: /^Mine/ }));

		expect(state.filter).toBe('mine');
		expect(state.addScope).toBe('mine');
		expect(screen.getByRole('button', { name: /^Mine/ })).toHaveAttribute('aria-pressed', 'true');
	});

	it('says the FAMILY list is missing rather than the page, and only off Mine', async () => {
		const { state } = makeState([], { hasFamily: false, familyId: null, family: [] });
		render(GrocerySideRail, { props: { state } });

		expect(
			screen.getByText('No family yet — join or create one to use the shared list.')
		).toBeInTheDocument();
		await fireEvent.click(screen.getByRole('button', { name: /^Mine/ }));
		expect(
			screen.queryByText('No family yet — join or create one to use the shared list.')
		).toBeNull();
	});

	it('searches locally, names what it is searching for, and clears', async () => {
		const { state } = makeState();
		render(GrocerySideRail, { props: { state } });

		const search = screen.getByRole('textbox', { name: 'Search groceries' });
		await fireEvent.input(search, { target: { value: 'milk' } });

		expect(state.searchQuery).toBe('milk');
		expect(screen.getByText('Searching “milk”')).toBeInTheDocument();

		await fireEvent.click(screen.getByRole('button', { name: 'Clear search' }));
		expect(state.searchQuery).toBe('');
		expect(screen.queryByText(/Searching/)).toBeNull();
	});

	it('disables Add until there is something to add, then adds to the stated scope', async () => {
		const calls: string[] = [];
		const { state, toasts } = makeState(calls);
		render(GrocerySideRail, { props: { state } });

		const addButton = screen.getByRole('button', { name: 'Add' });
		expect(addButton).toBeDisabled();

		const quickAdd = screen.getByRole('textbox', { name: 'Add grocery item' });
		await fireEvent.input(quickAdd, { target: { value: 'milk 2' } });
		await fireEvent.input(screen.getByRole('combobox', { name: 'Stores for this item' }), {
			target: { value: 'Aldi' }
		});
		expect(addButton).toBeEnabled();

		await fireEvent.submit(screen.getByRole('form', { name: 'Add a grocery item' }));
		await Promise.resolve();
		await Promise.resolve();

		expect(calls).toEqual(['add family milk 2 Aldi']);
		expect(state.input).toBe('');
		expect(toasts.items[0]?.text).toBe('Added "milk 2" to Family — Aldi.');
	});

	it('offers the Store Memory chip and copies it into the store field', async () => {
		const { state } = makeState();
		state.suggested = 'Aldi';
		render(GrocerySideRail, { props: { state } });

		await fireEvent.click(screen.getByRole('button', { name: 'Use store Aldi' }));

		expect(state.storeInput).toBe('Aldi');
		expect(screen.getByRole('combobox', { name: 'Stores for this item' })).toHaveValue('Aldi');
	});

	it('offers the shops already on the lists as datalist options', () => {
		const { state } = makeState();
		render(GrocerySideRail, { props: { state } });

		const options = [...document.querySelectorAll<HTMLOptionElement>('#known-stores option')].map(
			(option) => option.value
		);
		expect(options).toEqual(['Aldi', 'Lidl']);
	});

	it('writes the error region when a write is refused', () => {
		const { state } = makeState();
		state.error = "Couldn't remove that — check your connection and try again.";
		render(GrocerySideRail, { props: { state } });

		expect(screen.getByRole('alert')).toHaveTextContent(
			"Couldn't remove that — check your connection and try again."
		);
	});
});
