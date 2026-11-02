import { render, screen, fireEvent, cleanup, waitFor } from '@testing-library/svelte';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { writable } from 'svelte/store';
import { DateTime } from 'luxon';
import type { Event } from '$lib/types';
import EventModal from './EventModal.svelte';
import MonthView from './MonthView.svelte';
import WeekView from './WeekView.svelte';
import DayView from './DayView.svelte';
import ListView from './ListView.svelte';
import Calendar from './Calendar.svelte';
import DayDashboard from '$lib/components/dashboard/DayDashboard.svelte';

// #282: every EventModal caller passed no `familyMembers`, so the edit form's
// AttendantPicker could only show members already invited. Each caller now
// threads the page's one roster through; these pin that per caller by opening
// the event, choosing Edit, and finding an UNINVITED member in the picker.

// oxlint-disable-next-line anti-slop/no-module-mocking -- SvelteKit injects $app/navigation virtually; no DI seam exists.
vi.mock('$app/navigation', () => ({
	invalidateAll: vi.fn(() => Promise.resolve()),
	goto: vi.fn()
}));

const BOB = { userId: 'u-bob', firstName: 'Bob', lastName: 'Jones', email: 'bob@example.com' };
const roster = [BOB];

// SAFETY: fixture covers the Event fields the views and the modal read.
const evt = {
	id: 'e1',
	ownerId: 'u1',
	calendarId: 'cal1',
	title: 'Standup',
	date: '2026-09-08',
	start: '2026-09-08T10:00:00',
	end: '2026-09-08T11:00:00',
	description: null,
	location: null,
	allDay: false,
	recurrenceFrequency: null,
	recurrenceInterval: null,
	recurrenceByDay: null,
	recurrenceCount: null,
	recurrenceUntil: null,
	reminderMinutes: null,
	created_at: new Date('2026-01-01T00:00:00Z')
} as Event;

const calendarIds = [{ id: 'cal1', name: 'My Calendar' }];
const day = () => writable(DateTime.fromISO('2026-09-08T12:00:00'));

beforeEach(() => {
	vi.stubGlobal(
		'fetch',
		vi.fn(async (_url: string, init?: RequestInit) => {
			if (init?.method === 'PUT') return { ok: true, json: async () => ({ success: true }) };
			return {
				ok: true,
				json: async () => ({ attendance: [], userRsvpStatus: 'undecided', tasks: [] })
			};
		})
	);
});

afterEach(() => {
	vi.unstubAllGlobals();
	cleanup();
});

/** From an open detail modal: Edit, then open the attendee picker. */
async function openEditPicker() {
	await fireEvent.click(await screen.findByRole('button', { name: 'Edit event' }));
	const search = await screen.findByPlaceholderText('Search family or type a name...');
	await fireEvent.focus(search);
}

async function expectPickerOffersBob() {
	await openEditPicker();
	expect(await screen.findByRole('button', { name: /Bob\s+Jones/ })).toBeInTheDocument();
}

describe('#282 EventModal callers thread the family roster', () => {
	it('MonthView (via MonthDays)', async () => {
		render(MonthView, {
			props: { currentDate: day(), events: [evt], calendarIds, familyMembers: roster }
		});
		await fireEvent.click(screen.getAllByText('Standup')[0]);
		await expectPickerOffersBob();
	});

	it('WeekView', async () => {
		render(WeekView, {
			props: {
				currentDate: day(),
				events: [evt],
				removeEvent: vi.fn(),
				calendarIds,
				familyMembers: roster
			}
		});
		await fireEvent.click(screen.getByText('Standup'));
		await expectPickerOffersBob();
	});

	it('DayView', async () => {
		render(DayView, {
			props: { currentDate: day(), events: [evt], calendarIds, familyMembers: roster }
		});
		await fireEvent.click(screen.getByText('Standup'));
		await expectPickerOffersBob();
	});

	it('ListView', async () => {
		render(ListView, {
			props: {
				currentDate: day(),
				events: [evt],
				calendarIds,
				dueTasks: [],
				familyMembers: roster
			}
		});
		await fireEvent.click(screen.getByText('Standup'));
		await expectPickerOffersBob();
	});

	it('Calendar hands its roster to the view on screen', async () => {
		render(Calendar, {
			props: {
				currentDate: day(),
				events: [evt],
				removeEvent: vi.fn(),
				calendarIds,
				filterUserId: 'u1',
				initialView: 'week',
				familyMembers: roster
			}
		});
		await fireEvent.click(screen.getByText('Standup'));
		await expectPickerOffersBob();
	});

	it('Day Dashboard', async () => {
		render(DayDashboard, {
			props: {
				dateLabel: 'Tuesday, September 8',
				isToday: true,
				meId: 'u1',
				familyId: 'f1',
				glance: { doneToday: 0, openToday: 0, weekStreak: 0 },
				dayEvents: [
					{
						...evt,
						masterId: null,
						date: '2026-09-08',
						color: '#0ea5e9',
						source: 'own' as const
					}
				],
				top3: [],
				familyTasks: [],
				familyMembers: [{ ...BOB, email: null }],
				kidsSchedule: []
			}
		});
		await fireEvent.click(screen.getByText('Standup'));
		await expectPickerOffersBob();
	});
});

describe('#282 edit form adds an uninvited family member', () => {
	it('saves the picked member as a user invite (isUser true)', async () => {
		render(EventModal, {
			props: { show: true, event: evt, calendars: calendarIds, familyMembers: roster }
		});
		await openEditPicker();
		await fireEvent.click(await screen.findByRole('button', { name: /Bob\s+Jones/ }));
		await fireEvent.submit(document.getElementById('event-form')!);
		await waitFor(() => {
			const put = vi.mocked(fetch).mock.calls.find(([, init]) => init?.method === 'PUT');
			expect(put).toBeDefined();
		});
		const put = vi.mocked(fetch).mock.calls.find(([, init]) => init?.method === 'PUT')!;
		const body = JSON.parse(String(put[1]!.body));
		expect(body.attendees).toEqual(
			expect.arrayContaining([expect.objectContaining({ value: 'u-bob', isUser: true })])
		);
	});
});
