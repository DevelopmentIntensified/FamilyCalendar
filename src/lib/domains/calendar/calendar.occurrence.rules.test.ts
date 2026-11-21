/**
 * Occurrence identity and the display-pipeline merge: the id tables carried
 * from `src/lib/server/utils/eventIds.test.ts:9-64`, `shiftException` from
 * `src/lib/server/db/actions/events.ts:306-320`, and the Exception Override
 * merge from `src/lib/server/services/eventDisplayService.ts:99-123` (also
 * pinned by `calendar.events.http.db.test.ts`).
 *
 * Doc: ./README.md#invariants
 */
import { describe, expect, it } from 'vitest';
import { expandRecurrence, type RecurringEventInput } from './calendar.recurrence.rules';
import {
	buildOccurrenceId,
	expandEventOccurrences,
	normalizeOccurrenceIso,
	resolveMasterId,
	resolveOccurrenceId,
	shiftException
} from './calendar.occurrence.rules';

const at = (iso: string) => new Date(iso);

const recurring = (over: Partial<RecurringEventInput> = {}): RecurringEventInput => ({
	id: 'evt12345678901',
	start: '2026-08-10T18:00:00Z',
	recurrenceFrequency: 'daily',
	recurrenceInterval: 1,
	recurrenceByDay: null,
	recurrenceCount: null,
	recurrenceUntil: null,
	...over
});

describe('occurrence ids (eventIds.test.ts:9-64)', () => {
	it('builds the one composite shape', () => {
		expect(buildOccurrenceId('abc123def456ghi', '2026-08-21T16:00:00.000Z')).toBe(
			'abc123def456ghi~2026-08-21T16:00:00.000Z'
		);
	});

	it.each([
		['abc123def456ghi~2026-08-21T16:00:00.000Z', 'abc123def456ghi'],
		['abc123def456ghi', 'abc123def456ghi'],
		['a1b2c3d4-e5f6-7890-abcd-ef0123456789', 'a1b2c3d4-e5f6-7890-abcd-ef0123456789'],
		['', null],
		['~2026-08-21', null],
		["abc'; DROP TABLE events;--~x", null],
		[null, null]
	] satisfies [string | null, string | null][])('resolveMasterId(%j) -> %j', (raw, expected) => {
		expect(resolveMasterId(raw)).toBe(expected);
	});

	it('round-trips a composite id preserving ISO precision', () => {
		expect(resolveOccurrenceId('abc123def456ghi~2026-08-21T16:00:00.123Z')).toEqual({
			masterId: 'abc123def456ghi',
			occurrenceIso: '2026-08-21T16:00:00.123Z'
		});
	});

	it('resolves a non-recurring id with no occurrence part', () => {
		expect(resolveOccurrenceId('abc123def456ghi')).toEqual({ masterId: 'abc123def456ghi' });
	});

	it('normalizes an offset occurrence into UTC ISO', () => {
		expect(resolveOccurrenceId('Kx7Pq2Zr9VmT1Lw~2026-08-22T05:00:00.000+02:00')).toEqual({
			masterId: 'Kx7Pq2Zr9VmT1Lw',
			occurrenceIso: '2026-08-22T03:00:00.000Z'
		});
	});

	it.each([[''], ['~2026-08-21T00:00:00.000Z'], ['abc123def456ghi~not-an-iso'], ['abc123def456ghi~']])(
		'resolveOccurrenceId(%j) is null',
		(raw) => {
			expect(resolveOccurrenceId(raw)).toBeNull();
		}
	);

	it('normalizeOccurrenceIso matches the expansion rendering so override keying cannot drift', () => {
		const occurrences = expandRecurrence(
			recurring({ start: '2026-08-22T05:00:00.000Z', recurrenceFrequency: 'weekly' }),
			at('2026-08-01T00:00:00.000Z'),
			at('2026-09-01T00:00:00.000Z')
		);
		expect(occurrences.length).toBeGreaterThan(0);
		for (const occurrence of occurrences) {
			expect(normalizeOccurrenceIso(occurrence.toISOString())).toBe(occurrence.toISOString());
			expect(normalizeOccurrenceIso(occurrence)).toBe(occurrence.toISOString());
		}
	});
});

