import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
import { render, screen, fireEvent, cleanup, within } from '@testing-library/svelte';
import GroceriesPage from './+page.svelte';
import type { PageData } from './$types';

// oxlint-disable-next-line anti-slop/no-module-mocking -- SvelteKit $app/* is framework-injected; no DI seam exists.
vi.mock('$app/navigation', () => ({
	invalidateAll: vi.fn()
}));

const g = (
	id: string,
	name: string,
	stores: string[],
	quantity = 1,
	familyId: string | null = 'fam1'
) => ({
	id,
	name,
	quantity,
	stores,
	familyId,
	userId: 'u1',
	nameKey: name.toLowerCase(),
	checkedAt: null,
	createdAt: '2026-01-01T00:00:00.000Z',
	updatedAt: '2026-01-01T00:00:00.000Z'
});

function makeData(overrides: Partial<PageData> = {}) {
	const base = {
		mine: [
			g('m1', 'Oat milk', ['Trader Joe’s'], 2, null),
			g('m2', 'Lemons', ['Aldi', 'Kroger'], 3, null)
		],
		family: [
			g('f1', 'Sourdough', ['Whole Foods']),
			g('f2', 'Eggs', ['Aldi'], 2),
			g('f3', 'Coffee beans', ['Aldi', 'Costco'], 2),
			g('f4', 'Dish soap', [], 4)
		],
		hasFamily: true
	};
	return { data: { ...base, ...overrides } as unknown as PageData };
}

beforeEach(() => {
	vi.stubGlobal(
		'fetch',
		vi.fn(async () => new Response(JSON.stringify({ ok: true }), { status: 200 }))
	);
});

afterEach(() => {
	cleanup();
	vi.unstubAllGlobals();
});

describe('groceries page — scope tabs', () => {
	it('opens on Family, with Family before Mine, each carrying its open count', () => {
		render(GroceriesPage, makeData());
		const tabs = screen.getAllByRole('tab');
		expect(tabs.map((t) => t.textContent?.trim())).toEqual(['Family4', 'Mine2']);
		expect(tabs[0]).toHaveAttribute('aria-selected', 'true');
		expect(tabs[1]).toHaveAttribute('aria-selected', 'false');
	});

	it('switches to the Mine scope and shows that scope’s items', async () => {
		render(GroceriesPage, makeData());
		await fireEvent.click(screen.getByRole('tab', { name: /Mine/ }));
		expect(screen.getByRole('tab', { name: /Mine/ })).toHaveAttribute('aria-selected', 'true');
		expect(screen.getByText('Oat milk')).toBeInTheDocument();
		expect(screen.queryByText('Sourdough')).not.toBeInTheDocument();
	});

	it('explains an empty Family list when there is no family yet', () => {
		render(GroceriesPage, makeData({ family: [], hasFamily: false }));
		expect(screen.getByText(/Join or create a family/)).toBeInTheDocument();
	});
});

describe('groceries page — Store groups', () => {
	const list = () => screen.getByRole('region', { name: 'Items by store' });

	it('groups items by Store, sorted alphabetically', () => {
		render(GroceriesPage, makeData());
		expect(
			within(list())
				.getAllByRole('heading', { level: 2 })
				.map((h) => h.textContent?.trim())
		).toEqual(['Aldi', 'Any store', 'Whole Foods']);
	});

	it('summarises each group with its item count and total quantity', () => {
		render(GroceriesPage, makeData());
		expect(screen.getByText('2 items · 4 total')).toBeInTheDocument();
		expect(screen.getByText('1 item · 4 total')).toBeInTheDocument();
		expect(screen.getByText('1 item · 1 total')).toBeInTheDocument();
	});

	it('shows a Store chip per row, with alternates as the "or X" line', () => {
		render(GroceriesPage, makeData());
		const aldi = screen.getByRole('region', { name: 'Aldi' });
		expect(within(aldi).getByText('or Costco')).toBeInTheDocument();
		expect(within(aldi).getAllByText('Aldi').length).toBeGreaterThan(0);
	});
});

