/**
 * The two-step delete control (folded from five legacy copies: TaskDetailBar's
 * "Delete" → ask → "Yes, delete" / "Cancel" row, and the family page's
 * "Remove?" → "Yes" / "No" member row, where the ask line is the caller's own
 * copy such as "Delete this task?"): the first click only asks, cancel
 * returns, confirm fires exactly once, and focus follows the ask.
 *
 * Doc: src/lib/kernel/README.md
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, cleanup, fireEvent } from '@testing-library/svelte';
import ConfirmAction from './ConfirmAction.svelte';

afterEach(cleanup);

const ask = (label: string) => screen.getByRole('button', { name: label });

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
});
