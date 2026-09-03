import { describe, it, expect, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/svelte';
import TodayGlanceCard from './TodayGlanceCard.svelte';

afterEach(() => {
	cleanup();
});

describe('TodayGlanceCard all-day-only days', () => {
	it('does not claim "no events" when all-day events exist', () => {
		render(TodayGlanceCard, {
			props: {
				dateLabel: 'Thursday, September 3',
				isToday: true,
				onEventClick: () => {},
				events: [
					{
						id: 'e1',
						masterId: null,
						title: 'Holiday',
						description: null,
						start: '2026-09-03',
						end: null,
						date: new Date(2026, 8, 3),
						allDay: true,
						location: null,
						calendarId: null,
						color: '#fa8072',
						source: 'own'
					}
				]
			}
		});
		expect(screen.getByText('Holiday')).toBeInTheDocument();
		expect(screen.queryByText(/No events scheduled/)).toBeNull();
	});
});
