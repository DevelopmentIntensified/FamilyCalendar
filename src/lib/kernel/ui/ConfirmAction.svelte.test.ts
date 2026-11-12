/**
 * The two-step delete control (folded from eight legacy copies, e.g. the
 * "Delete" → "Delete this task?" + "Yes, delete" / "Cancel" row in
 * TaskDetailBar): the first click only asks, cancel returns, confirm fires
 * exactly once.
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

		expect(screen.getByTestId('remove-member')).toHaveTextContent('Remove?');
		expect(ask('Remove them')).toBeInTheDocument();
		expect(ask('Keep them')).toBeInTheDocument();
	});

	it('disables its first button while the caller is busy', () => {
		render(ConfirmAction, {
			props: { label: 'Delete', onconfirm: vi.fn(), disabled: true }
		});
		expect(screen.getByRole('button', { name: 'Delete' })).toBeDisabled();
	});
});
