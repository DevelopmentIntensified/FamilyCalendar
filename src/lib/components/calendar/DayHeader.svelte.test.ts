import { render, screen, fireEvent, cleanup } from '@testing-library/svelte';
import { describe, it, expect, vi, afterEach } from 'vitest';
import { DateTime } from 'luxon';
import DayHeader from './DayHeader.svelte';

describe('DayHeader', () => {
	afterEach(cleanup);

	it('renders the date and fires back', async () => {
		const onBack = vi.fn();
		render(DayHeader, {
			props: { selectedDate: DateTime.fromISO('2026-09-09T12:00:00'), today: DateTime.now(), onBack }
		});
		expect(screen.getByText('Wednesday, September 9')).toBeInTheDocument();
		await fireEvent.click(screen.getByLabelText('Back'));
		expect(onBack).toHaveBeenCalledOnce();
	});

	it('badges today', () => {
		const today = DateTime.fromISO('2026-09-09T12:00:00');
		render(DayHeader, { props: { selectedDate: today, today, onBack: vi.fn() } });
		expect(screen.getByText('Today')).toBeInTheDocument();
	});
});
