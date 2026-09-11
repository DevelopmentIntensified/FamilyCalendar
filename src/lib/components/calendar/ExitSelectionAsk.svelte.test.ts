import { render, screen, fireEvent, cleanup } from '@testing-library/svelte';
import { describe, it, expect, vi, afterEach } from 'vitest';
import ExitSelectionAsk from './ExitSelectionAsk.svelte';

describe('ExitSelectionAsk', () => {
	afterEach(cleanup);

	it('renders nothing when closed', () => {
		render(ExitSelectionAsk, { props: { open: false, onExit: vi.fn(), onStay: vi.fn() } });
		expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
	});

	it('fires onExit and onStay', async () => {
		const props = { open: true, onExit: vi.fn(), onStay: vi.fn() };
		render(ExitSelectionAsk, { props });
		await fireEvent.click(screen.getByText('Exit selection'));
		expect(props.onExit).toHaveBeenCalledOnce();
		await fireEvent.click(screen.getByText('Stay'));
		expect(props.onStay).toHaveBeenCalledOnce();
	});
});
