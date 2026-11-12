/**
 * Renders the K-07 toast list (shared shape `ToastItem`) with the legacy card
 * look and a dismiss button that hands the id back to the page's state class.
 *
 * Doc: src/lib/kernel/README.md
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, cleanup, fireEvent } from '@testing-library/svelte';
import Toaster from './Toaster.svelte';

afterEach(cleanup);

const items = [
	{ id: 1, kind: 'success' as const, text: 'Task saved.' },
	{ id: 7, kind: 'error' as const, text: 'Could not save the task.' }
];

describe('Toaster', () => {
	it('mounts the polite live region even with nothing to say', () => {
		render(Toaster, { props: { items: [], ondismiss: vi.fn() } });
		const region = screen.getByRole('region', { name: 'Notifications' });
		expect(region).toHaveAttribute('aria-live', 'polite');
		expect(region.children).toHaveLength(0);
	});

	it('lists every item in one polite live region', () => {
		render(Toaster, { props: { items, ondismiss: vi.fn() } });

		const region = screen.getByRole('region', { name: 'Notifications' });
		expect(region).toHaveAttribute('aria-live', 'polite');
		expect(screen.getByText('Task saved.')).toBeInTheDocument();
		expect(screen.getByText('Could not save the task.')).toBeInTheDocument();
	});

	it('dismisses the item that was clicked, by id', async () => {
		const ondismiss = vi.fn();
		render(Toaster, { props: { items, ondismiss } });

		const dismissButtons = screen.getAllByRole('button', { name: 'Dismiss notification' });
		expect(dismissButtons).toHaveLength(2);

		await fireEvent.click(dismissButtons[1]);
		expect(ondismiss).toHaveBeenCalledTimes(1);
		expect(ondismiss).toHaveBeenCalledWith(7);
	});
});
