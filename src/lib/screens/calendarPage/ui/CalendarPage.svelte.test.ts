/**
 * The screen's first paint: the streamed grid the page load hands in is the
 * one thing the card waits for. The ready element the pages harness watches
 * (`[data-testid="calendar-card"]`) must appear as soon as that promise
 * settles — a pending promise shows the skeleton, a settled one the card.
 *
 * Doc: ../README.md#public-interface
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/svelte';
import type {
	CalendarPageEventRow,
	CalendarPageGrid,
	CalendarPageModel
} from '../calendarPage.contract';
import CalendarPage from './CalendarPage.svelte';

afterEach(cleanup);

function eventRow(overrides: Partial<CalendarPageEventRow> = {}): CalendarPageEventRow {
	return {
		id: 'evt-1',
		masterId: null,
		occurrenceDate: null,
		title: 'Piano',
		description: null,
		location: null,
		date: '2026-03-10',
		start: '2026-03-10T10:00:00.000Z',
		end: '2026-03-10T11:00:00.000Z',
		allDay: false,
		calendarId: 'personal',
		ownerId: 'me',
		creatorName: null,
		rsvpStatus: null,
		attendance: null,
		recurrenceFrequency: null,
		...overrides
	};
}

function model(grid: Promise<CalendarPageGrid>): CalendarPageModel {
	return {
		shell: {
			viewerId: 'me',
			today: '2026-03-10',
			zone: 'UTC',
			weekStart: 'sunday',
			settings: {
				weekStart: 'sunday',
				defaultView: 'monthView',
				timeZone: 'UTC',
				color: null,
				showAdsAsEvents: false,
				defaultCalendarId: null,
				autoParseEventDetails: null,
				useCloudAI: null
			},
			calendars: [{ id: 'personal', name: 'Personal Calendar', color: '#fa8072', kind: 'personal' }],
			roster: [{ userId: 'me', firstName: 'Mia', lastName: 'R' }],
			seeds: { date: null, view: null, edit: null, create: null },
			warnings: []
		},
		grid
	};
}

const emptyGrid: CalendarPageGrid = { events: [], tasks: [], ads: [], warnings: [] };

describe('CalendarPage first paint', () => {
	it('shows the skeleton until the streamed grid lands, then the card', async () => {
		const { promise, resolve } = Promise.withResolvers<CalendarPageGrid>();
		render(CalendarPage, {
			props: { model: model(promise), oninvalidate: async () => {} }
		});

		// The grid is still in flight: the skeleton stands in, with no card yet.
		expect(screen.queryByTestId('calendar-card')).toBeNull();

		resolve({ ...emptyGrid, events: [eventRow()] });

		expect(await screen.findByTestId('calendar-card')).toBeTruthy();
		expect(await screen.findByText('Piano')).toBeTruthy();
	});

	it('shows the retry alert when the streamed grid rejects', async () => {
		render(CalendarPage, {
			props: {
				model: model(Promise.reject(new Error('events'))),
				oninvalidate: vi.fn(async () => {})
			}
		});

		expect(await screen.findByText("Couldn't load your events.")).toBeTruthy();
	});
});
