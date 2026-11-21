/**
 * The danger card as the reader sees it: the export button starts the export
 * and shows its pending word, and deleting is a two-step confirm — the red
 * form appears only on "Delete Account" and Cancel puts the button back.
 *
 * Doc: ./README.md#invariants
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/svelte';
import AccountDangerSection from './AccountDangerSection.svelte';

afterEach(cleanup);

const enhance = () => ({ destroy() {} });

describe('AccountDangerSection', () => {
	it('reveals the typed-id form on Delete Account and returns on Cancel', async () => {
		render(AccountDangerSection, {
			props: {
				model: { section: 'danger' as const, userId: 'user-1' },
				exporting: false,
				onExport: () => {},
				enhance
			}
		});

		expect(screen.queryByLabelText('Confirmation')).not.toBeInTheDocument();

		await fireEvent.click(screen.getByRole('button', { name: 'Delete Account' }));
		const confirmation = screen.getByLabelText('Confirmation');
		expect(confirmation).toHaveAttribute('placeholder', 'Enter your user ID to confirm');
		expect(screen.getByText('user-1')).toBeInTheDocument();
		expect(screen.getByRole('button', { name: 'Confirm Deletion' })).toBeInTheDocument();

		await fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
		expect(screen.queryByLabelText('Confirmation')).not.toBeInTheDocument();
		expect(screen.getByRole('button', { name: 'Delete Account' })).toBeInTheDocument();
	});

	it('starts the export on press and says it is preparing while pending', async () => {
		const onExport = vi.fn();
		const { rerender } = render(AccountDangerSection, {
			props: {
				model: { section: 'danger' as const, userId: 'user-1' },
				exporting: false,
				onExport,
				enhance
			}
		});

		await fireEvent.click(screen.getByRole('button', { name: 'Export your data' }));
		expect(onExport).toHaveBeenCalledOnce();

		await rerender({
			model: { section: 'danger' as const, userId: 'user-1' },
			exporting: true,
			onExport,
			enhance
		});
		expect(screen.getByRole('button', { name: 'Preparing…' })).toBeDisabled();
	});
});
