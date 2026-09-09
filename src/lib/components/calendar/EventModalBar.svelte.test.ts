import { render, screen, fireEvent, cleanup, within } from '@testing-library/svelte';
import { describe, it, expect, vi, afterEach } from 'vitest';
import EventModalBar from './EventModalBar.svelte';

function props(overrides = {}) {
	return {
		showDeleteConfirm: false,
		showDuplicateConfirm: false,
		attachedTaskCount: 0,
		isRecurring: false,
		eventTitle: 'Dinner',
		duplicating: false,
		onDeleteScope: vi.fn(),
		onCancelDelete: vi.fn(),
		onConfirmDuplicate: vi.fn(),
		onCancelDuplicate: vi.fn(),
		onBeginDelete: vi.fn(),
		onBeginDuplicate: vi.fn(),
		onEdit: vi.fn(),
		...overrides
	};
}

describe('EventModalBar', () => {
	afterEach(cleanup);

	it('opens delete + duplicate + edit flows', async () => {
		const p = props();
		render(EventModalBar, { props: p });
		await fireEvent.click(screen.getByLabelText('Delete event'));
		expect(p.onBeginDelete).toHaveBeenCalledOnce();
		await fireEvent.click(screen.getByLabelText('Duplicate event'));
		expect(p.onBeginDuplicate).toHaveBeenCalledOnce();
		await fireEvent.click(screen.getByLabelText('Edit event'));
		expect(p.onEdit).toHaveBeenCalledOnce();
	});

	it('confirms single delete with the task warning', async () => {
		const p = props({ showDeleteConfirm: true, attachedTaskCount: 2 });
		render(EventModalBar, { props: p });
		// SAFETY: the prompt text renders inside the popover container div.
		const pop = within(screen.getByText('Delete this event?').closest('div') as HTMLElement);
		expect(pop.getByText(/2 attached task\(s\)/)).toBeTruthy();
		await fireEvent.click(pop.getByText(/^Delete$/));
		expect(p.onDeleteScope).toHaveBeenCalledWith();
	});

	it('confirms occurrence vs series for recurring events', async () => {
		const p = props({ showDeleteConfirm: true, isRecurring: true });
		render(EventModalBar, { props: p });
		await fireEvent.click(screen.getByText('This occurrence'));
		expect(p.onDeleteScope).toHaveBeenCalledWith('this');
		await fireEvent.click(screen.getByText('Whole series'));
		expect(p.onDeleteScope).toHaveBeenCalledWith('all');
	});

	it('confirms duplication with the copy title', async () => {
		const p = props({ showDuplicateConfirm: true });
		render(EventModalBar, { props: p });
		// SAFETY: the prompt text renders inside the popover container div.
		const pop = within(screen.getByText('Duplicate this event?').closest('div') as HTMLElement);
		await fireEvent.click(pop.getByText(/^Duplicate$/));
		expect(p.onConfirmDuplicate).toHaveBeenCalledOnce();
	});
});
