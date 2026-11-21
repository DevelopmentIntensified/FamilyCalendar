/**
 * The wire contract of `GET /api/sponsored-events`: the strict `month` query
 * (legacy `+server.ts:19-30`, the golden's six 400 cases) and the response row
 * (the calendar display shape plus the ad marking, as the golden pins it).
 *
 * Doc: ./README.md#invariants
 */
import { describe, expect, it } from 'vitest';
import { firstIssueMessage, z } from '$lib/kernel/validation/validators';
import {
	SPONSORED_MONTH_INVALID_MESSAGE,
	SponsoredEvent,
	SponsoredEventsQuery,
	SponsoredEventsResponse
} from './sponsored.contract';
import { SPONSORED_EVENT_COLOR } from './sponsored.display.rules';

function messageOf(schema: z.ZodType, value: unknown): string | null {
	const result = schema.safeParse(value);
	return result.success ? null : firstIssueMessage(result.error);
}

/** The full-body golden's row (`sponsored.http.db.test.ts` › "serves the requested month …"). */
const wireRow = {
	id: 'adrowfull00001',
	title: '📢 20% off annual plans',
	description: 'Ends Friday',
	start: '2026-11-05T10:00:00.000Z',
	end: '2026-11-05T10:00:00.000Z',
	allDay: true,
	calendarId: '',
	ownerId: 'user-1',
	location: null,
	recurrenceFrequency: null,
	recurrenceInterval: null,
	created_at: '2026-11-19T08:30:00.000Z',
	recurrenceByDay: null,
	recurrenceCount: null,
	recurrenceUntil: null,
	reminderMinutes: null,
	mirrorOf: null,
	date: '2026-11-05T10:00:00.000Z',
	color: '#f59e0b',
	isAd: true
};

describe('SponsoredEventsQuery', () => {
	it('keeps the legacy 400 copy', () => {
		expect(SPONSORED_MONTH_INVALID_MESSAGE).toBe('Invalid month');
	});

	it('accepts an absent month (the service resolves the current one)', () => {
		expect(SponsoredEventsQuery.parse({})).toEqual({});
	});

	it.each<[string]>([['2026-11'], ['2026-01'], ['2026-12'], ['1999-09']])(
		'accepts month=%s',
		(month) => {
			expect(SponsoredEventsQuery.parse({ month })).toEqual({ month });
		}
	);

	it('ignores every other query key, as the legacy route did', () => {
		expect(SponsoredEventsQuery.parse({ month: '2026-11', year: '2027' })).toEqual({
			month: '2026-11'
		});
	});

	// Legacy cases: src/routes/api/sponsored-events/server.test.ts:48 (2026-13, 2026-1, nov,
	// 2026-11-01), plus the golden's 2026-00 and the empty value.
	it.each<[string]>([
		['2026-13'],
		['2026-00'],
		['2026-1'],
		['nov'],
		['2026-11-01'],
		[''],
		[' 2026-11'],
		['2026-11 '],
		['26-11']
	])('answers "Invalid month" for month=%j', (month) => {
		expect(messageOf(SponsoredEventsQuery, { month })).toBe('Invalid month');
	});
});

describe('SponsoredEvent / SponsoredEventsResponse', () => {
	it('keeps the wire amber', () => {
		expect(SPONSORED_EVENT_COLOR).toBe('#f59e0b');
	});

	it('parses the golden row unchanged', () => {
		expect(SponsoredEvent.parse(wireRow)).toEqual(wireRow);
	});

	it('parses a month of rows and the gate-off empty body', () => {
		expect(SponsoredEventsResponse.parse({ events: [wireRow] })).toEqual({ events: [wireRow] });
		expect(SponsoredEventsResponse.parse({ events: [] })).toEqual({ events: [] });
	});

	it.each<[string, Record<string, unknown>]>([
		['an unmarked row', { isAd: false }],
		['a row without the marker', { isAd: undefined }],
		['another colour', { color: '#fa8072' }],
		['a row on a calendar', { calendarId: 'cal-1' }],
		['a timed row', { allDay: false }],
		['a Date instead of an ISO string', { created_at: new Date('2026-11-19T08:30:00.000Z') }],
		['a recurring row', { recurrenceFrequency: 'weekly' }],
		['a located row', { location: 'Main St' }]
	])('refuses %s', (_label, change) => {
		expect(SponsoredEvent.safeParse({ ...wireRow, ...change }).success).toBe(false);
	});
});
