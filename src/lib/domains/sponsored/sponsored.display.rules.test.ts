/**
 * The display projection every served row goes through: `📢 <message>`, an
 * all-day row on no calendar with `end` and `date` equal to `start`, the amber,
 * `isAd: true` and `created_at` = the served month's start (Q-042 B) — legacy
 * `adService.ts:294-334`, `calendarData.ts:53-62,79-81`, `+server.ts:35`.
 * Expected rows are the golden's full body, never a run of the code.
 *
 * Doc: ./README.md#invariants
 */
import { describe, expect, it } from 'vitest';
import { SponsoredEvent } from './sponsored.contract';
import {
	SPONSORED_TITLE_MARKER,
	toSponsoredEvent,
	type SponsoredEventServing,
	type SponsoredEventSource
} from './sponsored.display.rules';

/** The month start the service passes as `created_at` (Q-042 B). */
const serving: SponsoredEventServing = {
	ownerId: 'user-1',
	createdAt: new Date('2026-11-01T00:00:00.000Z')
};

/** Every field that is the same on every served row. */
const fixedFields = {
	allDay: true,
	calendarId: '',
	ownerId: 'user-1',
	location: null,
	recurrenceFrequency: null,
	recurrenceInterval: null,
	created_at: '2026-11-01T00:00:00.000Z',
	recurrenceByDay: null,
	recurrenceCount: null,
	recurrenceUntil: null,
	reminderMinutes: null,
	mirrorOf: null,
	color: '#f59e0b',
	isAd: true
};

describe('the 📢 title marker', () => {
	// adService.ts:299 — the served title is the marker, a space, then the message.
	it('is the megaphone emoji the projection writes', () => {
		expect(SPONSORED_TITLE_MARKER).toBe('📢');
	});
});

describe('toSponsoredEvent — the wire row', () => {
	it("projects the golden's full-body row", () => {
		const source: SponsoredEventSource = {
			id: 'adrowfull00001',
			message: '20% off annual plans',
			description: 'Ends Friday',
			// The stored timestamptz as the driver hands it out.
			start: '2026-11-05 10:00:00+00'
		};
		expect(toSponsoredEvent(source, serving)).toEqual({
			id: 'adrowfull00001',
			title: '📢 20% off annual plans',
			description: 'Ends Friday',
			start: '2026-11-05T10:00:00.000Z',
			end: '2026-11-05T10:00:00.000Z',
			date: '2026-11-05T10:00:00.000Z',
			...fixedFields
		});
	});

	it.each<[string, SponsoredEventSource, Partial<SponsoredEvent>]>([
		[
			'a null description is served empty',
			{ id: 'g1', message: 'Get 20% off annual plans this month only!', description: null, start: '2026-11-16T10:00:00.000Z' },
			{ title: '📢 Get 20% off annual plans this month only!', description: '', start: '2026-11-16T10:00:00.000Z' }
		],
		[
			'an empty message still carries the marker and its space',
			{ id: 'g2', message: '', description: '', start: '2026-11-01T10:00:00.000Z' },
			{ title: '📢 ', description: '' }
		],
		[
			'an offset start is served as the UTC instant',
			{ id: 'g3', message: 'Sale', description: null, start: '2026-11-05T05:00:00-05:00' },
			{ start: '2026-11-05T10:00:00.000Z', end: '2026-11-05T10:00:00.000Z', date: '2026-11-05T10:00:00.000Z' }
		],
		[
			'a driver start in another session zone is the same instant',
			{ id: 'g4', message: 'Sale', description: null, start: '2026-11-05 11:00:00+01' },
			{ start: '2026-11-05T10:00:00.000Z' }
		]
	])('%s', (_label, source, expected) => {
		expect(toSponsoredEvent(source, serving)).toMatchObject({ ...fixedFields, ...expected });
	});

	it('always parses as the wire contract', () => {
		const row = toSponsoredEvent(
			{ id: 'g5', message: 'Sale', description: null, start: '2026-11-05T10:00:00.000Z' },
			serving
		);
		expect(SponsoredEvent.parse(row)).toEqual(row);
	});

	it('refuses a start that is not an instant, as the legacy toISOString did', () => {
		expect(() =>
			toSponsoredEvent({ id: 'bad', message: 'Sale', description: null, start: 'not a date' }, serving)
		).toThrow(RangeError);
	});
});
