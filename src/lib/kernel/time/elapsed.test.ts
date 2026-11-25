/**
 * `elapsedAgo` against Luxon's `toRelative()`, which it replaced: literal
 * tables for the unit boundaries, the calendar steps and the refusals, then the
 * Luxon oracle itself over every stamp form, DST days in four zones, both
 * locale paths and a few hundred seeded random instants. Luxon stays a
 * dependency of the app; only this test imports it, as the reference.
 *
 * Doc: src/lib/kernel/README.md#time
 */
import { DateTime } from 'luxon';
import { describe, expect, it } from 'vitest';
import { elapsedAgo } from './elapsed';

const NOW_TEXT = '2026-03-01T09:00:00.000Z';
const NOW = new Date(NOW_TEXT);
const EN = { locale: 'en-US' };

/** What the legacy `activityAgo` answered: Luxon's two parsers, then `toRelative` against `now`. */
function luxonAgo(at: string, now: Date, zone?: string, locale?: string): string {
	const parse = zone ? { zone } : {};
	let instant = DateTime.fromISO(at, parse);
	if (!instant.isValid) instant = DateTime.fromSQL(at, parse);
	if (!instant.isValid) return '';
	return instant.toRelative({ base: DateTime.fromJSDate(now, parse), ...(locale ? { locale } : {}) }) ?? '';
}

/** Small seeded generator (mulberry32): the random cases are the same on every run. */
function seeded(seed: number): () => number {
	let state = seed;
	return () => {
		state = (state + 0x6d2b79f5) | 0;
		let t = Math.imul(state ^ (state >>> 15), 1 | state);
		t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
		return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
	};
}

const pad = (value: number, width = 2) => String(value).padStart(width, '0');

/** Every spelling of one instant the activity rows can carry. */
function spellings(ts: number, random: () => number): string[] {
	const iso = new Date(ts).toISOString();
	const offsetMinutes = [-480, -300, 0, 60, 330, 765][Math.floor(random() * 6)];
	const sign = offsetMinutes < 0 ? '-' : '+';
	const offset = `${sign}${pad(Math.floor(Math.abs(offsetMinutes) / 60))}:${pad(Math.abs(offsetMinutes) % 60)}`;
	const wall = new Date(ts + offsetMinutes * 60_000).toISOString();
	return [
		iso,
		iso.replace('.000Z', 'Z'),
		`${wall.slice(0, 19)}${offset}`,
		`${wall.slice(0, 19).replace('T', ' ')}${offset}`,
		`${iso.slice(0, 19).replace('T', ' ')}+00`,
		`${iso.slice(0, 10)} ${iso.slice(11, 23)}123+00`,
		iso.slice(0, 19),
		iso.slice(0, 10)
	];
}

describe('elapsedAgo: unit boundaries', () => {
	const at = (ms: number) => new Date(NOW.getTime() + ms).toISOString();
	const SECOND = 1000;
	const MINUTE = 60 * SECOND;
	const HOUR = 60 * MINUTE;
	const DAY = 24 * HOUR;

	it.each<[string, string, string]>([
		['the same instant is "in 0 seconds"', at(0), 'in 0 seconds'],
		['half a second ago is "0 seconds ago"', at(-500), '0 seconds ago'],
		['half a second ahead is "in 0 seconds"', at(500), 'in 0 seconds'],
		['999 ms ago is still 0 seconds', at(-999), '0 seconds ago'],
		['one second ago, singular', at(-SECOND), '1 second ago'],
		['one second ahead, singular', at(SECOND), 'in 1 second'],
		['59.9 seconds truncates to 59', at(-59_900), '59 seconds ago'],
		['60 seconds is a minute', at(-MINUTE), '1 minute ago'],
		['90 seconds truncates to one minute', at(-90 * SECOND), '1 minute ago'],
		['59 min 59 s is 59 minutes', at(-(HOUR - SECOND)), '59 minutes ago'],
		['an hour', at(-HOUR), '1 hour ago'],
		['an hour ahead', at(HOUR), 'in 1 hour'],
		['23 h 59 min is 23 hours', at(-(DAY - MINUTE)), '23 hours ago'],
		['a day', at(-DAY), '1 day ago'],
		['a day ahead', at(DAY), 'in 1 day'],
		['a day and a half truncates to 1 day', at(-1.5 * DAY), '1 day ago'],
		['27 days stays days', at(-27 * DAY), '27 days ago'],
		['29 days back from Mar 1 is already a month (Jan 31 + 1 month = Feb 28)', at(-29 * DAY), '1 month ago'],
		['3 days ahead', at(3 * DAY), 'in 3 days']
	])('%s', (_title, instant, expected) => {
		expect(elapsedAgo(instant, NOW, EN)).toBe(expected);
		expect(luxonAgo(instant, NOW, undefined, 'en-US')).toBe(expected);
	});
});

