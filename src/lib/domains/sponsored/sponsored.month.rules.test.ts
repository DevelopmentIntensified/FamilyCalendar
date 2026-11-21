/**
 * The Sponsored Event month: the `YYYY-MM` key, the current month in a zone,
 * the zone window the own-row read uses, and the generation draw. The draw is
 * fed a scripted random source, so each table row states exactly which
 * template and which day every number picks (legacy `adService.ts:126-183`:
 * `floor(r × 4)` per template with redraws while a template repeats, then
 * `floor(r × daysInMonth) + 1` for the day, at 10:00 in the zone). Expected
 * values are worked by hand from that rule, never from running the code.
 *
 * Doc: ./README.md#invariants
 */
import { describe, expect, it } from 'vitest';
import {
	planSponsoredMonth,
	SPONSORED_EVENT_MESSAGES,
	SPONSORED_EVENTS_PER_MONTH,
	sponsoredGeneratedEventId,
	sponsoredMonthOf,
	sponsoredMonthOfKey,
	sponsoredMonthWindow,
	type SponsoredMonth,
	type SponsoredRandomSource
} from './sponsored.month.rules';

/** A source that hands out `draws` in order and fails the test if asked for more. */
function scripted(draws: readonly number[]): SponsoredRandomSource & { left(): number } {
	let next = 0;
	const source = () => {
		const value = draws[next];
		if (value === undefined) throw new Error(`scripted source exhausted after ${draws.length} draws`);
		next += 1;
		return value;
	};
	return Object.assign(source, { left: () => draws.length - next });
}

const [PREMIUM, DISCOUNT, ARCHIVE, INVITE] = [
	'Upgrade to Premium and unlock unlimited family members!',
	'Get 20% off annual plans this month only!',
	'Check out our new archive retention feature - preserve memories forever!',
	'Invite your extended family - groups now support 5+ members!'
];

describe('the generation vocabulary', () => {
	it('keeps the four legacy template messages in their draw order', () => {
		expect(SPONSORED_EVENT_MESSAGES).toEqual([PREMIUM, DISCOUNT, ARCHIVE, INVITE]);
	});

	it('generates three per month', () => {
		expect(SPONSORED_EVENTS_PER_MONTH).toBe(3);
	});
});

describe('sponsoredMonthOfKey', () => {
	it.each<[string, SponsoredMonth]>([
		['2026-11', { year: 2026, month: 11 }],
		['2027-01', { year: 2027, month: 1 }],
		['2026-12', { year: 2026, month: 12 }]
	])('%s → %j', (key, expected) => {
		expect(sponsoredMonthOfKey(key)).toEqual(expected);
	});
});

describe('sponsoredMonthOf — the current month in the zone (absent `month`)', () => {
	it.each<[string, string, SponsoredMonth]>([
		['2026-11-19T08:30:00.000Z', 'UTC', { year: 2026, month: 11 }],
		['2026-11-01T05:00:00.000Z', 'UTC', { year: 2026, month: 11 }],
		// Honolulu is UTC-10: 05:00Z on 1 November is still 31 October there.
		['2026-11-01T05:00:00.000Z', 'Pacific/Honolulu', { year: 2026, month: 10 }],
		// Auckland is UTC+13 in December: already New Year's Day.
		['2026-12-31T11:30:00.000Z', 'Pacific/Auckland', { year: 2027, month: 1 }],
		// New York is UTC-5 in January: still New Year's Eve.
		['2027-01-01T03:00:00.000Z', 'America/New_York', { year: 2026, month: 12 }]
	])('now %s in %s → %j', (now, zone, expected) => {
		expect(sponsoredMonthOf({ now: new Date(now), zone })).toEqual(expected);
	});
});

