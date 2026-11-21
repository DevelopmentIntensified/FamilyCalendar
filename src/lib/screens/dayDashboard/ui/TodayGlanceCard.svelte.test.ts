/**
 * Day at a Glance: the viewed-day link, the one-line rows and the RSVP/Family
 * marks. Props only; no fetch, no router.
 *
 * Doc: ../README.md#invariants
 */
import { describe, expect, it, afterEach } from 'vitest';
import { cleanup, render, screen } from '@testing-library/svelte';
import TodayGlanceCard from './TodayGlanceCard.svelte';
import type { DashboardDayEventRow } from '../dayDashboard.contract';

afterEach(cleanup);

function event(overrides: Partial<DashboardDayEventRow> = {}): DashboardDayEventRow {
	return {
		id: 'event-dentist~2026-11-02T09:00:00.000Z',
		masterId: 'event-dentist',
		calendarId: 'cal-own',
		ownerId: 'user-me',
		title: 'Dentist',
		description: null,
		location: 'Clinic',
		allDay: false,
		start: '2026-11-02T09:00:00.000Z',
		end: '2026-11-02T10:00:00.000Z',
		occurrenceDate: '2026-11-02T09:00:00.000Z',
		date: '2026-11-02T09:00:00.000Z',
		recurrenceFrequency: null,
		recurrenceInterval: null,
		recurrenceByDay: null,
		recurrenceCount: null,
		recurrenceUntil: null,
		reminderMinutes: null,
		mirrorOf: null,
		created_at: '2026-10-01T00:00:00.000Z',
		color: '#fa8072',
		source: 'own',
		...overrides
	};
}

describe('TodayGlanceCard', () => {
	it('points the empty-day card at the VIEWED day, not at today', () => {
		render(TodayGlanceCard, {
			props: { dateLabel: 'Sunday, November 2', isToday: false, dayDate: '2026-11-02', events: [], onEventClick: () => {} }
		});
		expect(screen.getByText('No events scheduled on this day')).toBeTruthy();
		expect(screen.getByRole('link', { name: 'Open day view →' })).toHaveAttribute(
			'href',
			'/calendar?date=2026-11-02&view=day'
		);
	});

	it('uses the today copy and titles the card by the viewed day', () => {
		render(TodayGlanceCard, {
			props: { dateLabel: 'Sunday, November 2', isToday: true, dayDate: '2026-11-02', events: [], onEventClick: () => {} }
		});
		expect(screen.getByText('Today at a Glance')).toBeTruthy();
		expect(screen.getByText('No events scheduled today')).toBeTruthy();
	});

	it('draws every event as one single-line row, all-day rows first', () => {
		render(TodayGlanceCard, {
			props: {
				dateLabel: 'Sunday, November 2',
				isToday: false,
				dayDate: '2026-11-02',
				events: [
					event(),
					event({ id: 'all-day', title: 'Camping', allDay: true, start: '2026-11-02T00:00:00.000Z', end: null })
				],
				onEventClick: () => {}
			}
		});
		const rows = screen.getAllByTestId('glance-event-row');
		expect(rows.map((row) => row.getAttribute('data-row-shape'))).toEqual([
			'single-line',
			'single-line'
		]);
		expect(rows[0]?.textContent).toContain('Camping');
		expect(rows[1]?.textContent).toContain('Dentist');
		expect(rows[1]?.getAttribute('title')).toBe('Dentist · Clinic');
	});

	it('marks a family event and the viewer RSVP', () => {
		render(TodayGlanceCard, {
			props: {
				dateLabel: 'Sunday, November 2',
				isToday: false,
				dayDate: '2026-11-02',
				events: [event({ title: 'Soccer', source: 'family', rsvpStatus: 'going' })],
				onEventClick: () => {}
			}
		});
		expect(screen.getByText('Family')).toBeTruthy();
		expect(screen.getByText('✓ Going')).toBeTruthy();
	});
});
