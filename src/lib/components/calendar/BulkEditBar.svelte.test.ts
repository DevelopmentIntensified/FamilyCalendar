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
		onBulkLocation: vi.fn(),
		onBulkAttendants: vi.fn(),
		onBulkInstruction: vi.fn(),
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

	// #225: Enter on an empty Location must not wipe every selected location.
	it.each(['', '   '])('Enter in an empty Location (%j) does nothing (#225)', async (loc) => {
		const p = props({ bulkLocation: loc });
		render(BulkEditBar, { props: p });
		await fireEvent.keyDown(screen.getByLabelText('Set location'), { key: 'Enter' });
		expect(p.onRunBulk).not.toHaveBeenCalled();
	});

	it('Enter in a filled Location sets it (#225)', async () => {
		const p = props({ bulkLocation: 'Park' });
		render(BulkEditBar, { props: p });
		await fireEvent.keyDown(screen.getByLabelText('Set location'), { key: 'Enter' });
		expect(p.onRunBulk).toHaveBeenCalledWith({ type: 'location', location: 'Park' });
	});

	// #226: Enter must split/trim like the Add button.
	it.each([
		['Ann, Bob', ['Ann', 'Bob']],
		['  Ann ,,Bob , ', ['Ann', 'Bob']],
		['Ann', ['Ann']]
	])('Enter in + Attendant splits %j like the button (#226)', async (raw, add) => {
		const p = props({ bulkAttendants: raw });
		render(BulkEditBar, { props: p });
		await fireEvent.keyDown(screen.getByLabelText('Add attendant'), { key: 'Enter' });
		expect(p.onRunBulk).toHaveBeenCalledWith({ type: 'attendants', add });
		await fireEvent.click(screen.getByText('Add'));
		expect(p.onRunBulk).toHaveBeenLastCalledWith({ type: 'attendants', add });
	});

	it('Enter in an empty + Attendant does nothing (#226)', async () => {
		const p = props({ bulkAttendants: ' , ' });
		render(BulkEditBar, { props: p });
		await fireEvent.keyDown(screen.getByLabelText('Add attendant'), { key: 'Enter' });
		expect(p.onRunBulk).not.toHaveBeenCalled();
	});
});