describe('sponsoredMonthWindow — local month start to the next month start', () => {
	it.each<[SponsoredMonth, string, string, string]>([
		[{ year: 2026, month: 11 }, 'UTC', '2026-11-01T00:00:00.000Z', '2026-12-01T00:00:00.000Z'],
		[{ year: 2026, month: 12 }, 'UTC', '2026-12-01T00:00:00.000Z', '2027-01-01T00:00:00.000Z'],
		// The golden's Honolulu row (05:00Z on 1 Nov) falls in October's window.
		[
			{ year: 2026, month: 10 },
			'Pacific/Honolulu',
			'2026-10-01T10:00:00.000Z',
			'2026-11-01T10:00:00.000Z'
		],
		[
			{ year: 2026, month: 11 },
			'Pacific/Honolulu',
			'2026-11-01T10:00:00.000Z',
			'2026-12-01T10:00:00.000Z'
		],
		// DST ends on 1 Nov 2026 at 02:00: the month opens on EDT and closes on EST.
		[
			{ year: 2026, month: 11 },
			'America/New_York',
			'2026-11-01T04:00:00.000Z',
			'2026-12-01T05:00:00.000Z'
		],
		// DST starts on 8 Mar 2026: the month opens on EST and closes on EDT.
		[
			{ year: 2026, month: 3 },
			'America/New_York',
			'2026-03-01T05:00:00.000Z',
			'2026-04-01T04:00:00.000Z'
		]
	])('%j in %s → [%s, %s)', (month, zone, fromIso, toIso) => {
		expect(sponsoredMonthWindow({ month, zone })).toEqual({ fromIso, toIso });
	});
});

describe('planSponsoredMonth — three generated Sponsored Events', () => {
	it.each<[string, SponsoredMonth, string, number[], [string, string][]]>([
		[
			'one draw per template and per day',
			{ year: 2026, month: 11 },
			'UTC',
			// tpl ⌊0×4⌋=0, day ⌊0×30⌋+1=1; tpl ⌊.25×4⌋=1, day ⌊.5×30⌋+1=16;
			// tpl ⌊.5×4⌋=2, day ⌊.96875×30⌋+1=30
			[0, 0, 0.25, 0.5, 0.5, 0.96875],
			[
				[PREMIUM, '2026-11-01T10:00:00.000Z'],
				[DISCOUNT, '2026-11-16T10:00:00.000Z'],
				[ARCHIVE, '2026-11-30T10:00:00.000Z']
			]
		],
		[
			'a repeated template is redrawn before the day is drawn',
			{ year: 2026, month: 11 },
			'UTC',
			// tpl ⌊.125×4⌋=0, day ⌊.25×30⌋+1=8;
			// tpl ⌊0×4⌋=0 taken → ⌊.875×4⌋=3, day ⌊.5×30⌋+1=16;
			// tpl ⌊.1875×4⌋=0 taken → ⌊.5×4⌋=2, day ⌊.75×30⌋+1=23
			[0.125, 0.25, 0, 0.875, 0.5, 0.1875, 0.5, 0.75],
			[
				[PREMIUM, '2026-11-08T10:00:00.000Z'],
				[INVITE, '2026-11-16T10:00:00.000Z'],
				[ARCHIVE, '2026-11-23T10:00:00.000Z']
			]
		],
		[
			'10:00 local after the fall-back (EST, UTC-5)',
			{ year: 2026, month: 11 },
			'America/New_York',
			// tpl 3, day 1; tpl 1, day ⌊.0625×30⌋+1=2; tpl 2, day 16
			[0.75, 0, 0.25, 0.0625, 0.5, 0.5],
			[
				[INVITE, '2026-11-01T15:00:00.000Z'],
				[DISCOUNT, '2026-11-02T15:00:00.000Z'],
				[ARCHIVE, '2026-11-16T15:00:00.000Z']
			]
		],
		[
			'10:00 local in daylight time (EDT, UTC-4) over a 31-day month',
			{ year: 2026, month: 10 },
			'America/New_York',
			// day ⌊.125×31⌋+1=4; ⌊.5×31⌋+1=16; ⌊.96875×31⌋+1=31
			[0, 0.125, 0.25, 0.5, 0.5, 0.96875],
			[
				[PREMIUM, '2026-10-04T14:00:00.000Z'],
				[DISCOUNT, '2026-10-16T14:00:00.000Z'],
				[ARCHIVE, '2026-10-31T14:00:00.000Z']
			]
		],
		[
			'days may repeat — only templates are drawn without repeats',
			{ year: 2026, month: 11 },
			'Pacific/Honolulu',
			[0, 0, 0.25, 0, 0.5, 0],
			[
				[PREMIUM, '2026-11-01T20:00:00.000Z'],
				[DISCOUNT, '2026-11-01T20:00:00.000Z'],
				[ARCHIVE, '2026-11-01T20:00:00.000Z']
			]
		],
		[
			'a leap February has 29 days',
			{ year: 2028, month: 2 },
			'UTC',
			// day ⌊.96875×29⌋+1=29; 1; ⌊.5×29⌋+1=15
			[0, 0.96875, 0.25, 0, 0.5, 0.5],
			[
				[PREMIUM, '2028-02-29T10:00:00.000Z'],
				[DISCOUNT, '2028-02-01T10:00:00.000Z'],
				[ARCHIVE, '2028-02-15T10:00:00.000Z']
			]
		],
		[
			'a common February has 28 days',
			{ year: 2026, month: 2 },
			'UTC',
			// day ⌊.96875×28⌋+1=28; 1; ⌊.5×28⌋+1=15
			[0, 0.96875, 0.25, 0, 0.5, 0.5],
			[
				[PREMIUM, '2026-02-28T10:00:00.000Z'],
				[DISCOUNT, '2026-02-01T10:00:00.000Z'],
				[ARCHIVE, '2026-02-15T10:00:00.000Z']
			]
		]
	])('%s', (_label, month, zone, draws, expected) => {
		const random = scripted(draws);
		const plans = planSponsoredMonth({ month, zone, random });
		expect(plans).toEqual(expected.map(([message, start]) => ({ message, start })));
		// Exactly the scripted draws, no more and no fewer.
		expect(random.left()).toBe(0);
	});

	it('keeps redrawing while the template is taken, however many times', () => {
		// tpl ⌊.75×4⌋=3, day ⌊.5×30⌋+1=16;
		// tpl 3 taken, 3 taken, ⌊.5×4⌋=2, day ⌊.75×30⌋+1=23;
		// tpl 3 taken, 2 taken, ⌊.25×4⌋=1, day 16
		const random = scripted([0.75, 0.5, 0.75, 0.75, 0.5, 0.75, 0.75, 0.5, 0.25, 0.5]);
		const plans = planSponsoredMonth({ month: { year: 2026, month: 11 }, zone: 'UTC', random });
		expect(plans).toEqual([
			{ message: INVITE, start: '2026-11-16T10:00:00.000Z' },
			{ message: ARCHIVE, start: '2026-11-23T10:00:00.000Z' },
			{ message: DISCOUNT, start: '2026-11-16T10:00:00.000Z' }
		]);
		expect(random.left()).toBe(0);
	});
});

