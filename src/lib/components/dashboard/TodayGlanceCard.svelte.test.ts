import { describe, it, expect, afterEach } from 'vitest';
import { render, screen, cleanup, within } from '@testing-library/svelte';
import TodayGlanceCard from './TodayGlanceCard.svelte';
import type { GlanceEvent } from './TodayGlanceCard.svelte';

afterEach(() => {
	cleanup();
});

const mark = (kind: string) => document.querySelector(`[data-chip-mark="${kind}"]`);

// SAFETY: fixture covers the GlanceEvent fields TodayGlanceCard renders.
const glance = (over: Partial<GlanceEvent> = {}): GlanceEvent => ({
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

	// 240: a dashboard for another day must open THAT day, not today.
	it('links the empty state to the viewed day when one is given', () => {
		render(TodayGlanceCard, {
			props: {
				dateLabel: 'Thursday, November 5',
				isToday: false,
				dayDate: '2026-11-05',
				onEventClick: () => {},
				events: []
			}
		});
		expect(screen.getByRole('link', { name: /open day view/i })).toHaveAttribute(
			'href',
			'/calendar?date=2026-11-05&view=day'
		);
	});
});

// #067 — the glance card is a WORD view, but it hand-rolled a colour dot and a
// literal "All day", so it never joined the vocabulary: an ad on the Day
// Dashboard was indistinguishable from a family event. `GlanceEvent` now
// carries `isAd`, so the card names one the same way every other view does.
describe('TodayGlanceCard names a sponsored event', () => {
	const renderCard = (events: GlanceEvent[]) =>
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

// #314 — the owner's screenshot: every glance event stacked time / title /
// badges over two or three lines. A row is ONE line now: a nowrap flex row
// where only the title shrinks (and truncates), the start and end times share
// the one time cell, and the old `block` second line is gone.
describe('TodayGlanceCard — every event is one line (314)', () => {
	const renderCard = (events: GlanceEvent[]) =>
		render(TodayGlanceCard, {
			props: { dateLabel: 'Thursday, September 3', isToday: true, onEventClick: () => {}, events }
		});

	/**
	 * The row a title was rendered into. `closest` is the row the markup
	 * declares; the cast only satisfies test code, never the component.
	 */
	const rowFor = (title: string): HTMLElement => {
		const row = screen.getByText(title).closest('[data-testid="glance-event-row"]');
		expect(row).not.toBeNull();
		// SAFETY: the markup nests every title inside the row button above.
		return row as HTMLElement;
	};

	it('renders one nowrap row per event', () => {
		renderCard([
			glance({ id: 'a', title: 'Standup' }),
			glance({ id: 'b', title: 'Piano', source: 'family', rsvpStatus: 'going' })
		]);
		const rows = screen.getAllByTestId('glance-event-row');
		expect(rows).toHaveLength(2);
		for (const row of rows) {
			expect(row.className).toContain('flex-nowrap');
			expect(row.className).toContain('whitespace-nowrap');
			expect(row.className).toContain('overflow-hidden');
			// Any of these would let the row become two lines tall.
			expect(row.className).not.toContain('flex-wrap');
			expect(row.querySelector('.block')).toBeNull();
			expect(row.querySelector('.flex-col')).toBeNull();
		}
	});

	it('puts time, mark, title, family and RSVP in the same row', () => {
		renderCard([glance({ title: 'Piano', source: 'family', rsvpStatus: 'going' })]);
		const row = rowFor('Piano');
		expect(within(row).getByTestId('glance-event-time')).toBeInTheDocument();
		expect(row.querySelector('[data-chip-mark="timed"]')).not.toBeNull();
		expect(within(row).getByTestId('glance-event-title')).toBeInTheDocument();
		expect(within(row).getByText('Family')).toBeInTheDocument();
		expect(within(row).getByText(/Going/)).toBeInTheDocument();
	});

	it('keeps start and end on the time cell’s single line', () => {
		renderCard([glance({ end: '2026-09-03T10:30:00' })]);
		const time = within(rowFor('Standup')).getByTestId('glance-event-time');
		// One text run, one inline end-time span — never a stacked `block`.
		expect(time.querySelector('div, .block')).toBeNull();
		expect(time.children).toHaveLength(1);
		expect(time.textContent?.replace(/\s+/g, ' ').trim()).toMatch(/–/);
	});

	it('lets only the title shrink, so a long title ellipsizes instead of wrapping', () => {
		const title = 'A very long event title that must never wrap onto a second line';
		renderCard([glance({ title })]);
		const row = rowFor(title);
		const titleEl = within(row).getByTestId('glance-event-title');
		expect(titleEl.className).toContain('truncate');
		expect(titleEl.className).toContain('min-w-0');
		expect(titleEl.className).toContain('flex-1');
		// The time cell is fixed: it may not shrink into the title's space.
		expect(within(row).getByTestId('glance-event-time').className).toContain('shrink-0');
	});

	it('keeps all-day rows on one line too, with the mark saying "All day"', () => {
		renderCard([glance({ id: 'hol', title: 'Holiday', allDay: true })]);
		const row = rowFor('Holiday');
		expect(row.className).toContain('flex-nowrap');
		expect(row.querySelector('.block')).toBeNull();
		// No clock cell for an all-day event; the kind mark carries the word.
		expect(within(row).queryByTestId('glance-event-time')).toBeNull();
		expect(row.querySelector('[data-chip-word]')?.textContent).toBe('All day');
	});
});