describe('elapsedAgo: calendar steps', () => {
	it.each<[string, string, string, string]>([
		['Jan 31 → Mar 1 is one month (Feb clamps to the 28th)', '2026-01-31T09:00:00Z', '2026-03-01T09:00:00Z', '1 month ago'],
		['Jan 30 → Mar 1 is one month', '2026-01-30T09:00:00Z', '2026-03-01T09:00:00Z', '1 month ago'],
		['Mar 1 seen from Jan 31 is "in 1 month"', '2026-03-01T09:00:00Z', '2026-01-31T09:00:00Z', 'in 1 month'],
		['a year to the second', '2025-03-01T09:00:00Z', '2026-03-01T09:00:00Z', '1 year ago'],
		['a second short of a year is 11 months', '2025-03-01T09:00:01Z', '2026-03-01T09:00:00Z', '11 months ago'],
		['a leap day plus one year lands on Feb 28', '2024-02-29T09:00:00Z', '2025-02-28T09:00:00Z', '1 year ago'],
		['two years ahead', '2028-03-01T09:00:00Z', '2026-03-01T09:00:00Z', 'in 2 years'],
		['Dec 31 → Jan 1 is a day', '2025-12-31T23:00:00Z', '2026-01-01T23:00:00Z', '1 day ago'],
		['Dec 31 → Jan 1 an hour later is an hour', '2025-12-31T23:30:00Z', '2026-01-01T00:30:00Z', '1 hour ago']
	])('%s', (_title, instant, now, expected) => {
		expect(elapsedAgo(instant, new Date(now), EN)).toBe(expected);
		expect(luxonAgo(instant, new Date(now), undefined, 'en-US')).toBe(expected);
	});
});

describe('elapsedAgo: the stamp forms', () => {
	it.each<[string, string, string]>([
		['ISO with Z', '2026-02-26T09:00:00.000Z', '3 days ago'],
		['ISO with Z, no fraction', '2026-02-26T09:00:00Z', '3 days ago'],
		['ISO with a negative offset', '2026-02-26T04:00:00-05:00', '3 days ago'],
		['ISO with a half-hour offset', '2026-02-26T14:30:00+05:30', '3 days ago'],
		['ISO with a compact offset', '2026-02-26T14:30:00+0530', '3 days ago'],
		['ISO with an hour-only offset', '2026-02-26T10:00:00+01', '3 days ago'],
		['ISO without an offset is wall-clock time (UTC here)', '2026-02-26T09:00:00', '3 days ago'],
		['ISO without seconds', '2026-02-26T09:00', '3 days ago'],
		['a date alone is that day at midnight', '2026-02-26', '3 days ago'],
		['a compact date', '20260226T0900', '3 days ago'],
		['Postgres text with a short offset', '2026-02-01 10:00:00+00', '27 days ago'],
		['Postgres text in the future', '2026-03-04 09:00:00+00', 'in 3 days'],
		['Postgres text with microseconds', '2026-02-26 09:00:00.123456+00', '2 days ago'],
		['Postgres text with a full offset', '2026-02-26 14:30:00+05:30', '3 days ago'],
		['Postgres text without an offset', '2026-02-26 09:00:00', '3 days ago'],
		['24:00 is midnight of the next day', '2026-02-28T24:00:00', '9 hours ago']
	])('%s', (_title, instant, expected) => {
		expect(elapsedAgo(instant, NOW, EN)).toBe(expected);
		expect(luxonAgo(instant, NOW, undefined, 'en-US')).toBe(expected);
	});

	it.each<[string, string]>([
		['empty', ''],
		['words', 'not a date'],
		['a prose date', 'November 14, 2026'],
		['a day that does not exist', '2026-02-30'],
		['a leap day in a common year', '2026-02-29T10:00:00Z'],
		['month 13', '2026-13-01T10:00:00Z'],
		['month 0', '2026-00-10'],
		['hour 25', '2026-02-01T25:00:00Z'],
		['minute 60', '2026-02-01T10:60:00Z'],
		['second 60', '2026-02-01T10:00:60Z'],
		['24:00:01', '2026-02-01T24:00:01Z'],
		['a lower-case t', '2026-02-01t10:00:00Z'],
		['a space with the date compact', '20260201 10:00:00'],
		['trailing text', '2026-02-01T10:00:00Z later'],
		['an age', '2 days ago']
	])('prints nothing for %s, as luxon did', (_title, instant) => {
		expect(elapsedAgo(instant, NOW, EN)).toBe('');
		expect(luxonAgo(instant, NOW)).toBe('');
	});

	it('prints nothing for an invalid `now` or an unknown zone', () => {
		expect(elapsedAgo('2026-02-26T09:00:00Z', new Date(Number.NaN), EN)).toBe('');
		expect(elapsedAgo('2026-02-26T09:00:00Z', NOW, { zone: 'Not/AZone' })).toBe('');
		expect(elapsedAgo('2026-02-26T09:00:00Z', NOW, { zone: '' })).toBe('');
	});
});

