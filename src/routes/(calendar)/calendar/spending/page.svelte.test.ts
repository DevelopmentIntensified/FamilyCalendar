import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, cleanup, fireEvent } from '@testing-library/svelte';
import { tick } from 'svelte';
import SpendingPage from './+page.svelte';
import type { Bill } from '$lib/server/db/schema';
import type { PageData } from './$types';

// oxlint-disable-next-line anti-slop/no-module-mocking -- SvelteKit $app/navigation is framework-injected; no DI seam exists.
vi.mock('$app/navigation', () => ({ goto: vi.fn(async () => {}) }));

/** A Bill fixture; the page reads id/title/amountCents/dueDate/category. */
function billFixture(over: Partial<Bill> = {}): Bill {
	return {
		id: 'bill-1',
		title: 'Electric',
		amountCents: 12000,
		dueDate: null,
		category: 'utilities',
		paidAt: null,
		source: 'manual',
		userId: 'u1',
		familyId: null,
		createdAt: new Date('2026-09-01T00:00:00Z'),
		...over
	};
}

/** Slice shapes the page reads from the load return. */
interface Slice {
	category: string;
	cents: number;
	billIds: string[];
}

interface Bucket {
	month: string;
	spend: Slice[];
}

interface TopItem {
	label: string;
	category: string;
	count: number;
	cents: number;
}

interface SpendingPageData {
	range: string;
	customFrom: string | null;
	customTo: string | null;
	months: string[];
	buckets: Bucket[];
	rangeSpend: Slice[];
	undatedSpend: Slice[];
	topItems: TopItem[];
	bills: Bill[];
	totalBills: number;
	loadWarnings: string[];
}

function pageData(over: Partial<SpendingPageData> = {}): PageData {
	const data: SpendingPageData = {
		range: 'last-6',
		customFrom: null,
		customTo: null,
		months: ['2026-08', '2026-09'],
		buckets: [
			{ month: '2026-08', spend: [{ category: 'utilities', cents: 4000, billIds: ['b-aug'] }] },
			{ month: '2026-09', spend: [{ category: 'utilities', cents: 9000, billIds: ['b-sep'] }] }
		],
		rangeSpend: [{ category: 'utilities', cents: 13000, billIds: ['b-aug', 'b-sep'] }],
		undatedSpend: [],
		topItems: [{ label: 'Electricity', category: 'utilities', count: 2, cents: 13000 }],
		bills: [
			billFixture({ id: 'b-aug', title: 'Electric', dueDate: '2026-08-15T00:00:00.000Z' }),
			billFixture({ id: 'b-sep', title: 'Water', dueDate: '2026-09-10T00:00:00.000Z' })
		],
		totalBills: 2,
		loadWarnings: [],
		...over
	};
	// SAFETY: the fixture supplies exactly what the spending page reads; the
	// layout-level fields on PageData (user, userSettings, …) are out of scope.
	return data as PageData;
}

beforeEach(async () => {
	cleanup();
	vi.mocked((await import('$app/navigation')).goto).mockClear();
});

