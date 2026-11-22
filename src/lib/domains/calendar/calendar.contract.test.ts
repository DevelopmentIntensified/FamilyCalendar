/**
 * The calendar contract's wire schemas: the shapes the three golden files pin,
 * including the legacy leniency (an absent title is NOT a 400 — the writer
 * reaches the database and the route answers 500) and the raw-row text render
 * `POST`/`PUT` answer.
 *
 * Doc: ./README.md#invariants
 */
import { describe, expect, it } from 'vitest';
import {
	CALENDAR_COPY,
	CalendarBulkBody,
	CalendarDisplayEventWire,
	CalendarEventCreateBody,
	CalendarEventParams,
	CalendarEventRangeQuery,
	CalendarEventRowWire,
	CalendarImportUndoRefWire,
	CalendarLocationQuery,
	CalendarPrintQuery,
	CalendarRsvpBody
} from './calendar.contract';

const ISO = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;

describe('event bodies', () => {
	it('accepts the body the golden creates with', () => {
		const parsed = CalendarEventCreateBody.safeParse({
			title: 'Dentist',
			start: '2026-10-07T13:00:00.000Z',
			attendants: ['Grandma', '   ']
		});
		expect(parsed.success).toBe(true);
	});

	it('keeps an absent title absent so the database, not the schema, rejects it', () => {
		const parsed = CalendarEventCreateBody.safeParse({ start: '2026-10-07T13:00:00.000Z' });
		expect(parsed.success).toBe(true);
		expect(parsed.success ? parsed.data.title : 'no').toBeUndefined();
	});

	it('accepts an explicit null/empty clear and the recurrence write shape', () => {
		const parsed = CalendarEventCreateBody.safeParse({
			title: 'Piano',
			start: '2026-10-06T15:00:00.000Z',
			description: null,
			location: '',
			allDay: null,
			recurrenceFrequency: 'weekly',
			recurrenceInterval: 2,
			recurrenceByDay: ['MO'],
			recurrenceCount: 3,
			recurrenceUntil: '2026-12-01T00:00:00.000Z'
		});
		expect(parsed.success).toBe(true);
	});
});

describe('raw-row responses', () => {
	it('accepts the raw drizzle row, with Postgres text-render timestamps', () => {
		const parsed = CalendarEventRowWire.safeParse({
			id: 'evtoneoff01',
			calendarId: 'cal-personal01',
			ownerId: 'user-one',
			title: 'Dentist',
			start: '2026-10-07 13:00:00+00',
			end: null,
			description: null,
			location: null,
			allDay: false,
			recurrenceFrequency: null,
			recurrenceInterval: null,
			recurrenceByDay: null,
			recurrenceCount: null,
			recurrenceUntil: null,
			reminderMinutes: null,
			mirrorOf: null,
			created_at: '2026-10-01T12:00:00.000Z'
		});
		expect(parsed.success).toBe(true);
	});
});

describe('display events', () => {
	it('accepts the golden occurrence with its composite id, slot and optional attachments', () => {
		const parsed = CalendarDisplayEventWire.safeParse({
			id: 'evtoneoff01~2026-10-05T09:00:00.000Z',
			calendarId: 'cal-personal01',
			ownerId: 'user-one',
			title: 'Soccer practice',
			start: '2026-10-05T09:00:00.000Z',
			end: '2026-10-05T10:00:00.000Z',
			description: null,
			location: null,
			allDay: false,
			recurrenceFrequency: null,
			recurrenceInterval: null,
			recurrenceByDay: null,
			recurrenceCount: null,
			recurrenceUntil: null,
			reminderMinutes: null,
			mirrorOf: null,
			created_at: '2026-10-01T12:00:00.000Z',
			masterId: 'evtoneoff01',
			occurrenceDate: '2026-10-05T09:00:00.000Z',
			date: '2026-10-05T09:00:00.000Z',
			rsvpStatus: 'going',
			attendance: { going: 1, invited: 1, required: 0, requiredPending: 0, goingNames: ['Mia'] },
			creatorName: 'Mia'
		});
		expect(parsed.success).toBe(true);
	});

	it('accepts an occurrence with no rsvp or attendance (the fields are omitted)', () => {
		const base = {
			id: 'evtoneoff01~2026-10-05T09:00:00.000Z',
			calendarId: null,
			ownerId: 'user-one',
			title: 'Dentist',
			start: '2026-10-05T09:00:00.000Z',
			end: null,
			description: null,
			location: null,
			allDay: false,
			recurrenceFrequency: null,
			recurrenceInterval: null,
			recurrenceByDay: null,
			recurrenceCount: null,
			recurrenceUntil: null,
			reminderMinutes: null,
			mirrorOf: null,
			created_at: '2026-10-01T12:00:00.000Z',
			masterId: 'evtoneoff01',
			occurrenceDate: '2026-10-05T09:00:00.000Z',
			date: '2026-10-05T09:00:00.000Z'
		};
		const parsed = CalendarDisplayEventWire.safeParse(base);
		expect(parsed.success).toBe(true);
		expect(parsed.success && 'rsvpStatus' in parsed.data).toBe(false);
	});
});

