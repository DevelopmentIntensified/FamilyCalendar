import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup, fireEvent } from '@testing-library/svelte';
import { tick } from 'svelte';
import BillsPage from './+page.svelte';
import { invalidateAll } from '$app/navigation';
import type { Bill, ReceiptItem } from '$lib/server/db/schema';
import type { ParsedBill } from '$lib/server/services/naturalLanguageService';
import type { PageData } from './$types';

// oxlint-disable-next-line anti-slop/no-module-mocking -- SvelteKit $app/navigation is framework-injected; no DI seam exists.
vi.mock('$app/navigation', () => ({ invalidateAll: vi.fn() }));

// oxlint-disable-next-line anti-slop/no-module-mocking -- toast store is global side-effect state; spying keeps assertions local.
vi.mock('$lib/client/toasts', () => ({ pushToast: vi.fn() }));

// oxlint-disable-next-line anti-slop/no-module-mocking -- client OCR chain has no DI seam in component tests; mocks stand in for the browser engines.
vi.mock('$lib/client/receiptOcr', () => ({
	// SAFETY: module mock — the page's imports from this module.
	scanReceiptWithFallback: vi.fn(async () => ({
		quality: 'ok' as const,
		text: 'CITY POWER\nTOTAL $120.00',
		local: {
			merchant: 'City Power',
			totalCents: 12000,
			dateIso: '2026-09-15',
			category: 'utilities'
		}
	})),
	cloudScanReceipt: vi.fn()
}));

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
	cloudScanAvailable: boolean;
	itemsByBill: Map<string, ReceiptItem[]>;
	spend: Array<{ category: string; cents: number; billIds: string[] }>;
	spendMonth: string;
	tagSuggestions: { user: TagRow[]; global: TagRow[] };
}

/** A Tag Table row as the page's datalist + badges read it. */
interface TagRow {
	key: string;
	category: string;
	name: string | null;
	weight: number;
}

function tagRow(over: Partial<TagRow> = {}): TagRow {
	return { key: 'whole milk', category: 'utilities', name: null, weight: 1, ...over };
}

/** A ReceiptItem fixture for the line-items editor. */
function itemFixture(billId: string, over: Partial<ReceiptItem> = {}): ReceiptItem {
	return {
		id: 'ri-1',
		billId,
		label: 'Whole Milk',
		priceCents: 349,
		category: null,
		position: 0,
		createdAt: new Date('2026-09-01T00:00:00Z'),
		...over
	};
}

