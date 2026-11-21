/**
 * The detail region's action bar: the three triggers, a delete ask that names
 * the armed scope, and a bar that cannot fire two deletes (issue 015). The
 * callbacks are the contract a screen relies on.
 *
 * Doc: ../../README.md#public-interface
 */
import { describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/svelte';
import { afterEach } from 'vitest';
import CalendarEventModalBar from './CalendarEventModalBar.svelte';

afterEach(cleanup);

function renderBar(overrides: Record<string, unknown> = {}) {
	const ondelete = vi.fn();
	const onduplicate = vi.fn();
	const onedit = vi.fn();
	render(CalendarEventModalBar, {
		props: {
			isRecurring: true,
			deleteScope: 'this' as const,
			attachedTaskCount: 0,
			eventTitle: 'Dentist',
			duplicating: false,
			deleting: false,
			ondelete,
			onduplicate,
			onedit,
			...overrides
		}
	});
	return { ondelete, onduplicate, onedit };
}

describe('CalendarEventModalBar (EventModalBar.svelte)', () => {
	it('names the armed scope on the delete ask and confirms with that scope', async () => {
		const { ondelete } = renderBar();
		await fireEvent.click(screen.getByRole('button', { name: 'Delete event' }));
		expect(screen.getByText('Delete just this one?')).toBeTruthy();
		await fireEvent.click(screen.getByTestId('delete-confirm-yes'));
		expect(ondelete).toHaveBeenCalledWith('this');
	});

	it('names the whole series when the scope is all', async () => {
		renderBar({ deleteScope: 'all' });
		await fireEvent.click(screen.getByRole('button', { name: 'Delete event' }));
		expect(screen.getByText('Delete the whole series?')).toBeTruthy();
		expect(screen.getByTestId('delete-confirm-yes').textContent?.trim()).toBe(
			'Delete every occurrence'
		);
	});

	it('warns about attached tasks and disables the confirm while deleting', async () => {
		renderBar({ attachedTaskCount: 2, deleting: true });
		await fireEvent.click(screen.getByRole('button', { name: 'Delete event' }));
		expect(screen.getByText('⚠️ 2 attached task(s) will also be deleted.')).toBeTruthy();
		expect((screen.getByTestId('delete-confirm-yes') as HTMLButtonElement).disabled).toBe(true);
	});

	it('asks before duplicating and reports the choice', async () => {
		const { onduplicate } = renderBar();
		await fireEvent.click(screen.getByRole('button', { name: 'Duplicate event' }));
		expect(screen.getByText(/A copy titled "Dentist \(copy\)" will be created\./)).toBeTruthy();
		await fireEvent.click(screen.getByRole('button', { name: 'Duplicate' }));
		expect(onduplicate).toHaveBeenCalledTimes(1);
	});

	it('opens the edit form from Edit Event', async () => {
		const { onedit } = renderBar();
		await fireEvent.click(screen.getByRole('button', { name: 'Edit event' }));
		expect(onedit).toHaveBeenCalledTimes(1);
	});
});