describe('elapsedAgo: against luxon', () => {
	const NEW_YORK = 'America/New_York';

	it('answers luxon in the runtime locale and zone for every spelling of random instants', () => {
		const random = seeded(20260301);
		const threeYears = 3 * 365 * 86_400_000;
		let compared = 0;
		for (let i = 0; i < 250; i++) {
			const ts = NOW.getTime() + Math.round((random() * 2 - 1) * threeYears);
			for (const stamp of spellings(ts, random)) {
				expect(elapsedAgo(stamp, NOW), stamp).toBe(luxonAgo(stamp, NOW));
				compared += 1;
			}
		}
		expect(compared).toBe(2000);
	});

	it('answers luxon across every unit scale, forward and back', () => {
		const random = seeded(7);
		for (let i = 0; i < 600; i++) {
			// 1 ms to ~1.5 years either way, log-uniform, so every unit gets a share.
			const delta = Math.round(10 ** (random() * 10.7)) * (random() < 0.5 ? -1 : 1);
			const now = new Date(NOW.getTime() + Math.round(random() * 86_400_000 * 400));
			const stamp = new Date(now.getTime() + delta).toISOString();
			expect(elapsedAgo(stamp, now), `${stamp} @ ${now.toISOString()}`).toBe(luxonAgo(stamp, now));
		}
	});

	it('reads the runtime zone as UTC under vitest, so an explicit UTC zone changes nothing', () => {
		const random = seeded(99);
		for (let i = 0; i < 100; i++) {
			const ts = NOW.getTime() + Math.round((random() * 2 - 1) * 400 * 86_400_000);
			for (const stamp of spellings(ts, random)) {
				expect(elapsedAgo(stamp, NOW, { zone: 'UTC' }), stamp).toBe(elapsedAgo(stamp, NOW));
			}
		}
	});

	it.each(['en-US', 'en', 'de-DE', 'fr-FR', 'ja-JP'])('speaks %s the way luxon does', (locale) => {
		const random = seeded(31);
		for (let i = 0; i < 80; i++) {
			const delta = Math.round(10 ** (random() * 10)) * (random() < 0.5 ? -1 : 1);
			const stamp = new Date(NOW.getTime() + delta).toISOString();
			expect(elapsedAgo(stamp, NOW, { locale }), stamp).toBe(luxonAgo(stamp, NOW, undefined, locale));
		}
	});

	it.each(['America/New_York', 'Europe/London', 'Pacific/Auckland', 'Asia/Kolkata'])(
		'matches luxon in %s for offset-bearing stamps all year',
		(zone) => {
			const random = seeded(zone.length * 1013);
			for (let i = 0; i < 120; i++) {
				const now = new Date(NOW.getTime() + Math.round((random() * 2 - 1) * 365 * 86_400_000));
				const delta = Math.round(10 ** (random() * 10.2)) * (random() < 0.5 ? -1 : 1);
				const ts = now.getTime() + delta;
				for (const stamp of spellings(ts, random).slice(0, 6)) {
					expect(elapsedAgo(stamp, now, { zone, ...EN }), `${stamp} @ ${now.toISOString()}`).toBe(
						luxonAgo(stamp, now, zone, 'en-US')
					);
				}
			}
		}
	);

	it('matches luxon for wall-clock stamps in New York away from the 02:00 changeovers', () => {
		const random = seeded(4242);
		for (let i = 0; i < 300; i++) {
			const day = new Date(Date.UTC(2025, 6, 1) + Math.floor(random() * 700) * 86_400_000);
			const hour = 4 + Math.floor(random() * 19);
			const stamp = `${day.toISOString().slice(0, 10)}T${pad(hour)}:${pad(Math.floor(random() * 60))}:00`;
			const now = new Date(NOW.getTime() + Math.round((random() * 2 - 1) * 400 * 86_400_000));
			expect(elapsedAgo(stamp, now, { zone: NEW_YORK, ...EN }), stamp).toBe(
				luxonAgo(stamp, now, NEW_YORK, 'en-US')
			);
			expect(elapsedAgo(stamp.replace('T', ' '), now, { zone: NEW_YORK, ...EN }), stamp).toBe(
				luxonAgo(stamp.replace('T', ' '), now, NEW_YORK, 'en-US')
			);
		}
	});
});

