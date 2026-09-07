import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup, fireEvent } from '@testing-library/svelte';
import { tick } from 'svelte';
import BillsPage from './+page.svelte';
import { invalidateAll } from '$app/navigation';
import type { Bill } from '$lib/server/db/schema';
import type { ParsedBill } from '$lib/server/services/naturalLanguageService';
import type { PageData } from './$types';

// oxlint-disable-next-line anti-slop/no-module-mocking -- SvelteKit $app/navigation is framework-injected; no DI seam exists.
vi.mock('$app/navigation', () => ({ invalidateAll: vi.fn() }));

// oxlint-disable-next-line anti-slop/no-module-mocking -- toast store is global side-effect state; spying keeps assertions local.
vi.mock('$lib/client/toasts', () => ({ pushToast: vi.fn() }));

/** A Bill fixture; fields the page doesn't read keep schema-shaped defaults. */
function billFixture(over: Partial<Bill> = {}): Bill {
	return {
		id: 'bill-1',
		title: 'Electric',
		amountCents: 12000,
		dueDate: null,
		category: 'utilities',
		paidAt: null,
		userId: 'u1',
		familyId: null,
		createdAt: new Date('2026-09-01T00:00:00Z'),
		...over
	};
}

/** The PageData slice the bills page reads (its +page.server.ts load return). */
interface BillsPageData {
	bills: Bill[];
	canEdit: boolean;
	familyId: string | null;
	loadWarnings: string[];
}

/** Page data fixture matching +page.server.ts's load return shape. */
function pageData(bills: Bill[], canEdit = true, loadWarnings: string[] = []): PageData {
	const data: BillsPageData = { bills, canEdit, familyId: null, loadWarnings };
	// SAFETY: the fixture supplies exactly what the bills page reads; the
	// layout-level fields on PageData (user, userSettings, …) are out of scope.
	return data as PageData;
}

/** JSON the page's endpoints return in these tests (parse-bill or bills). */
interface EndpointPayload {
	parsed?: ParsedBill;
	method?: string;
	success?: boolean;
	bill?: Bill;
}

/** A Response for the authed JSON endpoints the page calls. */
function okJson(body: EndpointPayload, status = 200): Response {
	return new Response(JSON.stringify(body), { status });
}

beforeEach(() => {
	vi.stubGlobal(
		'fetch',
		vi.fn(() => Promise.resolve(okJson({ success: true, bill: billFixture() })))
	);
});

afterEach(() => {
	cleanup();
	vi.unstubAllGlobals();
	vi.clearAllMocks();
	vi.useRealTimers();
});

describe('bills page rows', () => {
	it('shows a Paid badge for paid bills and none for unpaid', () => {
		render(BillsPage, {
			props: {
				data: pageData([
					billFixture({ id: 'a', title: 'Rent', paidAt: '2026-09-01T00:00:00Z' }),
					billFixture({ id: 'b', title: 'Electric' })
				])
			}
		});

		expect(screen.getByText('Paid')).toBeInTheDocument();
	});

	it('renders category labels capitalized in rows and options', () => {
		render(BillsPage, { props: { data: pageData([billFixture()]) } });

		// Row label + select option both show the capitalized form.
		expect(screen.getAllByText('Utilities')).toHaveLength(2);
	});

	it('renders the due date as a red pill when overdue and grey otherwise', () => {
		const past = '2020-01-01T00:00:00.000Z';
		const future = '2099-01-01T00:00:00.000Z';
		render(BillsPage, {
			props: {
				data: pageData([
					billFixture({ id: 'a', title: 'Old', dueDate: past }),
					billFixture({ id: 'b', title: 'New', dueDate: future })
				])
			}
		});

		const oldPill = screen.getByText(new Date(past).toLocaleDateString());
		const newPill = screen.getByText(new Date(future).toLocaleDateString());
		expect(oldPill.className).toContain('bg-red-100');
		expect(newPill.className).toContain('bg-slate-100');
		expect(newPill.className).not.toContain('bg-red-100');
	});
});