/** Page data fixture matching +page.server.ts's load return shape. */
function pageData(
	bills: Bill[],
	canEdit = true,
	loadWarnings: string[] = [],
	cloudScanAvailable = false,
	over: Partial<BillsPageData> = {}
): PageData {
	const data: BillsPageData = {
		bills,
		canEdit,
		familyId: null,
		loadWarnings,
		cloudScanAvailable,
		itemsByBill: new Map(),
		spend: [],
		spendMonth: '2026-09',
		tagSuggestions: { user: [], global: [] },
		...over
	};
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

describe('cloud scan opt-in (issue 010, never auto-send)', () => {
	const poorFlow = {
		quality: 'poor' as const,
		text: '',
		local: { merchant: null, totalCents: null, dateIso: null, category: 'other' as const }
	};

	function pickReceipt() {
		const input = screen.getByLabelText('Pick a receipt photo to scan');
		Object.defineProperty(input, 'files', {
			value: [new File(['x'], 'receipt.jpg', { type: 'image/jpeg' })],
			configurable: true
		});
		return fireEvent.change(input);
	}

	it('poor scan + cloud available → asks first, sends NOTHING until accepted', async () => {
		vi.mocked(await import('$lib/client/receiptOcr')).scanReceiptWithFallback.mockResolvedValue(
			poorFlow
		);
		render(BillsPage, { props: { data: pageData([billFixture()], true, [], true) } });
		await pickReceipt();

		expect(
			await screen.findByText(/Try cloud scan\? Your receipt photo is sent to Azure/)
		).toBeInTheDocument();
		expect(screen.getByRole('button', { name: 'Scan with cloud' })).toBeInTheDocument();
		expect(screen.getByRole('button', { name: 'No thanks' })).toBeInTheDocument();
		// Opt-in is real: no network call before the user accepts.
		expect(vi.mocked(fetch)).not.toHaveBeenCalled();
	});

	it('accepting runs the cloud scan, prefills the same form, sends nothing else', async () => {
		const ocr = await import('$lib/client/receiptOcr');
		vi.mocked(ocr.scanReceiptWithFallback).mockResolvedValue(poorFlow);
		vi.mocked(ocr.cloudScanReceipt).mockResolvedValue({
			merchant: 'City Power & Light',
			totalCents: 12050,
			date: '2026-09-05',
			lineItems: [{ label: 'Electric usage', priceCents: 9850 }],
			category: 'utilities'
		});
		render(BillsPage, { props: { data: pageData([billFixture()], true, [], true) } });
		await pickReceipt();
		await fireEvent.click(await screen.findByRole('button', { name: 'Scan with cloud' }));

		expect(ocr.cloudScanReceipt).toHaveBeenCalledExactlyOnceWith(expect.any(File));
		expect(await screen.findByDisplayValue('City Power & Light')).toBeInTheDocument();
		expect(screen.getByDisplayValue('120.50')).toBeInTheDocument();
		expect(screen.getByDisplayValue('2026-09-05')).toBeInTheDocument();
		// The prompt resolves away; no create, no other endpoint touched.
		expect(screen.queryByRole('button', { name: 'Scan with cloud' })).not.toBeInTheDocument();
		expect(vi.mocked(fetch)).not.toHaveBeenCalled();
	});

	it('declining keeps the image on-device and falls back to manual fields', async () => {
		vi.mocked(await import('$lib/client/receiptOcr')).scanReceiptWithFallback.mockResolvedValue(
			poorFlow
		);
		render(BillsPage, { props: { data: pageData([billFixture()], true, [], true) } });
		await pickReceipt();
		await fireEvent.click(await screen.findByRole('button', { name: 'No thanks' }));

		expect(
			screen.getByText("Couldn't read the receipt clearly — fill the fields manually.")
		).toBeInTheDocument();
		expect(screen.queryByRole('button', { name: 'Scan with cloud' })).not.toBeInTheDocument();
		expect(vi.mocked(fetch)).not.toHaveBeenCalled();
	});

	it('poor scan without cloud capability shows the manual-fill notice directly', async () => {
		vi.mocked(await import('$lib/client/receiptOcr')).scanReceiptWithFallback.mockResolvedValue(
			poorFlow
		);
		render(BillsPage, { props: { data: pageData([billFixture()]) } });
		await pickReceipt();

		expect(
			await screen.findByText("Couldn't read the receipt clearly — fill the fields manually.")
		).toBeInTheDocument();
		expect(screen.queryByText(/Try cloud scan\?/)).not.toBeInTheDocument();
		expect(vi.mocked(fetch)).not.toHaveBeenCalled();
	});

	it('surfaces the cloud error as a plain inline message', async () => {
		vi.mocked(await import('$lib/client/receiptOcr')).scanReceiptWithFallback.mockResolvedValue(
			poorFlow
		);
		vi.mocked(await import('$lib/client/receiptOcr')).cloudScanReceipt.mockRejectedValue(
			new Error('Cloud scan failed (Azure returned 503).')
		);
		render(BillsPage, { props: { data: pageData([billFixture()], true, [], true) } });
		await pickReceipt();
		await fireEvent.click(await screen.findByRole('button', { name: 'Scan with cloud' }));

		expect(await screen.findByText('Cloud scan failed (Azure returned 503).')).toBeInTheDocument();
		expect(screen.queryByRole('button', { name: 'Scan with cloud' })).not.toBeInTheDocument();
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

describe('spend detail card (#031)', () => {
	const spend = [
		{ category: 'utilities', cents: 12000, billIds: ['a'] },
		{ category: 'tax', cents: 96, billIds: ['a'] },
		{ category: 'housing', cents: 5000, billIds: ['b'] }
	];

	function spendData() {
		return pageData(
			[
				billFixture({ id: 'a', title: 'Electric', category: 'utilities' }),
				billFixture({ id: 'b', title: 'Rent', category: 'housing', amountCents: 5000 })
			],
			true,
			[],
			false,
			{ spend }
		);
	}

	it('renders one bar per category with amount and share', () => {
		render(BillsPage, { props: { data: spendData() } });

		expect(screen.getByLabelText('Spend by category')).toBeInTheDocument();
		// Amounts render in the bars: utilities 120.00, housing 50.00.
		expect(screen.getAllByText('$120.00').length).toBeGreaterThan(0);
		expect(screen.getAllByText('$50.00').length).toBeGreaterThan(0);
	});

	it('taps a bar to filter the bill list to that category, again to clear', async () => {
		render(BillsPage, { props: { data: spendData() } });

		await fireEvent.click(screen.getByRole('button', { name: /Housing/ }));

		expect(screen.getByText('Rent')).toBeInTheDocument();
		expect(screen.queryByText('Electric')).not.toBeInTheDocument();
		expect(screen.getByText('Showing Housing bills.')).toBeInTheDocument();

		await fireEvent.click(screen.getByRole('button', { name: 'Show all' }));
		expect(screen.getByText('Electric')).toBeInTheDocument();
		expect(screen.getByText('Rent')).toBeInTheDocument();
	});
});

describe('line items editor (#031)', () => {
	function expandElectric(items: ReceiptItem[] = [], over: Partial<Bill> = {}) {
		const b = billFixture({ id: 'bill-1', title: 'Electric', ...over });
		render(BillsPage, {
			props: {
				data: pageData([b], true, [], false, { itemsByBill: new Map([['bill-1', items]]) })
			}
		});
		return fireEvent.click(screen.getByRole('button', { name: 'Show details for Electric' }));
	}

	it('expands to the stored line items', async () => {
		await expandElectric([
			itemFixture('bill-1'),
			itemFixture('bill-1', { id: 'ri-2', label: 'Eggs', priceCents: 250, position: 1 })
		]);

		expect(screen.getByDisplayValue('Whole Milk')).toBeInTheDocument();
		expect(screen.getByDisplayValue('3.49')).toBeInTheDocument();
		expect(screen.getByDisplayValue('Eggs')).toBeInTheDocument();
	});

	it('adds a row and PUTs the replace-all item list on save', async () => {
		await expandElectric([itemFixture('bill-1')]);

		await fireEvent.click(screen.getByRole('button', { name: 'Add item' }));
		await fireEvent.input(screen.getByLabelText('Line item label 2'), {
			target: { value: 'Sales tax' }
		});
		await fireEvent.input(screen.getByLabelText('Line item price 2'), {
			target: { value: '0.96' }
		});
		await fireEvent.change(screen.getByLabelText('Line item category 2'), {
			target: { value: 'tax' }
		});
		await fireEvent.click(screen.getByRole('button', { name: 'Save line items' }));

		const fetchMock = vi.mocked(fetch);
		expect(fetchMock).toHaveBeenCalledWith(
			'/api/bills/bill-1',
			expect.objectContaining({ method: 'PUT' })
		);
		const body = JSON.parse(String(fetchMock.mock.calls[0][1]?.body));
		expect(body.items).toEqual([
			{ label: 'Whole Milk', priceCents: 349, category: null, name: null },
			{ label: 'Sales tax', priceCents: 96, category: 'tax', name: null }
		]);
	});

	it('shows the reconcile hint with a one-tap tax add when items < total', async () => {
		await expandElectric([itemFixture('bill-1')], { amountCents: 1200 });

		expect(
			screen.getByText(/Items sum to \$3\.49 of \$12\.00 — add a tax\/fees line\?/)
		).toBeInTheDocument();
		await fireEvent.click(screen.getByRole('button', { name: 'Add “Sales tax” $8.51' }));

		expect(screen.getByDisplayValue('Sales tax')).toBeInTheDocument();
		expect(screen.getByDisplayValue('8.51')).toBeInTheDocument();
	});

	it('keeps quiet when the items sum matches the total within a cent', async () => {
		await expandElectric([itemFixture('bill-1', { priceCents: 12000 })], { amountCents: 12000 });

		expect(screen.queryByText(/add a tax\/fees line\?/)).not.toBeInTheDocument();
	});

	it('renders a bare-code item with a name-it-once prompt', async () => {
		await expandElectric([itemFixture('bill-1', { label: '4011', priceCents: 349 })]);

		expect(screen.getByText(/Item 4011 · \$3\.49/)).toBeInTheDocument();
		expect(screen.getByLabelText('Name for item 4011')).toBeInTheDocument();
	});

	it('sends the learned SKU name with the save (trains the tag table)', async () => {
		await expandElectric([itemFixture('bill-1', { label: '4011', priceCents: 349 })]);

		await fireEvent.input(screen.getByLabelText('Name for item 4011'), {
			target: { value: 'Banana' }
		});
		await fireEvent.click(screen.getByRole('button', { name: 'Save line items' }));

		const body = JSON.parse(String(vi.mocked(fetch).mock.calls[0][1]?.body));
		expect(body.items).toEqual([
			{ label: '4011', priceCents: 349, category: null, name: 'Banana' }
		]);
	});

	it('couples label suggestions to a preloaded datalist capped at 10', async () => {
		const user = Array.from({ length: 30 }, (_, i) => tagRow({ key: `item ${i}` }));
		const global = Array.from({ length: 30 }, (_, i) => tagRow({ key: `item g${i}` }));
		render(BillsPage, {
			props: {
				data: pageData([billFixture()], true, [], false, {
					tagSuggestions: { user, global }
				})
			}
		});

		await fireEvent.click(screen.getByRole('button', { name: 'Show details for Electric' }));
		await fireEvent.click(screen.getByRole('button', { name: 'Add item' }));
		await fireEvent.input(screen.getByLabelText('Line item label 1'), {
			target: { value: 'item' }
		});

		const options = document.querySelectorAll('#tag-suggestions option');
		expect(options.length).toBe(10);
	});

	it('badges a label from the user history vs the global table', async () => {
		render(BillsPage, {
			props: {
				data: pageData([billFixture()], true, [], false, {
					itemsByBill: new Map([
						[
							'bill-1',
							[
								itemFixture('bill-1', { label: 'Whole Milk' }),
								itemFixture('bill-1', { id: 'ri-2', label: 'Delivery fee', position: 1 })
							]
						]
					]),
					tagSuggestions: {
						user: [tagRow({ key: 'whole milk' })],
						global: [tagRow({ key: 'delivery fee' })]
					}
				})
			}
		});

		await fireEvent.click(screen.getByRole('button', { name: 'Show details for Electric' }));

		expect(screen.getByText('your history')).toBeInTheDocument();
		expect(screen.getByText('common')).toBeInTheDocument();
	});
});

describe('create-form line items (#031, collapsed by default)', () => {
	it('hides the items section until expanded, then sends items with the create', async () => {
		render(BillsPage, { props: { data: pageData([]) } });

		expect(screen.queryByLabelText(/Line item label/)).not.toBeInTheDocument();
		await fireEvent.click(screen.getByRole('button', { name: /Line items/ }));
		expect(screen.getByRole('button', { name: 'Add item' })).toBeInTheDocument();

		await fireEvent.click(screen.getByRole('button', { name: 'Add item' }));
		await fireEvent.input(screen.getByLabelText('Bill title'), { target: { value: 'Kroger' } });
		await fireEvent.input(screen.getByLabelText('Amount in dollars'), {
			target: { value: '25.50' }
		});
		await fireEvent.input(screen.getByLabelText('Line item label 1'), {
			target: { value: 'Milk' }
		});
		await fireEvent.input(screen.getByLabelText('Line item price 1'), {
			target: { value: '3.49' }
		});
		await fireEvent.click(screen.getByRole('button', { name: 'Add bill' }));

		const body = JSON.parse(
			String(vi.mocked(fetch).mock.calls.find(([url]) => String(url) === '/api/bills')?.[1]?.body)
		);
		expect(body.items).toEqual([{ label: 'Milk', priceCents: 349, category: null, name: null }]);
	});
});
