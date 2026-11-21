/**
 * The detail region's state class in node: the RSVP paint/rollback/clear rules,
 * the raw-row answer read back from the viewer's own row (Q-046), the guest
 * invite, the double-tap DELETE guard (issue 015) and the duplicate payload.
 *
 * Doc: ./README.md#invariants
 */
import { describe, expect, it } from 'vitest';
import { memoryToasts } from '$lib/kernel/client/toasts.svelte';
import type { CalendarApi } from './calendar.api';
import type { CalendarEventBody } from './calendar.eventForm.rules';
import { CalendarEventModalState } from './calendar.eventModal.state.svelte';
import type { CalendarEventModalInit } from './calendar.eventModal.state.svelte';
import type { CalendarEventView } from './calendar.eventView.rules';

const event: CalendarEventView = {
	id: 'master~2026-02-03T10:00:00.000Z',
	masterId: 'master',
	occurrenceDate: '2026-02-03T10:00:00.000Z',
	title: 'Dentist',
	start: '2026-02-03T10:00:00.000Z',
	end: '2026-02-03T11:00:00.000Z',
	calendarId: 'cal-1',
	recurrenceFrequency: 'weekly'
};

interface Calls {
	delete: { id: string; scope: { scope: 'this' | 'all'; occurrenceDate?: string | null } }[];
	rsvp: { id: string; status: string }[];
	guests: { id: string; guest: string }[];
	create: CalendarEventBody[];
}

function fakeApi(overrides: Partial<CalendarApi> = {}): { api: CalendarApi; calls: Calls } {
	const calls: Calls = { delete: [], rsvp: [], guests: [], create: [] };
	const api = {
		deleteEvent: async (id: string, scope: { scope: 'this' | 'all' }) => {
			calls.delete.push({ id, scope });
			return { ok: true as const, data: { success: true as const } };
		},
		setRsvp: async (id: string, status: string) => {
			calls.rsvp.push({ id, status });
			return {
				ok: true as const,
				data: {
					success: true as const,
					rsvpStatus: [],
					attendance: [
						{
							id: 'a1',
							eventId: id,
							userId: 'me',
							name: null,
							status,
							inviteType: 'required',
							firstName: 'Me',
							lastName: 'K'
						}
					]
				}
			};
		},
		inviteGuest: async (id: string, guest: string) => {
			calls.guests.push({ id, guest });
			return { ok: true as const, data: { success: true as const, attendance: [] } };
		},
		createEvent: async (body: unknown) => {
			calls.create.push(body);
			return { ok: true as const, data: { success: true as const, event: { id: 'copy' } } };
		},
		...overrides
	} as unknown as CalendarApi;
	return { api, calls };
}

function makeState(api: CalendarApi, init: Partial<CalendarEventModalInit> = {}) {
	return new CalendarEventModalState(api, memoryToasts(), 'me', {
		event,
		attendees: [{ userId: 'me', status: 'undecided' }],
		...init
	});
}