describe('sponsoredGeneratedEventId — the virtual row id on the wire', () => {
	// The id is a hash of (owner, month, index), so its exact characters are not
	// hand-derivable; what the wire pins is the SHAPE and the stability, and
	// those are what the golden and this table hold.
	const NOVEMBER: SponsoredMonth = { year: 2026, month: 11 };

	it.each<[string, number]>([
		['owner-a', 0],
		['owner-a', 1],
		['owner-a', 2],
		['owner-b', 0]
	])('is a 15-char a-z0-9 row id for %s index %i', (ownerId, index) => {
		expect(sponsoredGeneratedEventId(ownerId, NOVEMBER, index)).toMatch(/^[a-z0-9]{15}$/);
	});

	it('is stable for the same owner, month and index', () => {
		expect(sponsoredGeneratedEventId('owner-a', NOVEMBER, 1)).toBe(
			sponsoredGeneratedEventId('owner-a', { year: 2026, month: 11 }, 1)
		);
	});

	it('differs per index, per owner and per month', () => {
		const ids = [
			sponsoredGeneratedEventId('owner-a', NOVEMBER, 0),
			sponsoredGeneratedEventId('owner-a', NOVEMBER, 1),
			sponsoredGeneratedEventId('owner-a', NOVEMBER, 2),
			sponsoredGeneratedEventId('owner-b', NOVEMBER, 0),
			sponsoredGeneratedEventId('owner-a', { year: 2026, month: 12 }, 0)
		];
		expect(new Set(ids).size).toBe(ids.length);
	});
});
