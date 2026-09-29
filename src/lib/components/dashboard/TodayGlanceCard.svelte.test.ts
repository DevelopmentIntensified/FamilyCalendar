import { describe, it, expect, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/svelte';
import TodayGlanceCard from './TodayGlanceCard.svelte';

afterEach(() => {
	cleanup();
});

const mark = (kind: string) => document.querySelector(`[data-chip-mark="${kind}"]`);

// SAFETY: fixture covers the GlanceEvent fields TodayGlanceCard renders.
const glance = (over: Record<string, unknown> = {}) => ({
	id: 'e1',
	masterId: null,
	title: 'Standup',
	description: null,
	start: '2026-09-03T10:00:00',
	end: null,
	date: new Date(2026, 8, 3),
	allDay: false,
	location: null,
	calendarId: null,
	color: '#0ea5e9',
	source: 'own' as const,
	...over
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

	it('links the empty state to the day view', () => {
		render(TodayGlanceCard, {
			props: {
				dateLabel: 'Thursday, September 3',
				isToday: true,
				onEventClick: () => {},
				events: []
			}
		});
		expect(screen.getByText('No events scheduled today')).toBeInTheDocument();
		expect(screen.getByRole('link', { name: /open day view/i })).toHaveAttribute(
			'href',
			'/calendar?view=day'
		);
	});
});

// #067 — the glance card is a WORD view, but it hand-rolled a colour dot and a
// literal "All day", so it never joined the vocabulary: an ad on the Day
// Dashboard was indistinguishable from a family event. `GlanceEvent` now
// carries `isAd`, so the card names one the same way every other view does.
describe('TodayGlanceCard names a sponsored event', () => {
	const renderCard = (events: unknown[]) =>
		render(TodayGlanceCard, {
			props: { dateLabel: 'Thursday, September 3', isToday: true, onEventClick: () => {}, events }
		});

	it('shows the word for a TIMED ad', () => {
		renderCard([glance({ id: 'ad', title: 'Toy drive', isAd: true })]);
		expect(mark('sponsored')?.querySelector('[data-chip-word]')?.textContent).toBe('Ad');
	});

	it('shows the word for an all-day ad, outranking the all-day word', () => {
		renderCard([glance({ id: 'ad', title: 'Toy drive', isAd: true, allDay: true })]);
		expect(mark('sponsored')?.querySelector('[data-chip-word]')?.textContent).toBe('Ad');
		expect(mark('allDay')).toBeNull();
		// The old hand-rolled "All day" must not survive as a second word.
		expect(screen.queryByText('All day')).toBeNull();
	});

	it('takes "All day" from the vocabulary, not a literal', () => {
		renderCard([glance({ allDay: true })]);
		expect(mark('allDay')?.querySelector('[data-chip-word]')?.textContent).toBe('All day');
		expect(screen.queryByText('Ad')).toBeNull();
	});

	it('leaves an ordinary timed event with a bare dot and no ad wording', () => {
		renderCard([glance({ title: 'Standup' })]);
		expect(mark('timed')).toBeTruthy();
		expect(mark('timed')?.querySelector('[data-chip-word]')).toBeNull();
		expect(screen.queryByText('Ad')).toBeNull();
	});
});
