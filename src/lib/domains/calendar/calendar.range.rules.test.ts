/**
 * The ranged-read contract and its expansion window, carried from
 * `src/lib/server/services/eventRange.test.ts:7-55` and the 62-day golden
 * (`calendar.events.http.db.test.ts › serves a range of exactly 62 days and
 * refuses anything wider`, `:279-297`).
 *
 * Doc: ./README.md#invariants
 */
import { describe, expect, it } from 'vitest';
import {
	eventRangeWindow,
	MAX_RANGE_DAYS,
	RANGE_REQUIRED_MESSAGE,
	RANGE_TOO_WIDE_MESSAGE,
	resolveEventRange
} from './calendar.range.rules';

/** Legacy `searchParams` semantics: the first value of a key, absent when missing. */
const range = (search: string) => {
	const params = new URLSearchParams(search);
	return resolveEventRange({
		from: params.get('from') ?? undefined,
		to: params.get('to') ?? undefined
	});
};

describe('resolveEventRange (eventRange.test.ts:7-40)', () => {
	it('reads a from/to pair as the window it was asked for', () => {
		expect(range('from=2026-10-01&to=2026-10-31')).toEqual({ from: '2026-10-01', to: '2026-10-31' });
		expect(range('from=2026-10-01&to=2026-10-01')).toMatchObject({ from: '2026-10-01' });
	});

	it.each([
		['both ends missing', ''],
		['only the start', 'from=2026-10-01'],
		['only the end', 'to=2026-10-31'],
		['an unparseable date', 'from=october&to=2026-10-31'],
		['a date that does not exist', 'from=2026-02-31&to=2026-03-05'],
		['a backwards range', 'from=2026-10-31&to=2026-10-01']
	])('refuses %s with the required-range copy', (_name, query) => {
		expect(range(query)).toEqual({ error: RANGE_REQUIRED_MESSAGE });
	});

	it('serves exactly 62 days and refuses the 63rd (golden :279-297)', () => {
		expect(range('from=2026-10-01&to=2026-12-02')).toEqual({ from: '2026-10-01', to: '2026-12-02' });
		expect(range('from=2026-10-01&to=2026-12-03')).toEqual({ error: RANGE_TOO_WIDE_MESSAGE });
		expect(MAX_RANGE_DAYS).toBe(62);
	});
});

describe('eventRangeWindow (eventRange.test.ts:41-55, #218)', () => {
	it.each([
		['two months', '2026-11-01', '2026-12-31', '2026-10-25T00:00:00.000Z', '2027-01-07T23:59:59.999Z'],
		['one month', '2026-10-01', '2026-10-31', '2026-09-24T00:00:00.000Z', '2026-11-07T23:59:59.999Z'],
		['a single day', '2026-10-15', '2026-10-15', '2026-10-08T00:00:00.000Z', '2026-10-22T23:59:59.999Z'],
		['across a year end', '2026-12-15', '2027-01-20', '2026-12-08T00:00:00.000Z', '2027-01-27T23:59:59.999Z']
	] satisfies [string, string, string, string, string][])(
		'pads %s by one grid week each side',
		(_name, from, to, startIso, endIso) => {
			const window = eventRangeWindow({ from, to });
			expect(window.startIso).toBe(startIso);
			expect(window.endIso).toBe(endIso);
			expect(window.start.toISOString()).toBe(startIso);
			expect(window.end.toISOString()).toBe(endIso);
		}
	);
});
