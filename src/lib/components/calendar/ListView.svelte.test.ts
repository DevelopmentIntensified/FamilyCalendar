import { render, screen, cleanup } from '@testing-library/svelte';
import { describe, it, expect, afterEach } from 'vitest';
import { DateTime } from 'luxon';
import { writable } from 'svelte/store';
import ListView from './ListView.svelte';
import type { Event } from '$lib/types';

// SAFETY: fixture covers the Event fields ListView reads; auditing columns are
// irrelevant here.
const evt = (over: Partial<Event> = {}): Event =>
	({
		id: 'e1',
		ownerId: 'u1',
		calendarId: 'cal1',
		title: 'Holiday',
		date: '2026-09-09T00:00:00',
		start: '2026-09-09T10:00:00',
		end: '2026-09-09T11:00:00',
		description: null,
		location: null,
		allDay: false,
		recurrenceFrequency: null,
		recurrenceInterval: null,
		recurrenceByDay: null,
		recurrenceCount: null,
		recurrenceUntil: null,
		reminderMinutes: null,
		color: '#0ea5e9',
		created_at: new Date('2026-01-01T00:00:00Z'),
		...over
	}) as Event;

// ListView's prop is a Writable store (it assigns $currentDate); a readable
// would not type-check.
const currentDate = writable(DateTime.fromISO('2026-09-09T12:00:00'));

function renderList(events: Event[]) {
	return render(ListView, { props: { currentDate, events, calendarIds: [], dueTasks: [] } });
}

const mark = (kind: string) => document.querySelector(`[data-chip-mark="${kind}"]`);

afterEach(cleanup);

// #067 — the list is a WORD view. Its amber "Ad" pill was hand-rolled and
// keyed on nothing the vocabulary owns; it now comes from chipWord, so an ad
// reads the same here as in the day list.
describe('ListView names a sponsored event', () => {
	it('shows the word for a TIMED ad — the case the old allDay guard missed', () => {
		renderList([evt({ id: 'ad', title: 'Toy drive', isAd: true })]);
		expect(mark('sponsored')?.querySelector('[data-chip-word]')?.textContent).toBe('Ad');
	});

	it('shows the word for an all-day ad, outranking the all-day word', () => {
		renderList([evt({ id: 'ad', title: 'Toy drive', isAd: true, allDay: true })]);
		expect(mark('sponsored')?.querySelector('[data-chip-word]')?.textContent).toBe('Ad');
		expect(mark('allDay')).toBeNull();
	});

	it('drops the amber pill — the ad is no longer a colour patch', () => {
		const { container } = renderList([evt({ id: 'ad', title: 'Toy drive', isAd: true })]);
		expect(container.innerHTML).not.toMatch(/amber/);
	});

	it('still spells out all-day for a plain all-day event', () => {
		renderList([evt({ allDay: true })]);
		expect(mark('allDay')?.querySelector('[data-chip-word]')?.textContent).toBe('All day');
		expect(screen.queryByText('Ad')).toBeNull();
	});

	it('keeps the clock, and adds no mark, for an ordinary timed event', () => {
		renderList([evt({ title: 'Standup' })]);
		expect(mark('sponsored')).toBeNull();
		expect(screen.queryByText('Ad')).toBeNull();
	});
});