describe('groceries page — check-off and uncheck', () => {
	const list = () => screen.getByRole('region', { name: 'Items by store' });

	it('checks an item off optimistically, striking it through in the Checked rail', async () => {
		render(GroceriesPage, makeData());
		await fireEvent.click(screen.getByRole('checkbox', { name: 'Check off Eggs' }));

		expect(within(list()).queryByText('Eggs')).not.toBeInTheDocument();
		const rail = screen.getByRole('region', { name: 'Checked off' });
		expect(within(rail).getByText('Eggs')).toHaveClass('line-through');
		expect(within(rail).getByRole('checkbox', { name: 'Uncheck Eggs' })).toBeInTheDocument();

		const [url, init] = vi.mocked(fetch).mock.calls[0];
		expect(url).toBe('/api/groceries/f2');
		expect(init?.method).toBe('PATCH');
		expect(JSON.parse(String(init?.body))).toEqual({ scope: 'family', op: 'check' });
	});

	it('unchecks an item, returning it to its Store group', async () => {
		render(GroceriesPage, makeData());
		await fireEvent.click(screen.getByRole('checkbox', { name: 'Check off Eggs' }));
		await fireEvent.click(screen.getByRole('checkbox', { name: 'Uncheck Eggs' }));

		const [, init] = vi.mocked(fetch).mock.calls[1];
		expect(JSON.parse(String(init?.body))).toEqual({ scope: 'family', op: 'uncheck' });
		expect(within(list()).getByText('Eggs')).toBeInTheDocument();
		expect(screen.queryByRole('region', { name: 'Checked off' })).not.toBeInTheDocument();
	});

	it('shows no Checked rail before anything is checked off', () => {
		render(GroceriesPage, makeData());
		expect(screen.queryByRole('region', { name: 'Checked off' })).not.toBeInTheDocument();
	});

	it('reverts the check-off and names the failure in the error region', async () => {
		vi.stubGlobal(
			'fetch',
			vi.fn(async () => new Response('{}', { status: 500 }))
		);
		render(GroceriesPage, makeData());
		await fireEvent.click(screen.getByRole('checkbox', { name: 'Check off Eggs' }));

		await vi.waitFor(() =>
			expect(screen.getByRole('alert')).toHaveTextContent(/Couldn't check that off/)
		);
		expect(within(list()).getByText('Eggs')).toBeInTheDocument();
		expect(screen.queryByRole('region', { name: 'Checked off' })).not.toBeInTheDocument();
	});
});

describe('groceries page — row actions survive the restyle', () => {
	it('edits an item’s stores', async () => {
		render(GroceriesPage, makeData());
		await fireEvent.click(screen.getByRole('button', { name: 'Edit stores for Coffee beans' }));
		const field = screen.getByLabelText('Stores for Coffee beans');
		expect(field).toHaveValue('Aldi, Costco');
		await fireEvent.click(screen.getByRole('button', { name: 'Save stores for Coffee beans' }));
		const [, init] = vi.mocked(fetch).mock.calls[0];
		expect(JSON.parse(String(init?.body))).toEqual({
			scope: 'family',
			op: 'stores',
			stores: ['Aldi', 'Costco']
		});
	});

	it('moves an item to the other scope and deletes one', async () => {
		render(GroceriesPage, makeData());
		await fireEvent.click(screen.getByRole('button', { name: 'Edit stores for Sourdough' }));
		await fireEvent.click(screen.getByRole('button', { name: 'Move Sourdough to Mine' }));
		expect(JSON.parse(String(vi.mocked(fetch).mock.calls[0][1]?.body))).toEqual({
			scope: 'family',
			op: 'move',
			target: 'mine'
		});

		await fireEvent.click(screen.getByRole('button', { name: 'Delete Dish soap' }));
		const [url, init] = vi.mocked(fetch).mock.calls[1];
		expect(url).toBe('/api/groceries/f4?scope=family');
		expect(init?.method).toBe('DELETE');
	});
});

describe('groceries page — Store Memory suggestions', () => {
	it('offers the remembered Store as a chip under the add field, not as placeholder text', async () => {
		vi.stubGlobal(
			'fetch',
			vi.fn(async () => new Response(JSON.stringify({ store: 'Aldi' }), { status: 200 }))
		);
		render(GroceriesPage, makeData());
		await fireEvent.input(screen.getByLabelText('Add grocery item'), {
			target: { value: 'eggs' }
		});
		await vi.waitFor(() =>
			expect(screen.getByRole('button', { name: 'Use store Aldi' })).toBeInTheDocument()
		);
		expect(screen.getByLabelText('Stores for this item')).toHaveAttribute(
			'placeholder',
			'Store (optional, comma = alternates)'
		);
	});
});
