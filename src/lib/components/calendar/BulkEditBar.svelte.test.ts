import { render, screen, fireEvent, cleanup } from '@testing-library/svelte';
import { describe, it, expect, vi, afterEach } from 'vitest';
import BulkEditBar from './BulkEditBar.svelte';

function props(overrides = {}) {
	return {
		selectedIds: ['e1', 'e2'],
		bulkBusy: false,
		bulkConfirmDelete: false,
		smartPlan: null,
		pastWarning: false,
		bulkLocation: '',
		bulkAttendants: '',
		bulkInstruction: '',
		moreToolsOpen: true,
		bulkError: '',
		phraseReported: false,
		reportingPhrase: false,
		calendarIds: [{ id: 'c1', name: 'Mine' }],
		onRunBulk: vi.fn(),
		onRunSmart: vi.fn(),
		onApplyBulkCalendar: vi.fn(),
		onSetSelectionMode: vi.fn(),
		onAskDelete: vi.fn(),
		onDiscardPlan: vi.fn(),
		onCancelDelete: vi.fn(),
		onDismissPastWarning: vi.fn(),
		onToggleMoreTools: vi.fn(),
		onReportPhrase: vi.fn(),
		...overrides
	};
}

describe('BulkEditBar', () => {
	afterEach(cleanup);

	it('shows the selection count and fires done', async () => {
		const p = props();
		render(BulkEditBar, { props: p });
		expect(screen.getByText('2 selected')).toBeTruthy();
		await fireEvent.click(screen.getByText('Done'));
		expect(p.onSetSelectionMode).toHaveBeenCalledWith(false);
	});

	it('confirms delete through the inline two-step', async () => {
		const p = props({ bulkConfirmDelete: true });
		render(BulkEditBar, { props: p });
		expect(screen.getByText(/Delete 2 events/)).toBeTruthy();
		await fireEvent.click(screen.getByText('Yes, delete'));
		expect(p.onRunBulk).toHaveBeenCalledWith({ type: 'delete' });
	});

	it('reviews a smart plan with apply and discard', async () => {
		const p = props({
			smartPlan: { ops: [], items: [{ id: 'e1', label: 'Delete "X"' }] }
		});
		render(BulkEditBar, { props: p });
		expect(
			screen.getByText((_, el) => el?.tagName === 'LI' && el?.textContent === '• Delete "X"')
		).toBeTruthy();
		await fireEvent.click(screen.getByText('Discard'));
		expect(p.onDiscardPlan).toHaveBeenCalledOnce();
		await fireEvent.click(screen.getByText('Apply 1 change'));
		expect(p.onRunSmart).toHaveBeenCalledWith();
	});

	it('arms the delete confirm instead of deleting directly', async () => {
		const p = props();
		render(BulkEditBar, { props: p });
		await fireEvent.click(screen.getByText('Delete'));
		expect(p.onAskDelete).toHaveBeenCalledOnce();
		expect(p.onRunBulk).not.toHaveBeenCalled();
	});

	it('sends the smart instruction on enter', async () => {
		const p = props({ bulkInstruction: 'move all' });
		render(BulkEditBar, { props: p });
		await fireEvent.keyDown(screen.getByLabelText('Smart instruction'), { key: 'Enter' });
		expect(p.onRunSmart).toHaveBeenCalledOnce();
	});
});