describe('elapsedAgo: daylight saving', () => {
	const NEW_YORK = 'America/New_York';

	it.each<[string, string, string, string]>([
		// Spring forward, 2026-03-08 02:00 → 03:00: the day is 23 hours long but still "1 day".
		['23 elapsed hours across spring-forward are one calendar day', '2026-03-08T00:00:00-05:00', '2026-03-09T00:00:00-04:00', '1 day ago'],
		['24 elapsed hours across spring-forward are one day', '2026-03-08T00:00:00-05:00', '2026-03-09T01:00:00-04:00', '1 day ago'],
		['21 elapsed hours across spring-forward are hours', '2026-03-08T01:00:00-05:00', '2026-03-08T23:00:00-04:00', '21 hours ago'],
		// Fall back, 2026-11-01 02:00 → 01:00: a 25-hour day.
		['25 elapsed hours across fall-back are one calendar day', '2026-11-01T00:00:00-04:00', '2026-11-02T00:00:00-05:00', '1 day ago'],
		['24 elapsed hours across fall-back are short of the same wall time', '2026-11-01T00:00:00-04:00', '2026-11-01T23:00:00-05:00', '24 hours ago'],
		['wall-clock stamps use the zone offset of the day', '2026-07-01T12:00:00', '2026-07-03T16:00:00Z', '2 days ago'],
		['a winter wall-clock stamp', '2026-01-15T12:00:00', '2026-01-17T17:00:00Z', '2 days ago']
	])('%s', (_title, instant, now, expected) => {
		const options = { zone: NEW_YORK, ...EN };
		expect(elapsedAgo(instant, new Date(now), options)).toBe(expected);
		expect(luxonAgo(instant, new Date(now), NEW_YORK, 'en-US')).toBe(expected);
	});

	it.each<[string, string]>([
		['America/New_York', '2026-03-08T07:00:00Z'],
		['America/New_York', '2026-11-01T06:00:00Z'],
		['Europe/London', '2026-03-29T01:00:00Z'],
		['Europe/London', '2026-10-25T01:00:00Z'],
		['Pacific/Auckland', '2026-04-04T14:00:00Z'],
		['Pacific/Auckland', '2026-09-26T14:00:00Z'],
		['Australia/Lord_Howe', '2026-04-04T15:00:00Z']
	])('%s: every instant near the %s changeover, from three `now`s', (zone, changeover) => {
		const center = new Date(changeover).getTime();
		const nows = [center, center + 36 * 3_600_000, center - 29 * 3_600_000].map((ms) => new Date(ms));
		for (const now of nows) {
			for (let step = -80; step <= 80; step++) {
				const stamp = new Date(center + step * 37 * 60_000 + 11_000).toISOString();
				expect(elapsedAgo(stamp, now, { zone, ...EN }), `${stamp} @ ${now.toISOString()}`).toBe(
					luxonAgo(stamp, now, zone, 'en-US')
				);
			}
		}
	});
});
