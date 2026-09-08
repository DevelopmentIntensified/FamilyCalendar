import { render, screen, fireEvent, cleanup } from '@testing-library/svelte';
import { describe, it, expect, vi, afterEach } from 'vitest';
import CalendarToolbar from './CalendarToolbar.svelte';

function props(overrides = {}) {
	return {
		currentMonthYear: 'September 2026',
		currentYear: 2026,
		currentMonth: 9,
		months: ['January', 'February', 'March', 'April', 'May', 'June'],
		view: 'month',
		selectionMode: false,
		dashboardDate: '2026-09-08',
		onToday: vi.fn(),
		onPrevious: vi.fn(),
		onNext: vi.fn(),
		onMonthSelect: vi.fn(),
		onYearSelect: vi.fn(),
		onViewChange: vi.fn(),
		onToggleSelectionMode: vi.fn(),
		...overrides
	};
}

describe('CalendarToolbar', () => {
	afterEach(cleanup);

	it('fires nav callbacks', async () => {
		const p = props();
		render(CalendarToolbar, { props: p });
		await fireEvent.click(screen.getByText('Today'));
		expect(p.onToday).toHaveBeenCalledOnce();
		await fireEvent.click(screen.getByLabelText('Previous'));
		expect(p.onPrevious).toHaveBeenCalledOnce();
		await fireEvent.click(screen.getByLabelText('Next'));
		expect(p.onNext).toHaveBeenCalledOnce();
	});

	it('fires onViewChange when a view button is clicked', async () => {
		const p = props();
		render(CalendarToolbar, { props: p });
		await fireEvent.click(screen.getByText('Week'));
		expect(p.onViewChange).toHaveBeenCalledWith('week');
	});

	it('opens the mini picker and fires onMonthSelect', async () => {
		const p = props();
		render(CalendarToolbar, { props: p });
		await fireEvent.click(screen.getByText('September 2026'));
		await fireEvent.click(screen.getByText('Mar'));
		expect(p.onMonthSelect).toHaveBeenCalledWith(3);
	});

	it('toggles selection mode with pressed state', async () => {
		const p = props();
		render(CalendarToolbar, { props: p });
		const btn = screen.getByTitle('Select events to edit in bulk');
		expect(btn.getAttribute('aria-pressed')).toBe('false');
		await fireEvent.click(btn);
		expect(p.onToggleSelectionMode).toHaveBeenCalledWith(true);
	});
});