describe('Spending page (#032)', () => {
	it('renders the header, range picker, and month columns', () => {
		render(SpendingPage, { props: { data: pageData() } });

		expect(screen.getByRole('heading', { name: 'Spending' })).toBeTruthy();
		expect(screen.getByLabelText('Report range')).toBeTruthy();
		expect(screen.getByText('Sep 26')).toBeTruthy();
		expect(screen.getByText('Aug 26')).toBeTruthy();
		// Range totals row (also on the summary bar — same grand total)
		expect(screen.getAllByText('$130.00').length).toBeGreaterThan(0);
	});

	it('shows the empty state when the user has no bills at all', () => {
		render(SpendingPage, {
			props: { data: pageData({ totalBills: 0, buckets: [], rangeSpend: [], bills: [] }) }
		});

		expect(screen.getByText('No spending yet')).toBeTruthy();
		expect(screen.queryByText('Monthly trend by category')).toBeNull();
	});

	it('shows a no-spending note when the range has no bills', () => {
		render(SpendingPage, {
			props: { data: pageData({ buckets: [], rangeSpend: [], totalBills: 2 }) }
		});

		expect(screen.getByText('No bills in this range yet.')).toBeTruthy();
	});

	it('expands a category into its bills on tap and closes again', async () => {
		render(SpendingPage, { props: { data: pageData() } });

		fireEvent.click(screen.getByRole('button', { name: /Utilities/ }));
		await vi.waitFor(() => {
			expect(screen.getByText('Utilities — $130.00')).toBeTruthy();
		});
		expect(screen.getByText('Electric')).toBeTruthy();

		fireEvent.click(screen.getByRole('button', { name: 'Close' }));
		await tick();
		expect(screen.queryByText('Utilities — $130.00')).toBeNull();
	});

	it('shows percent and bill count on the summary bars', () => {
		render(SpendingPage, { props: { data: pageData() } });

		expect(screen.getByText('100% · 2 bills')).toBeTruthy();
	});

	it('navigates with ?range= when the preset changes', async () => {
		const { goto } = await import('$app/navigation');
		render(SpendingPage, { props: { data: pageData() } });

		// SAFETY: getByLabelText found exactly the range <select>; the cast
		// exposes .value for the programmatic change event.
		const select = screen.getByLabelText('Report range') as HTMLSelectElement;
		select.value = 'this-year';
		fireEvent.change(select);

		await vi.waitFor(() => {
			expect(goto).toHaveBeenCalledWith('/calendar/spending?range=this-year');
		});
	});

	it('shows the custom date inputs when the custom range is active', async () => {
		const { goto } = await import('$app/navigation');
		render(SpendingPage, { props: { data: pageData({ range: 'custom' }) } });

		expect(screen.getByLabelText('From date')).toBeTruthy();
		expect(screen.getByLabelText('To date')).toBeTruthy();

		// SAFETY: getByLabelText found exactly the from-date input; the cast
		// exposes .value for the programmatic input event.
		const from = screen.getByLabelText('From date') as HTMLInputElement;
		from.value = '2026-01-01';
		fireEvent.input(from);

		await vi.waitFor(() => {
			expect(goto).toHaveBeenCalledWith('/calendar/spending?range=custom&from=2026-01-01');
		});
	});

	it('renders the Undated row under All time and drills into it', async () => {
		render(SpendingPage, {
			props: {
				data: pageData({
					range: 'all',
					undatedSpend: [{ category: 'other', cents: 5000, billIds: ['b-undated'] }],
					bills: [billFixture({ id: 'b-undated', category: 'other', amountCents: 5000 })]
				})
			}
		});

		expect(screen.getByText('Undated (no due month)')).toBeTruthy();

		fireEvent.click(screen.getByRole('button', { name: /Other/ }));
		await vi.waitFor(() => {
			expect(screen.getByText('Other — $50.00')).toBeTruthy();
		});
		expect(screen.getByText('No due date')).toBeTruthy();
	});

	it('re-sorts top items between by-total and most-often', async () => {
		render(SpendingPage, {
			props: {
				data: pageData({
					topItems: [
						{ label: 'Rent share', category: 'housing', count: 1, cents: 90000 },
						{ label: 'Milk', category: 'other', count: 5, cents: 1700 }
					]
				})
			}
		});

		const items = () => screen.getAllByText(/Rent share|Milk/).map((el) => el.textContent);
		expect(items().indexOf('Rent share')).toBeLessThan(items().indexOf('Milk'));

		fireEvent.click(screen.getByRole('button', { name: 'Most often' }));
		await vi.waitFor(() => {
			expect(items().indexOf('Milk')).toBeLessThan(items().indexOf('Rent share'));
		});
	});
});