describe('mark paid toggle', () => {
	it('PUTs paid:true and flips the badge optimistically', async () => {
		// Hold the handler after the optimistic update: invalidateAll never
		// resolves, so the in-flight (badge flipped, button busy) state persists.
		vi.mocked(invalidateAll).mockImplementation(() => new Promise(() => {}));
		render(BillsPage, {
			props: { data: pageData([billFixture({ id: 'bill-1', title: 'Electric' })]) }
		});

		await fireEvent.click(screen.getByRole('button', { name: 'Mark paid Electric' }));

		const fetchMock = vi.mocked(fetch);
		expect(fetchMock).toHaveBeenCalledWith(
			'/api/bills/bill-1',
			expect.objectContaining({ method: 'PUT' })
		);
		expect(JSON.parse(String(fetchMock.mock.calls[0][1]?.body))).toEqual({ paid: true });
		expect(await screen.findByText('Paid')).toBeInTheDocument();
		expect(screen.getByRole('button', { name: 'Mark unpaid Electric' })).toBeInTheDocument();
	});

	it('reverts the badge and shows the error box when the PUT fails', async () => {
		vi.stubGlobal(
			'fetch',
			vi.fn(() => Promise.resolve(new Response(JSON.stringify({ error: 'nope' }), { status: 500 })))
		);
		render(BillsPage, {
			props: { data: pageData([billFixture({ id: 'bill-1', title: 'Electric' })]) }
		});

		await fireEvent.click(screen.getByRole('button', { name: 'Mark paid Electric' }));

		expect(await screen.findByRole('alert')).toHaveTextContent('nope');
		expect(screen.queryByText('Paid')).not.toBeInTheDocument();
	});
});

describe('delete flow', () => {
	it('uses an inline confirm step before sending DELETE', async () => {
		render(BillsPage, {
			props: { data: pageData([billFixture({ id: 'bill-1', title: 'Electric' })]) }
		});

		await fireEvent.click(screen.getByRole('button', { name: 'Delete bill Electric' }));
		expect(vi.mocked(fetch)).not.toHaveBeenCalled();

		await fireEvent.click(screen.getByRole('button', { name: 'Confirm delete Electric' }));
		expect(vi.mocked(fetch)).toHaveBeenCalledWith(
			'/api/bills/bill-1',
			expect.objectContaining({ method: 'DELETE' })
		);
	});

	it('cancels the inline confirm without deleting', async () => {
		render(BillsPage, {
			props: { data: pageData([billFixture({ id: 'bill-1', title: 'Electric' })]) }
		});

		await fireEvent.click(screen.getByRole('button', { name: 'Delete bill Electric' }));
		await fireEvent.click(screen.getByRole('button', { name: 'Cancel delete' }));

		expect(
			screen.queryByRole('button', { name: 'Confirm delete Electric' })
		).not.toBeInTheDocument();
		expect(vi.mocked(fetch)).not.toHaveBeenCalled();
	});
});

describe('bill detail row (storage-free, issue 010)', () => {
	it('expands to the storage-free note with no images and no attach affordance', async () => {
		render(BillsPage, { props: { data: pageData([billFixture()]) } });

		await fireEvent.click(screen.getByRole('button', { name: 'Show details for Electric' }));

		expect(screen.queryByRole('img', { name: /receipt/i })).not.toBeInTheDocument();
		expect(screen.queryByRole('button', { name: 'Attach receipt photo' })).not.toBeInTheDocument();
		expect(screen.queryByRole('button', { name: /Remove receipt/ })).not.toBeInTheDocument();
		expect(screen.getByText(/scanned on your device and discarded/i)).toBeInTheDocument();
	});

	it('collapses again on a second toggle', async () => {
		render(BillsPage, { props: { data: pageData([billFixture()]) } });

		await fireEvent.click(screen.getByRole('button', { name: 'Show details for Electric' }));
		await fireEvent.click(screen.getByRole('button', { name: 'Hide details for Electric' }));

		expect(screen.queryByText(/scanned on your device and discarded/i)).not.toBeInTheDocument();
	});
});

describe('receipt scan prefill (issue 010, process-and-delete)', () => {
	it('prefills the form from a scan and persists NOTHING — no upload, no create', async () => {
		// oxlint-disable-next-line anti-slop/no-module-mocking -- client OCR engine has no DI seam; the mock stands in for the browser engine chain.
		vi.mock('$lib/client/receiptOcr', () => ({
			// SAFETY: module mock — the page's only import from this module.
			scanReceiptImage: vi.fn(async () => ({ ok: true, text: 'CITY POWER TOTAL $120.00' }))
		}));
		// oxlint-disable-next-line anti-slop/no-module-mocking -- pure extraction seam, see above.
		vi.mock('$lib/utils/receiptScan', () => ({
			// SAFETY: module mock — pure extraction, exercised elsewhere.
			scanReceipt: vi.fn(() => ({
				merchant: 'City Power',
				totalCents: 12000,
				dateIso: '2026-09-15',
				category: 'utilities'
			}))
		}));
		render(BillsPage, { props: { data: pageData([billFixture()]) } });

		const input = screen.getByLabelText('Pick a receipt photo to scan');
		Object.defineProperty(input, 'files', {
			value: [new File(['x'], 'receipt.jpg', { type: 'image/jpeg' })],
			configurable: true
		});
		await fireEvent.change(input);

		expect(await screen.findByDisplayValue('City Power')).toBeInTheDocument();
		expect(screen.getByDisplayValue('120.00')).toBeInTheDocument();
		expect(screen.getByText('Category suggested — confirm')).toBeInTheDocument();
		// The image is discarded after prefilling: no upload call, no create.
		expect(vi.mocked(fetch)).not.toHaveBeenCalled();
	});

	it('shows the scan affordance and progress placeholder semantics', () => {
		render(BillsPage, { props: { data: pageData([billFixture()]) } });

		expect(screen.getByRole('button', { name: 'Scan receipt' })).toBeInTheDocument();
		expect(screen.queryByText('Reading receipt…')).not.toBeInTheDocument();
	});
});

