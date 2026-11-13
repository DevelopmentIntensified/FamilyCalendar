/**
 * The two-step delete control (folded from five legacy copies: TaskDetailBar's
 * "Delete" → ask → "Yes, delete" / "Cancel" row, the row trash triggers in
 * TaskRow / TaskCompletedRow / FamilyOpenTaskRow with their compact "Yes" /
 * "No" pair, and the family page's "Remove?" member row, which POSTs a form):
 * the first click only asks, cancel returns, confirm fires exactly once, focus
 * follows the ask, and Esc ends at the ask.
 *
 * Doc: src/lib/kernel/README.md
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, cleanup, fireEvent } from '@testing-library/svelte';
import { tick } from 'svelte';
import ConfirmAction from './ConfirmAction.svelte';

afterEach(cleanup);

const ask = (label: string) => screen.getByRole('button', { name: label });

/** Svelte 5 paints on a microtask; DOM reads wait one beat after a state change. */
function flush(): Promise<void> {
	return tick();
}

describe('ConfirmAction', () => {
	it('asks before acting: first click reveals the defaults, nothing is confirmed', async () => {
		const onconfirm = vi.fn();
		render(ConfirmAction, { props: { label: 'Delete', onconfirm } });

		expect(screen.queryByRole('button', { name: 'Yes, delete' })).toBeNull();
		expect(screen.queryByRole('button', { name: 'Cancel' })).toBeNull();

		await fireEvent.click(ask('Delete'));

		expect(screen.getByText('Delete?')).toBeInTheDocument();
		expect(screen.getByRole('button', { name: 'Yes, delete' })).toBeInTheDocument();
		expect(screen.getByRole('button', { name: 'Cancel' })).toBeInTheDocument();
		expect(onconfirm).not.toHaveBeenCalled();
	});

	it('names the ask as a group, so the question is announced with Cancel', async () => {
		render(ConfirmAction, {
			props: { label: 'Delete', ask: 'Delete this task?', onconfirm: vi.fn() }
		});

		await fireEvent.click(ask('Delete'));

		const group = screen.getByRole('group', { name: 'Delete this task?' });
		expect(group).toContainElement(ask('Cancel'));
	});

	it('always gives the trigger, confirm and cancel a test id, derived from the base', async () => {
		render(ConfirmAction, { props: { label: 'Delete', onconfirm: vi.fn() } });

		expect(screen.getByTestId('confirm-action')).toHaveTextContent('Delete');

		await fireEvent.click(ask('Delete'));

		expect(screen.getByTestId('confirm-action-confirm')).toHaveTextContent('Yes, delete');
		expect(screen.getByTestId('confirm-action-cancel')).toHaveTextContent('Cancel');
	});

	it('cancel goes back to the first state', async () => {
		const onconfirm = vi.fn();
		render(ConfirmAction, { props: { label: 'Delete', onconfirm } });

		await fireEvent.click(ask('Delete'));
		await fireEvent.click(ask('Cancel'));

		expect(screen.queryByRole('button', { name: 'Yes, delete' })).toBeNull();
		expect(ask('Delete')).toBeInTheDocument();
		expect(onconfirm).not.toHaveBeenCalled();
	});

	it('confirm calls onconfirm exactly once and closes the confirm state', async () => {
		const onconfirm = vi.fn();
		render(ConfirmAction, { props: { label: 'Delete', onconfirm } });

		await fireEvent.click(ask('Delete'));
		await fireEvent.click(ask('Yes, delete'));

		expect(onconfirm).toHaveBeenCalledTimes(1);
		expect(screen.queryByRole('button', { name: 'Yes, delete' })).toBeNull();
	});

	it('takes the caller’s labels and testid', async () => {
		render(ConfirmAction, {
			props: {
				label: 'Remove',
				confirmLabel: 'Remove them',
				cancelLabel: 'Keep them',
				onconfirm: vi.fn(),
				testid: 'remove-member'
			}
		});

		expect(screen.getByTestId('remove-member')).toHaveTextContent('Remove');
		await fireEvent.click(ask('Remove'));

		expect(screen.getByText('Remove?')).toBeInTheDocument();
		expect(screen.getByTestId('remove-member-confirm')).toHaveTextContent('Remove them');
		expect(screen.getByTestId('remove-member-cancel')).toHaveTextContent('Keep them');
	});

	it('takes a custom ask line, defaulting to the label plus a question mark', async () => {
		const { unmount } = render(ConfirmAction, {
			props: { label: 'Delete', ask: 'Delete this task?', onconfirm: vi.fn() }
		});

		expect(screen.getByRole('button', { name: 'Delete' })).toBeInTheDocument();
		await fireEvent.click(ask('Delete'));
		expect(screen.getByText('Delete this task?')).toBeInTheDocument();
		unmount();

		render(ConfirmAction, { props: { label: 'Delete', onconfirm: vi.fn() } });
		await fireEvent.click(ask('Delete'));
		expect(screen.getByText('Delete?')).toBeInTheDocument();
	});

	it('moves focus to Cancel while asking and back to the trigger afterwards', async () => {
		const onconfirm = vi.fn();
		render(ConfirmAction, { props: { label: 'Delete', onconfirm } });

		await fireEvent.click(ask('Delete'));
		expect(ask('Cancel')).toHaveFocus();

		await fireEvent.click(ask('Cancel'));
		expect(ask('Delete')).toHaveFocus();

		await fireEvent.click(ask('Delete'));
		expect(ask('Cancel')).toHaveFocus();
		await fireEvent.click(ask('Yes, delete'));
		expect(onconfirm).toHaveBeenCalledTimes(1);
		expect(ask('Delete')).toHaveFocus();
	});

	it('disables its first button while the caller is busy', () => {
		render(ConfirmAction, {
			props: { label: 'Delete', onconfirm: vi.fn(), disabled: true }
		});
		expect(screen.getByRole('button', { name: 'Delete' })).toBeDisabled();
	});

	it('offers the row’s trash trigger and the compact Yes/No pair as the icon variant', async () => {
		render(ConfirmAction, {
			props: {
				label: 'Delete task',
				variant: 'icon',
				confirmLabel: 'Yes',
				cancelLabel: 'No',
				onconfirm: vi.fn(),
				testid: 'row-delete'
			}
		});

		// The trigger's only text is the trash icon, so the label is its name.
		const trigger = screen.getByTestId('row-delete');
		expect(trigger).toHaveAccessibleName('Delete task');
		expect(trigger).toHaveClass('rounded-full', 'pointer-fine:opacity-40', 'p-2');
		expect(trigger.querySelector('svg')).not.toBeNull();

		await fireEvent.click(trigger);

		expect(screen.getByText('Delete task?')).toHaveClass(
			'text-xs',
			'font-medium',
			'text-red-600'
		);
		const yes = screen.getByTestId('row-delete-confirm');
		expect(yes).toHaveTextContent('Yes');
		expect(yes).toHaveClass('rounded-full', 'bg-red-600', 'px-3', 'py-1.5', 'text-xs');
		const no = screen.getByTestId('row-delete-cancel');
		expect(no).toHaveTextContent('No');
		expect(no).toHaveClass('rounded-full', 'bg-slate-200', 'px-3', 'py-1.5', 'text-xs');
	});

	it('submits the caller’s action with its hidden fields as the form variant', async () => {
		render(ConfirmAction, {
			props: {
				label: 'Remove',
				variant: 'form',
				formAction: '?/removeMember',
				formFields: { userId: 'u-sam' },
				confirmLabel: 'Yes',
				cancelLabel: 'No',
				onconfirm: vi.fn(),
				testid: 'member-remove'
			}
		});

		const trigger = screen.getByTestId('member-remove');
		expect(trigger).toHaveTextContent('Remove');
		expect(trigger).toHaveClass('h-11', 'border-red-300');

		await fireEvent.click(trigger);

		expect(screen.getByText('Remove?')).toBeInTheDocument();
		const yes = screen.getByTestId('member-remove-confirm');
		const form = yes.closest('form');
		if (!(form instanceof HTMLFormElement)) throw new Error('the confirm button is not in a form');
		expect(form.getAttribute('action')).toBe('?/removeMember');
		expect(form.getAttribute('method')).toBe('POST');
		const hidden = form.querySelector('input[type="hidden"]');
		expect(hidden).toHaveAttribute('name', 'userId');
		expect(hidden).toHaveAttribute('value', 'u-sam');
		expect(yes).toHaveClass('h-11', 'bg-red-600', 'text-sm', 'font-semibold');
		expect(screen.getByTestId('member-remove-cancel')).toHaveClass('h-11', 'bg-slate-200');
	});

	it('keeps the ask open, disabled and labelled while a promised confirm runs', async () => {
		let settle = (): void => {};
		const onconfirm = vi.fn(
			() =>
				new Promise<void>((resolve) => {
					settle = () => resolve();
				})
		);
		render(ConfirmAction, {
			props: {
				label: 'Delete',
				confirmLabel: 'Yes',
				cancelLabel: 'No',
				pendingLabel: 'Deleting…',
				onconfirm
			}
		});

		await fireEvent.click(ask('Delete'));
		await fireEvent.click(ask('Yes'));

		expect(onconfirm).toHaveBeenCalledTimes(1);
		// The ask is still on screen, wearing the pending copy, with nothing clickable.
		expect(screen.getByRole('group', { name: 'Delete?' })).toBeInTheDocument();
		expect(screen.getByRole('button', { name: 'Deleting…' })).toBeDisabled();
		expect(screen.getByRole('button', { name: 'No' })).toBeDisabled();

		settle();
		await vi.waitFor(() => expect(ask('Delete')).toBeInTheDocument());
		expect(screen.queryByRole('group', { name: 'Delete?' })).toBeNull();
	});

	it('cancels on Escape and claims the key, so an enclosing sheet stays open', async () => {
		const onconfirm = vi.fn();
		render(ConfirmAction, { props: { label: 'Delete', onconfirm } });

		await fireEvent.click(ask('Delete'));

		const event = new KeyboardEvent('keydown', {
			key: 'Escape',
			bubbles: true,
			cancelable: true
		});
		ask('Cancel').dispatchEvent(event);

		expect(event.defaultPrevented).toBe(true);
		await flush();
		expect(screen.queryByRole('group')).toBeNull();
		expect(ask('Delete')).toBeInTheDocument();
		expect(onconfirm).not.toHaveBeenCalled();
	});
});