describe('shiftException (events.ts:306-320)', () => {
	it('shifts the slot key and both overrides by the same delta', () => {
		expect(
			shiftException(
				{
					originalDate: '2026-10-13T15:00:00.000Z',
					start: '2026-10-13T17:00:00.000Z',
					end: '2026-10-13T18:00:00.000Z'
				},
				86_400_000
			)
		).toEqual({
			originalDate: '2026-10-14T15:00:00.000Z',
			start: '2026-10-14T17:00:00.000Z',
			end: '2026-10-14T18:00:00.000Z'
		});
	});

	it('keeps a null override null', () => {
		expect(
			shiftException({ originalDate: '2026-10-13T15:00:00.000Z', start: null, end: null }, 3_600_000)
		).toEqual({ originalDate: '2026-10-13T16:00:00.000Z', start: null, end: null });
	});
});

describe('expandEventOccurrences (eventDisplayService.ts:99-123)', () => {
	const master = {
		id: 'evtseries001',
		ownerId: 'user000000001',
		calendarId: 'calpersonal001',
		title: 'Piano',
		start: '2026-10-06T15:00:00.000Z',
		end: '2026-10-06T16:00:00.000Z',
		description: null,
		location: 'Hall',
		allDay: false,
		recurrenceFrequency: 'weekly',
		recurrenceInterval: 1,
		recurrenceByDay: null,
		recurrenceCount: 3,
		recurrenceUntil: null
	};
	const window = { start: at('2026-10-01T00:00:00.000Z'), end: at('2026-11-01T00:00:00.000Z') };

	it('drops a cancelled slot and merges an edited one over the master', () => {
		const result = expandEventOccurrences(
			[master],
			[
				{
					eventId: 'evtseries001',
					originalDate: '2026-10-20T15:00:00.000Z',
					isCancelled: true,
					title: null,
					description: null,
					location: null,
					start: null,
					end: null,
					allDay: null
				},
				{
					eventId: 'evtseries001',
					originalDate: '2026-10-13T15:00:00.000Z',
					isCancelled: false,
					title: 'Piano (moved)',
					description: null,
					location: null,
					start: '2026-10-13T17:00:00.000Z',
					end: null,
					allDay: null
				}
			],
			window
		);

		expect(result).toHaveLength(2);
		expect(result[0]).toMatchObject({
			id: 'evtseries001~2026-10-06T15:00:00.000Z',
			masterId: 'evtseries001',
			occurrenceDate: '2026-10-06T15:00:00.000Z',
			title: 'Piano'
		});
		expect(result[1]).toMatchObject({
			id: 'evtseries001~2026-10-13T15:00:00.000Z',
			occurrenceDate: '2026-10-13T15:00:00.000Z',
			start: '2026-10-13T17:00:00.000Z',
			// end derives from the master's one-hour duration
			end: '2026-10-13T18:00:00.000Z',
			title: 'Piano (moved)',
			location: 'Hall'
		});
	});

	it('keeps an override start with an explicit end', () => {
		const result = expandEventOccurrences(
			[master],
			[
				{
					eventId: 'evtseries001',
					originalDate: '2026-10-06T15:00:00.000Z',
					isCancelled: false,
					title: null,
					description: 'Bring music',
					location: null,
					start: null,
					end: '2026-10-06T19:30:00.000Z',
					allDay: null
				}
			],
			window
		);
		expect(result[0]).toMatchObject({
			start: '2026-10-06T15:00:00.000Z',
			end: '2026-10-06T19:30:00.000Z',
			description: 'Bring music'
		});
	});
});