describe('quick-add NLP prefill (issue 011)', () => {
	function parseFetchMock(parsed: ParsedBill) {
		return vi.fn((input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
			void init;
			const url = String(input);
			if (url.includes('/api/parse-bill')) {
				return Promise.resolve(okJson({ parsed, method: 'regex' }));
			}
			return Promise.resolve(okJson({ success: true, bill: billFixture() }, 201));
		});
	}

	it('debounces the title field into a parse-bill call and prefills the form', async () => {
		vi.useFakeTimers();
		vi.stubGlobal(
			'fetch',
			parseFetchMock({
				title: 'Electric bill',
				amount: 120,
				amountCents: 12000,
				dueDate: '2026-09-11',
				recurring: 'weekly',
				frequency: 'weekly',
				interval: 1,
				category: 'utilities',
				confidence: 0.9
			})
		);
		render(BillsPage, { props: { data: pageData([billFixture()]) } });

		await fireEvent.input(screen.getByLabelText('Bill title'), {
			target: { value: 'electric 120 due friday' }
		});
		await vi.advanceTimersByTimeAsync(300);
		await tick();

		expect(vi.mocked(fetch)).toHaveBeenCalledWith(
			'/api/parse-bill',
			expect.objectContaining({ method: 'POST' })
		);
		expect(screen.getByDisplayValue('Electric bill')).toBeInTheDocument();
		expect(screen.getByDisplayValue('120.00')).toBeInTheDocument();
		expect(screen.getByDisplayValue('2026-09-11')).toBeInTheDocument();
		expect(screen.getByText('Category suggested — confirm')).toBeInTheDocument();
	});

	it('sends only the clean create shape — parked recurrence never reaches createBill', async () => {
		vi.useFakeTimers();
		const fetchMock = parseFetchMock({
			title: 'Rent',
			amount: 1500,
			amountCents: 150000,
			dueDate: '2026-10-01',
			recurring: 'monthly',
			frequency: 'monthly',
			interval: 1,
			category: 'housing',
			confidence: 0.9
		});
		vi.stubGlobal('fetch', fetchMock);
		render(BillsPage, { props: { data: pageData([billFixture()]) } });

		await fireEvent.input(screen.getByLabelText('Bill title'), {
			target: { value: 'rent 1500 monthly on the 1st' }
		});
		await vi.advanceTimersByTimeAsync(300);
		await tick();
		await fireEvent.click(screen.getByRole('button', { name: 'Add bill' }));

		const createCall = fetchMock.mock.calls.find(([url]) => String(url) === '/api/bills');
		expect(createCall).toBeTruthy();
		const body = JSON.parse(String(createCall?.[1]?.body));
		expect(body).toEqual({
			title: 'Rent',
			amount: '1500.00',
			dueDate: '2026-10-01',
			category: 'housing'
		});
		expect(body).not.toHaveProperty('recurring');
		expect(body).not.toHaveProperty('frequency');
		expect(body).not.toHaveProperty('interval');
	});
});

describe('error and empty states', () => {
	it('dismisses the error box via the ✕ button', async () => {
		vi.stubGlobal(
			'fetch',
			vi.fn(() => Promise.resolve(new Response(JSON.stringify({ error: 'boom' }), { status: 500 })))
		);
		render(BillsPage, {
			props: { data: pageData([billFixture({ id: 'bill-1', title: 'Electric' })]) }
		});

		await fireEvent.click(screen.getByRole('button', { name: 'Mark paid Electric' }));
		expect(await screen.findByRole('alert')).toBeInTheDocument();

		await fireEvent.click(screen.getByRole('button', { name: 'Dismiss error' }));
		expect(await screen.findByText(/boom/).catch(() => null)).toBeNull();
	});

	it('shows an amber loadWarnings box when present', () => {
		render(BillsPage, { props: { data: pageData([], true, ['bills failed']) } });

		expect(screen.getByText(/bills failed/)).toBeInTheDocument();
	});

	it('shows an empty state with no bills', () => {
		render(BillsPage, { props: { data: pageData([]) } });

		expect(screen.getByText('No bills yet')).toBeInTheDocument();
	});
});
