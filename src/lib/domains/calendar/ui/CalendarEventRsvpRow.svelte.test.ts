/**
 * Your RSVP: the active answer paints, the API receives the next answer, and
 * clicking the active one again clears to `undecided` ("tap again to clear").
 * The counts move with the loaded rows.
 *
 * Doc: ../../README.md#public-interface
 */
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/svelte';
import { memoryToasts } from '$lib/kernel/client/toasts.svelte';
import type { CalendarApi } from '../calendar.api';
import { CalendarEventModalState } from '../calendar.eventModal.state.svelte';
import type { CalendarEventView } from '../calendar.eventView.rules';
import CalendarEventRsvpRow from './CalendarEventRsvpRow.svelte';

afterEach(cleanup);

const event: CalendarEventView = { id: 'master', title: 'Dentist', start: '2026-02-03T10:00:00.000Z' };

function makeState(status: string, calls: string[]) {
	const api = {
		setRsvp: async (_id: string, next: string) => {
			calls.push(next);
			return {
				ok: true as const,
				data: {
					success: true as const,
					rsvpStatus: [],
					attendance: [
						{
							id: 'a1',
							eventId: 'master',
							userId: 'me',
							name: null,
							status: next,
							inviteType: null,
							firstName: null,
							lastName: null
						}
					]
				}
			};
		}
	} as unknown as CalendarApi;
	return new CalendarEventModalState(api, memoryToasts(), 'me', {
		event,
		attendees: [
			{ userId: 'me', status },
			{ userId: 'u2', status: 'going' }
		],
		userRsvpStatus: status
	});
}

describe('CalendarEventRsvpRow (EventRsvpRow.svelte)', () => {
	it('paints the current answer and its counts', () => {
		const state = makeState('going', []);
		render(CalendarEventRsvpRow, { props: { state } });
		expect(screen.getByTestId('rsvp-going').getAttribute('aria-pressed')).toBe('true');
		expect(screen.getByTestId('rsvp-going').textContent).toContain('2');
		expect(screen.getByText('tap again to clear')).toBeTruthy();
	});

	it('sends the chosen answer to the API', async () => {
		const calls: string[] = [];
		const state = makeState('undecided', calls);
		render(CalendarEventRsvpRow, { props: { state } });
		await fireEvent.click(screen.getByTestId('rsvp-maybe'));
		await Promise.resolve();
		expect(calls).toEqual(['maybe']);
		expect(state.userRsvpStatus).toBe('maybe');
	});

	it('clears to undecided when the active answer is clicked again', async () => {
		const calls: string[] = [];
		const state = makeState('maybe', calls);
		render(CalendarEventRsvpRow, { props: { state } });
		await fireEvent.click(screen.getByTestId('rsvp-maybe'));
		await Promise.resolve();
		expect(calls).toEqual(['undecided']);
	});
});
