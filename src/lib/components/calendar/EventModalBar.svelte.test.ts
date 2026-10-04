import { render, screen, fireEvent, cleanup, within } from '@testing-library/svelte';
import { describe, it, expect, vi, afterEach } from 'vitest';
import type { ComponentProps } from 'svelte';
import EventModalBar from './EventModalBar.svelte';

/** The bar's own prop contract, so a widened literal cannot slip past it. */
type BarProps = ComponentProps<typeof EventModalBar>;

function props(overrides: Partial<BarProps> = {}): BarProps {
	return {
		showDeleteConfirm: false,
		showDuplicateConfirm: false,
		attachedTaskCount: 0,
		isRecurring: false,
		deleteScope: 'this',
		eventTitle: 'Dinner',
		duplicating: false,
		deleting: false,
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

	// The recurrence card picks the scope; the confirm only has to say which one
	// it is about to do, so it does not carry a second pair of scope buttons.
	it('names the scope the recurrence card chose, for recurring events', async () => {
		const one = props({ showDeleteConfirm: true, isRecurring: true, deleteScope: 'this' });
		const { unmount } = render(EventModalBar, { props: one });
		await fireEvent.click(screen.getByText('Delete this occurrence'));
		expect(one.onDeleteScope).toHaveBeenCalledWith('this');
		unmount();

		const all = props({ showDeleteConfirm: true, isRecurring: true, deleteScope: 'all' });
		render(EventModalBar, { props: all });
		await fireEvent.click(screen.getByText('Delete every occurrence'));
		expect(all.onDeleteScope).toHaveBeenCalledWith('all');
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
