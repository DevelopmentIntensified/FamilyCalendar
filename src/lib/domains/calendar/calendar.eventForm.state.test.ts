/**
 * The form state class in node: the body it submits (create vs edit + scope),
 * the parser merge through an injected parser, the invite prefill, the
 * multi-date POST loop and the remembered recent guests. Fakes are passed in —
 * no module mocking (R9).
 *
 * Doc: ./README.md#invariants
 */
import { describe, expect, it, vi } from 'vitest';
import type { CalendarApi } from './calendar.api';
import {
	CalendarEventFormState,
	type CalendarEventFormInit
} from './calendar.eventForm.state.svelte';
import type { CalendarEventBody } from './calendar.eventForm.rules';

function fakeApi(overrides: Partial<CalendarApi> = {}): {
	api: CalendarApi;
	calls: { create: CalendarEventBody[]; update: { id: string; body: unknown }[] };
} {
	const calls: { create: CalendarEventBody[]; update: { id: string; body: unknown }[] } = {
		create: [],
		update: []
	};
	const api = {
		createEvent: async (body: CalendarEventBody) => {
			calls.create.push(body);
			return { ok: true as const, data: { success: true as const, event: { id: `e${calls.create.length}` } } };
		},
		updateEvent: async (id: string, body: unknown) => {
			calls.update.push({ id, body });
			return { ok: true as const, data: { success: true as const, event: null } };
		},
		...overrides
	} as unknown as CalendarApi;
	return { api, calls };
}

const calendars = [
	{ id: 'cal-1', name: 'Personal Calendar' },
	{ id: 'cal-2', name: 'Family Calendar' }
];
const familyMembers = [{ userId: 'u-1', firstName: 'Mira', lastName: 'K', email: 'm@x' }];

function createState(api: CalendarApi, overrides: Partial<CalendarEventFormInit> = {}) {
	return new CalendarEventFormState(api, null, {
		calendars,
		familyMembers,
		defaultCalendarId: 'cal-2',
		...overrides
	});
}

