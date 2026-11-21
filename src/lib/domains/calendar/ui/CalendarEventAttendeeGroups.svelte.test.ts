/**
 * Who is going: the heading counts, one row per person with its status, the
 * guest label, the collapse above eight people, and the named-guest invite.
 * Rows come from the modal state class so the test exercises the real buckets.
 *
 * Doc: ../../README.md#public-interface
 */
import { describe, expect, it } from 'vitest';
import { afterEach } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/svelte';
import { tick } from 'svelte';
import { memoryToasts } from '$lib/kernel/client/toasts.svelte';
import type { CalendarApi } from '../calendar.api';
import { CalendarEventModalState } from '../calendar.eventModal.state.svelte';
import type { CalendarEventView } from '../calendar.eventView.rules';
import CalendarEventAttendeeGroups from './CalendarEventAttendeeGroups.svelte';

afterEach(cleanup);

const event: CalendarEventView = {
	id: 'master',
	title: 'Dentist',
	start: '2026-02-03T10:00:00.000Z'
};

function makeState(
	attendees: { userId: string | null; status: string; firstName?: string; inviteType?: string | null }[],
	guests: { name: string; status: string }[] = []
) {
	const api = {
		inviteGuest: async () => ({
			ok: true as const,
			data: {
				success: true as const,
				attendance: [
					{
						id: 'a1',
						eventId: 'master',
						userId: null,
						name: 'Nan',
						status: 'invited',
						inviteType: null,
						firstName: null,
						lastName: null
					}
				]
			}
		})
	} as unknown as CalendarApi;
	return new CalendarEventModalState(api, memoryToasts(), 'me', {
		event,
		attendees,
		guests
	});
}

describe('CalendarEventAttendeeGroups (EventAttendeeGroups.svelte)', () => {
	it('counts the going out of everyone asked and draws one row per person', () => {
		const state = makeState(
			[
				{ userId: 'u1', status: 'going', firstName: 'Mira' },
				{ userId: 'u2', status: 'maybe', firstName: 'Sam' }
			],
			[{ name: 'Nan', status: 'invited' }]
		);
		render(CalendarEventAttendeeGroups, { props: { state } });
		expect(screen.getByTestId('attendance-heading').textContent?.trim()).toBe('1/3 going');
		expect(screen.getAllByTestId('attendance-row')).toHaveLength(3);
		expect(screen.getByText('Mira')).toBeTruthy();
		expect(screen.getByText('guest — not a user')).toBeTruthy();
		expect(screen.getByText('Not yet answered')).toBeTruthy();
	});

	it('renders no proportion bar when nobody was asked', () => {
		const state = makeState([]);
		render(CalendarEventAttendeeGroups, { props: { state } });
		expect(screen.queryByTestId('attendance-bar')).toBeNull();
		expect(screen.queryByTestId('attendance-heading')).toBeNull();
	});

	it('collapses above eight people behind "Show all"', async () => {
		const state = makeState(
			Array.from({ length: 9 }, (_, index) => ({
				userId: `u${index}`,
				status: 'going',
				firstName: `Guest${index}`
			}))
		);
		render(CalendarEventAttendeeGroups, { props: { state } });
		const toggle = screen.getByTestId('attendance-toggle');
		expect(toggle.textContent?.trim()).toBe('Show all 9 people');
		expect(screen.queryAllByTestId('attendance-row')).toHaveLength(0);
		await fireEvent.click(toggle);
		expect(screen.getAllByTestId('attendance-row')).toHaveLength(9);
	});

	it('invites a named guest through the state class', async () => {
		const state = makeState([]);
		render(CalendarEventAttendeeGroups, { props: { state } });
		await fireEvent.click(screen.getByRole('button', { name: '+ Invite' }));
		const input = screen.getByLabelText('Guest name') as HTMLInputElement;
		expect((screen.getByRole('button', { name: 'Send invite' }) as HTMLButtonElement).disabled).toBe(
			true
		);
		await fireEvent.input(input, { target: { value: 'Nan' } });
		await fireEvent.click(screen.getByRole('button', { name: 'Send invite' }));
		await tick();
		expect(state.guests).toEqual([{ name: 'Nan', status: 'invited', inviteType: null }]);
	});
});
