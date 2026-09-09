import { render, screen, fireEvent, cleanup } from '@testing-library/svelte';
import { describe, it, expect, vi, afterEach } from 'vitest';
import EventDeleteConfirm from './EventDeleteConfirm.svelte';

function props(overrides = {}) {
	return {
		isRecurringOccurrence: false,
		attachedTaskCount: 0,
		onDeleteOccurrence: vi.fn(),
		onDeleteSeries: vi.fn(),
		onDeleteSingle: vi.fn(),
		onCancel: vi.fn(),
		...overrides
	};
}

describe('EventDeleteConfirm', () => {
	afterEach(cleanup);

	it('offers occurrence vs series for recurring events', async () => {
		const p = props({ isRecurringOccurrence: true, attachedTaskCount: 2 });
		render(EventDeleteConfirm, { props: p });
		expect(screen.getByText(/2 attached task\(s\)/)).toBeTruthy();
		await fireEvent.click(screen.getByText('This occurrence'));
		expect(p.onDeleteOccurrence).toHaveBeenCalledOnce();
		await fireEvent.click(screen.getByText('Whole series'));
		expect(p.onDeleteSeries).toHaveBeenCalledOnce();
	});

	it('offers a single delete otherwise, plus cancel', async () => {
		const p = props();
		render(EventDeleteConfirm, { props: p });
		await fireEvent.click(screen.getByText(/^Delete$/));
		expect(p.onDeleteSingle).toHaveBeenCalledOnce();
		await fireEvent.click(screen.getByText('Cancel'));
		expect(p.onCancel).toHaveBeenCalledOnce();
	});
});