describe('CalendarEventFormState (EventFormModel.svelte.ts)', () => {
	it('starts a create form on the default calendar with the initial date touched', () => {
		const { api } = fakeApi();
		const state = new CalendarEventFormState(api, null, {
			calendars,
			familyMembers,
			defaultCalendarId: 'cal-2',
			initialDate: '2026-02-06',
			initialTitle: 'Lunch'
		});
		expect(state.fields.selectedCalendarId).toBe('cal-2');
		expect(state.fields.date).toBe('2026-02-06');
		expect(state.fields.title).toBe('Lunch');
		expect(state.isEdit).toBe(false);
		expect(state.canSubmit).toBe(true);
	});

	it('patches a field and remembers the user touched it', () => {
		const { api } = fakeApi();
		const state = createState(api);
		state.patch({ title: 'Dentist' }, 'title');
		expect(state.fields.title).toBe('Dentist');
		expect(state.draft.touched.title).toBe(true);
	});

	it('applies a parse through the injected parser and reveals detected fields', async () => {
		const { api } = fakeApi();
		const parseEvent = vi.fn(async () => ({ parsed: { title: 'Lunch', date: '2026-02-06' } }));
		const state = new CalendarEventFormState(api, parseEvent, {
			calendars,
			familyMembers,
			defaultCalendarId: 'cal-2'
		});
		state.onQuickAddInput('lunch fri');
		expect(state.fields.description).toBe('lunch fri');
		await state.runParse();
		expect(parseEvent).toHaveBeenCalledWith('lunch fri');
		expect(state.fields.title).toBe('Lunch');
		expect(state.fields.date).toBe('2026-02-06');
		expect(state.isDetected('title')).toBe(true);
		expect(state.phraseReportable).toBe(true);
	});

	it('says so when the parser finds nothing', async () => {
		const { api } = fakeApi();
		const state = new CalendarEventFormState(api, async () => ({}), {
			calendars,
			familyMembers,
			defaultCalendarId: 'cal-2'
		});
		state.onQuickAddInput('blah');
		await state.runParse();
		expect(state.parseError).toBe(true);
	});

	it('toggles an attendant and its required/optional role', () => {
		const { api } = fakeApi();
		const state = createState(api);
		state.toggleAttendant('u-1');
		state.toggleAttendant('Nan');
		expect(state.fields.attendants).toEqual(['u-1', 'Nan']);
		expect(state.fields.inviteTypes).toEqual({ 'u-1': 'optional' });
		state.setInviteType('u-1', 'required');
		expect(state.fields.inviteTypes['u-1']).toBe('required');
		state.toggleAttendant('u-1');
		expect(state.fields.attendants).toEqual(['Nan']);
		expect(state.fields.inviteTypes).toEqual({});
	});

	it('prefills invites from attendance rows, learning members outside the roster', () => {
		const { api } = fakeApi();
		const state = createState(api);
		state.prefillInvites([
			{ userId: 'u-1', status: 'going', inviteType: 'required' },
			{ userId: 'u-9', status: 'maybe', firstName: 'Ada', lastName: 'L' },
			{ userId: null, status: 'invited', name: 'Nan' }
		]);
		expect(state.fields.attendants).toEqual(['u-1', 'u-9', 'Nan']);
		expect(state.fields.inviteTypes).toEqual({ 'u-1': 'required', 'u-9': 'optional' });
		expect(state.invitedUsers).toEqual([{ userId: 'u-9', firstName: 'Ada', lastName: 'L', email: '' }]);
		expect(state.invitesLoaded).toBe(true);
		state.prefillInvites([]);
		expect(state.fields.attendants).toEqual(['u-1', 'u-9', 'Nan']);
	});

	it('posts a create body, then one POST per extra parsed date', async () => {
		const { api, calls } = fakeApi();
		const state = createState(api);
		state.patch({ title: 'Lunch', date: '2026-02-06', startTime: '12:00' }, 'title');
		state.lastParse = { dates: ['2026-02-06', '2026-02-09'] };
		const outcome = await state.save();
		expect(outcome?.body.title).toBe('Lunch');
		expect(calls.create).toHaveLength(2);
		expect(calls.create[0].title).toBe('Lunch');
		expect(new Date(calls.create[1].start).getTime() - new Date(calls.create[0].start).getTime()).toBe(
			3 * 86_400_000
		);
	});

	it('updates the master with the edit scope on a recurring occurrence', async () => {
		const { api, calls } = fakeApi();
		const state = new CalendarEventFormState(api, null, {
			calendars,
			familyMembers,
			defaultCalendarId: 'cal-2',
			event: {
				id: 'master~2026-02-03T10:00:00.000Z',
				masterId: 'master',
				occurrenceDate: '2026-02-03T10:00:00.000Z',
				title: 'Dentist',
				start: '2026-02-03T10:00:00.000Z',
				recurrenceFrequency: 'weekly'
			}
		});
		state.patch({ title: 'Dentist 2' }, 'title');
		await state.save('all');
		expect(calls.update).toHaveLength(1);
		expect(calls.update[0].id).toBe('master');
		expect(calls.update[0].body).toMatchObject({
			title: 'Dentist 2',
			scope: 'all',
			occurrenceDate: '2026-02-03T10:00:00.000Z'
		});
	});

	it('never sends invites on an edit whose invites never loaded', async () => {
		const { api, calls } = fakeApi();
		const state = new CalendarEventFormState(api, null, {
			calendars,
			familyMembers,
			defaultCalendarId: 'cal-2',
			event: { id: 'm1', title: 'Dentist', start: '2026-02-03T10:00:00.000Z' }
		});
		await state.save();
		expect(calls.update[0].body).not.toHaveProperty('attendees');
	});

	it('keeps the server’s message on a failed save', async () => {
		const { api } = fakeApi({
			createEvent: async () => ({ ok: false as const, status: 403, error: 'Calendar not accessible' })
		});
		const state = createState(api);
		state.patch({ title: 'X', date: '2026-02-06' });
		expect(await state.save()).toBeNull();
		expect(state.error).toBe('Calendar not accessible');
	});

	it('remembers guest names but never members', async () => {
		const { api } = fakeApi();
		const state = createState(api);
		state.toggleAttendant('u-1');
		state.toggleAttendant('Nan');
		state.patch({ title: 'Lunch', date: '2026-02-06' });
		await state.save();
		expect(state.recentAttendants).toEqual(['Nan']);
	});

	it('resets to a clean form on the same calendar', () => {
		const { api } = fakeApi();
		const state = createState(api);
		state.patch({ title: 'X', date: '2026-02-06' }, 'title');
		state.reset();
		expect(state.fields.title).toBe('');
		expect(state.fields.date).toBe('');
		expect(state.fields.selectedCalendarId).toBe('cal-2');
	});
});
