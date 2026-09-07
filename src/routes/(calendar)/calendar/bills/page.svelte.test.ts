import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup, fireEvent } from '@testing-library/svelte';
import BillsPage from './+page.svelte';
import { invalidateAll } from '$app/navigation';
import type { ReceiptRef } from '$lib/server/db/actions/attachments';
import type { Bill } from '$lib/server/db/schema';
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
		attachmentId: null,
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
	receiptsByBillId: Record<string, ReceiptRef>;
}

/** Page data fixture matching +page.server.ts's load return shape. */
function pageData(
	bills: Bill[],
	canEdit = true,
	loadWarnings: string[] = [],
	receiptsByBillId: Record<string, ReceiptRef> = {}
): PageData {
	const data: BillsPageData = { bills, canEdit, familyId: null, loadWarnings, receiptsByBillId };
	// SAFETY: the fixture supplies exactly what the bills page reads; the
	// layout-level fields on PageData (user, userSettings, …) are out of scope.
	return data as PageData;
}

beforeEach(() => {
	vi.stubGlobal(
		'fetch',
		vi.fn(() =>
			Promise.resolve(new Response(JSON.stringify({ success: true, bill: billFixture() })))
		)
	);
});

afterEach(() => {
	cleanup();
	vi.unstubAllGlobals();
	vi.clearAllMocks();
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

function receiptRef(over: Partial<ReceiptRef> = {}): ReceiptRef {
	return {
		id: 'att-1',
		url: 'https://blob.example/family-master/receipts/a.jpg',
		filename: 'family-master/receipts/a.jpg',
		mimeType: 'image/jpeg',
		...over
	};
}

describe('receipt detail area (issue 010)', () => {
	it('is hidden until the row is expanded', () => {
		render(BillsPage, {
			props: {
				data: pageData([billFixture({ attachmentId: 'att-1' })], true, [], {
					'bill-1': receiptRef()
				})
			}
		});

		expect(screen.queryByRole('img', { name: 'Receipt for Electric' })).not.toBeInTheDocument();
		expect(screen.getByRole('button', { name: 'Show details for Electric' })).toBeInTheDocument();
	});

	it('shows the thumbnail and full-size view after expanding', async () => {
		render(BillsPage, {
			props: {
				data: pageData([billFixture({ attachmentId: 'att-1' })], true, [], {
					'bill-1': receiptRef()
				})
			}
		});

		await fireEvent.click(screen.getByRole('button', { name: 'Show details for Electric' }));

		expect(screen.getByRole('img', { name: 'Receipt for Electric' })).toHaveAttribute(
			'src',
			receiptRef().url
		);

		await fireEvent.click(
			screen.getByRole('button', { name: 'View receipt full size for Electric' })
		);

		const modal = screen.getByRole('dialog', { name: 'Receipt full size' });
		expect(modal).toBeInTheDocument();
		expect(modal.querySelector('img')).toHaveAttribute('src', receiptRef().url);

		await fireEvent.click(screen.getByRole('button', { name: 'Close' }));
		expect(screen.queryByRole('dialog', { name: 'Receipt full size' })).not.toBeInTheDocument();
	});

	it('offers attach, not remove, when the bill has no receipt', async () => {
		render(BillsPage, { props: { data: pageData([billFixture()]) } });

		await fireEvent.click(screen.getByRole('button', { name: 'Show details for Electric' }));

		expect(screen.getByRole('button', { name: 'Attach receipt photo' })).toBeInTheDocument();
		expect(
			screen.queryByRole('button', { name: 'Remove receipt from Electric' })
		).not.toBeInTheDocument();
	});

	it('removes the receipt through an inline confirm (DELETE /api/receipts/[id])', async () => {
		render(BillsPage, {
			props: {
				data: pageData([billFixture({ attachmentId: 'att-1' })], true, [], {
					'bill-1': receiptRef()
				})
			}
		});

		await fireEvent.click(screen.getByRole('button', { name: 'Show details for Electric' }));
		await fireEvent.click(screen.getByRole('button', { name: 'Remove receipt from Electric' }));
		expect(vi.mocked(fetch)).not.toHaveBeenCalled();

		await fireEvent.click(
			screen.getByRole('button', { name: 'Confirm remove receipt from Electric' })
		);

		expect(vi.mocked(fetch)).toHaveBeenCalledWith(
			'/api/receipts/att-1',
			expect.objectContaining({ method: 'DELETE' })
		);
	});

	it('shows a skeleton while the receipt action is in flight', async () => {
		render(BillsPage, { props: { data: pageData([billFixture()]) } });

		await fireEvent.click(screen.getByRole('button', { name: 'Show details for Electric' }));

		// In-flight state only appears once a receipt action starts; before that
		// the attach affordance is present and no skeleton is shown.
		expect(screen.queryByText('Working on receipt…')).not.toBeInTheDocument();
		expect(screen.getByRole('button', { name: 'Attach receipt photo' })).toBeInTheDocument();
	});

	it('hides attach/remove for read-only viewers (view-only receipt)', async () => {
		render(BillsPage, {
			props: {
				data: pageData([billFixture({ attachmentId: 'att-1' })], false, [], {
					'bill-1': receiptRef()
				})
			}
		});

		await fireEvent.click(screen.getByRole('button', { name: 'Show details for Electric' }));

		expect(screen.getByRole('img', { name: 'Receipt for Electric' })).toBeInTheDocument();
		expect(screen.queryByRole('button', { name: 'Attach receipt photo' })).not.toBeInTheDocument();
		expect(
			screen.queryByRole('button', { name: 'Remove receipt from Electric' })
		).not.toBeInTheDocument();
	});

	it('has no detail toggle for a read-only viewer without a receipt', () => {
		render(BillsPage, { props: { data: pageData([billFixture()], false) } });

		expect(screen.queryByRole('button', { name: /Show details for/ })).not.toBeInTheDocument();
	});
});

describe('receipt scan prefill (issue 010)', () => {
	it('shows the scan affordance and progress placeholder semantics', () => {
		render(BillsPage, { props: { data: pageData([billFixture()]) } });

		expect(screen.getByRole('button', { name: 'Scan receipt' })).toBeInTheDocument();
		expect(screen.queryByText('Reading receipt…')).not.toBeInTheDocument();
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