describe('CalendarEventModalState (EventModal.svelte)', () => {
	it('derives the series id, the scopes and the attendance buckets', () => {
		const { api } = fakeApi();
		const state = makeState(api, {
			attendees: [
				{ userId: 'me', status: 'going' },
				{ userId: 'u2', status: 'maybe' },
				{ userId: 'u3', status: 'declined' }
			],
			guests: [{ name: 'Nan', status: 'invited' }]
		});
		expect(state.serverId).toBe('master');
		expect(state.scopes).toEqual(['this', 'all']);
		expect(state.split.going).toHaveLength(1);
		expect(state.people.map((person) => person.name)).toEqual(['me', 'u2', 'u3', 'Nan']);
		expect(state.guests).toEqual([{ name: 'Nan', status: 'invited', inviteType: null }]);
	});

	it('paints an answer immediately and reads the status back from the viewer’s row', async () => {
		const { api, calls } = fakeApi();
		const state = makeState(api);
		const pending = state.rsvp('going');
		expect(state.userRsvpStatus).toBe('going');
		expect(state.rsvpPending).toBe(true);
		expect(await pending).toBe(true);
		expect(calls.rsvp).toEqual([{ id: 'master', status: 'going' }]);
		expect(state.userRsvpStatus).toBe('going');
		expect(state.attendees).toEqual([
			{
				id: 'a1',
				eventId: 'master',
				userId: 'me',
				name: null,
				status: 'going',
				inviteType: 'required',
				firstName: 'Me',
				lastName: 'K'
			}
		]);
	});

	it('clears to undecided when the active answer is clicked again', async () => {
		const { api, calls } = fakeApi();
		const state = makeState(api, { userRsvpStatus: 'maybe' });
		await state.rsvp('maybe');
		expect(calls.rsvp[0].status).toBe('undecided');
	});

	it('rolls back and toasts when the answer is refused (#227)', async () => {
		const toasts = memoryToasts();
		const { api } = fakeApi({
			setRsvp: async () => ({ ok: false as const, status: 500, error: 'boom' })
		});
		const state = new CalendarEventModalState(api, toasts, 'me', {
			event,
			attendees: [],
			userRsvpStatus: 'maybe'
		});
		expect(await state.rsvp('going')).toBe(false);
		expect(state.userRsvpStatus).toBe('maybe');
		expect(toasts.items).toEqual([
			{ kind: 'error', text: "Couldn't save your RSVP — try again." }
		]);
	});

	it('applies the attendance read to rows and guests', async () => {
		const { api } = fakeApi({
			getRsvp: async () => ({
				ok: true as const,
				data: {
					attendance: [
						{
							id: 'a1',
							eventId: 'master',
							userId: 'me',
							name: null,
							status: 'going',
							inviteType: null,
							firstName: 'Me',
							lastName: 'K'
						},
						{
							id: 'a2',
							eventId: 'master',
							userId: null,
							name: 'Nan',
							status: 'declined',
							inviteType: null,
							firstName: null,
							lastName: null
						}
					],
					userRsvpStatus: 'going',
					nonUserAttendants: ['Nan']
				}
			})
		});
		const state = makeState(api, { attendees: [] });
		await state.refreshAttendance();
		expect(state.userRsvpStatus).toBe('going');
		expect(state.attendees.map((row) => row.userId)).toEqual(['me']);
		expect(state.guests).toEqual([{ name: 'Nan', status: 'declined' }]);
		expect(state.attendeesLoaded).toBe(true);
	});

	it('invites a guest and reports the server’s refusal', async () => {
		const { api, calls } = fakeApi();
		const state = makeState(api);
		expect(await state.inviteGuest('  Nan  ')).toBe(true);
		expect(calls.guests).toEqual([{ id: 'master', guest: 'Nan' }]);
		const refused = fakeApi({
			inviteGuest: async () => ({ ok: false as const, status: 500, error: 'Failed to invite guest' })
		});
		const second = makeState(refused.api);
		expect(await second.inviteGuest('Ada')).toBe(false);
		expect(second.actionError).toBe('Failed to invite guest');
	});

	it('deletes with the scope and cannot be fired twice (issue 015)', async () => {
		const gate = Promise.withResolvers<void>();
		const { api, calls } = fakeApi({
			deleteEvent: async (id: string, scope: { scope: 'this' | 'all' }) => {
				calls.delete.push({ id, scope });
				await gate.promise;
				return { ok: true as const, data: { success: true as const } };
			}
		});
		const state = makeState(api);
		const first = state.remove('this');
		expect(await state.remove('this')).toBe(false);
		gate.resolve();
		expect(await first).toBe(true);
		expect(calls.delete).toEqual([
			{ id: 'master', scope: { scope: 'this', occurrenceDate: event.occurrenceDate } }
		]);
		expect(state.deleting).toBe(false);
	});

	it('sends the whole series when the modal has no occurrence open', async () => {
		const { api, calls } = fakeApi();
		const state = makeState(api, { event: { ...event, occurrenceDate: null } });
		await state.remove('this');
		expect(calls.delete[0].scope).toEqual({ scope: 'all', occurrenceDate: null });
	});

	it('duplicates as "… (copy)" with its invites and toasts', async () => {
		const toasts = memoryToasts();
		const { api, calls } = fakeApi();
		const state = new CalendarEventModalState(api, toasts, 'me', {
			event,
			attendees: [{ userId: 'u1', status: 'going', inviteType: 'required' }],
			guests: [{ name: 'Nan', status: 'invited' }]
		});
		expect(await state.duplicate()).toBe(true);
		expect(calls.create[0].title).toBe('Dentist (copy)');
		expect(calls.create[0].attendees).toEqual([
			{ value: 'u1', isUser: true, inviteType: 'required' },
			{ value: 'Nan', isUser: false, inviteType: 'optional' }
		]);
		expect(toasts.items).toEqual([{ kind: 'success', text: 'Event duplicated.' }]);
	});
});