describe('rsvp and import bodies', () => {
	it('accepts a status, a guest, or an unknown guest value for the route to refuse', () => {
		expect(CalendarRsvpBody.safeParse({ status: 'maybe' }).success).toBe(true);
		expect(CalendarRsvpBody.safeParse({ guest: 'Grandma' }).success).toBe(true);
		// A non-string guest is the route's 400, not a schema 400.
		expect(CalendarRsvpBody.safeParse({ guest: 42 }).success).toBe(true);
	});

	it('rejects an undo row without a usable id or title', () => {
		expect(
			CalendarImportUndoRefWire.safeParse({
				id: 'evt12345678901',
				title: 'Soccer practice',
				startIso: '2026-09-29T14:00:00.000Z'
			}).success
		).toBe(true);
		expect(
			CalendarImportUndoRefWire.safeParse({
				id: 'evt12345678901',
				title: '   ',
				startIso: '2026-09-29T14:00:00.000Z'
			}).success
		).toBe(false);
	});

	it('pins the series note and the ISO rendering the display wire accepts', () => {
		expect(CALENDAR_COPY.seriesNote).toBe('Attendee changes apply to the whole series.');
		expect('2026-10-05T09:00:00.000Z').toMatch(ISO);
	});
});

describe('boundary inputs', () => {
	it('reads the event range as two optional strings, refusals left to the rule', () => {
		expect(CalendarEventRangeQuery.parse({})).toEqual({});
		expect(CalendarEventRangeQuery.parse({ from: '2026-10-01', to: '2026-10-31' })).toEqual({
			from: '2026-10-01',
			to: '2026-10-31'
		});
		// `?from=` is present and empty: `resolveEventRange` answers "ask for a range".
		expect(CalendarEventRangeQuery.parse({ from: '', to: '' })).toEqual({ from: '', to: '' });
	});

	it('reads the print query untrimmed, so the service keeps its own 1–12 clamp', () => {
		expect(CalendarPrintQuery.parse({})).toEqual({});
		expect(CalendarPrintQuery.parse({ year: '2026', month: ' 2 ' })).toEqual({
			year: '2026',
			month: ' 2 '
		});
	});

	it('leaves the location query to the flow copy', () => {
		expect(CalendarLocationQuery.parse({ q: 'a' })).toEqual({ q: 'a' });
		expect(CalendarLocationQuery.parse({})).toEqual({});
	});

	it('requires a path segment id and passes the composite form through', () => {
		expect(CalendarEventParams.safeParse({}).success).toBe(false);
		expect(CalendarEventParams.parse({ id: 'evtoneoff01~2026-10-13T15:00:00.000Z' })).toEqual({
			id: 'evtoneoff01~2026-10-13T15:00:00.000Z'
		});
	});

	it('hands the bulk body through as posted, every field optional', () => {
		expect(CalendarBulkBody.parse({})).toEqual({});
		expect(CalendarBulkBody.parse({ ids: [{ id: 'evt1' }], op: { type: 'delete' } })).toEqual({
			ids: [{ id: 'evt1' }],
			op: { type: 'delete' }
		});
		expect(CalendarBulkBody.parse({ ids: ['not-an-item'], dryRun: true })).toEqual({
			ids: ['not-an-item'],
			dryRun: true
		});
	});
});
