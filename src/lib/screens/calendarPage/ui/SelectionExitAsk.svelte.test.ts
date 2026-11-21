/**
 * The inline ask a drag raises in Selection mode: Exit selection versus Stay.
 *
 * Doc: ../README.md#selection-bulk-edit-and-the-modals
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/svelte';
import SelectionExitAsk from './SelectionExitAsk.svelte';

afterEach(cleanup);

describe('SelectionExitAsk', () => {
	it('fires onExit and onStay', async () => {
		const onexit = vi.fn();
		const onstay = vi.fn();
		render(SelectionExitAsk, { props: { open: true, onexit, onstay } });

		screen.getByRole('button', { name: 'Exit selection' }).click();
		screen.getByRole('button', { name: 'Stay' }).click();

		expect(onexit).toHaveBeenCalledTimes(1);
		expect(onstay).toHaveBeenCalledTimes(1);
	});

	it('renders nothing while closed', () => {
		render(SelectionExitAsk, { props: { open: false, onexit: () => {}, onstay: () => {} } });
		expect(screen.queryByRole('alertdialog')).toBe(null);
	});
});
