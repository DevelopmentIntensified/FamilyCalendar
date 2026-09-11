import { render, screen, fireEvent, cleanup } from '@testing-library/svelte';
import { describe, it, expect, vi, afterEach } from 'vitest';
import { DateTime } from 'luxon';
import WeekHeader from './WeekHeader.svelte';

const MONDAY = DateTime.fromISO('2026-09-07T12:00:00');
const weekDays = Array.from({ length: 7 }, (_, i) => MONDAY.plus({ days: i }));

describe('WeekHeader', () => {
	afterEach(cleanup);

	it('renders all seven day buttons and opens the clicked day', async () => {
		const openDay = vi.fn();
		render(WeekHeader, { props: { weekDays, isToday: () => false, openDay } });
		expect(screen.getByLabelText('Open Monday, September 7')).toBeInTheDocument();
		expect(screen.getByLabelText('Open Sunday, September 13')).toBeInTheDocument();
		await fireEvent.click(screen.getByLabelText('Open Wednesday, September 9'));
		expect(openDay).toHaveBeenCalledOnce();
		expect(openDay.mock.calls[0][0].toISODate()).toBe('2026-09-09');
	});

	it('highlights today', () => {
		render(WeekHeader, {
			props: { weekDays, isToday: (d: DateTime) => d.weekday === 3, openDay: vi.fn() }
		});
		expect(screen.getByLabelText('Open Wednesday, September 9').className).toContain(
			'hover:bg-slate-100'
		);
		expect(screen.getByText('9')).toBeInTheDocument();
	});
});
