import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * The serve-time ad decision (#088).
 *
 * One field, one place: `showAdsAsEvents` on the user's settings row. There is
 * no second consent table and no "does a row exist" check — the reader used to
 * ask only whether a `userAdConsent` row existed, that table had no writer, so
 * the check could never pass and ads never rendered at all.
 */

const rows = vi.hoisted(() => ({
	userSettings: [] as unknown[],
	events: [] as unknown[],
	adConsentRecords: [] as unknown[]
}));

// Which tables the serve path actually touched, so "the record table is not
// read at serve time" is an observation rather than a claim.
const touched = vi.hoisted(() => ({
	read: [] as string[],
	written: [] as string[]
}));

// oxlint-disable-next-line anti-slop/no-module-mocking -- scripts the drizzle
// query-builder to pin the serve-time decision without a live Postgres; a
// real-Postgres harness is tracked in docs/issues/002.
vi.mock('$lib/server/db', async () => {
	const { getTableName } = await import('drizzle-orm');
	const nameOf = (table: unknown) => getTableName(table as never);
	const where = (table: unknown) => {
		const name = nameOf(table);
		touched.read.push(name);
		const p = Promise.resolve(rows[name as keyof typeof rows] ?? []) as Promise<unknown[]>;
		return Object.assign(p, { orderBy: () => p });
	};
	return {
		db: {
			select: () => ({ from: (table: unknown) => ({ where: () => where(table) }) }),
			insert: (table: unknown) => ({
				values: () => {
					touched.written.push(nameOf(table));
					return { returning: () => Promise.resolve([]) };
				}
			})
		}
	};
});

import { shouldServeAds, userAllowsAds, generateAdEventsForMonth } from './adService';

/** A settings row carrying only the ad field, as the gate reads it. */
function settingsRow(showAdsAsEvents: boolean | null): unknown[] {
	return [{ userId: 'u1', timeZone: 'UTC', showAdsAsEvents }];
}

beforeEach(() => {
	rows.userSettings = [];
	rows.events = [];
	rows.adConsentRecords = [];
	touched.read = [];
	touched.written = [];
});

describe('shouldServeAds — the serve-time decision, one field', () => {
	it('serves ads when, and only when, the one field is true', () => {
		expect(shouldServeAds({ showAdsAsEvents: true })).toBe(true);
	});

	it('withholds ads when the field is false or null', () => {
		expect(shouldServeAds({ showAdsAsEvents: false })).toBe(false);
		expect(shouldServeAds({ showAdsAsEvents: null })).toBe(false);
	});

	it('withholds ads when the user has no settings row at all', () => {
		// No row = no record of consent = no ads. A missing row must never
		// read as consent, which is the failure this ticket exists to remove.
		expect(shouldServeAds(undefined)).toBe(false);
		expect(shouldServeAds(null)).toBe(false);
		expect(shouldServeAds({})).toBe(false);
	});

	it('ignores every other field on the settings row', () => {
		// Passed as a variable so TS does not excess-property-check it: the
		// point is that a row full of other preferences cannot grant consent.
		const row = { showAdsAsEvents: false, showAdMarkers: true, personalizedAds: true, weekStart: 'monday' };
		expect(shouldServeAds(row)).toBe(false);
	});
});

describe('userAllowsAds — the same decision, resolved from the database', () => {
	it('is true only for a row that opts in', async () => {
		rows.userSettings = settingsRow(true);
		expect(await userAllowsAds('u1')).toBe(true);
	});

	it('is false for a user with no settings row', async () => {
		expect(await userAllowsAds('u1')).toBe(false);
	});
});

describe('generateAdEventsForMonth — consent withheld means no ads', () => {
	it('returns nothing and reads no events when the field is not set', async () => {
		rows.userSettings = settingsRow(false);
		expect(await generateAdEventsForMonth({ userId: 'u1', month: 9, year: 2026 })).toEqual([]);
	});

	it('returns nothing when the user has no settings row', async () => {
		expect(await generateAdEventsForMonth({ userId: 'u1', month: 9, year: 2026 })).toEqual([]);
	});

	it('serves sponsored items once that one field is true', async () => {
		rows.userSettings = settingsRow(true);
		const ads = await generateAdEventsForMonth({ userId: 'u1', month: 9, year: 2026 });
		expect(ads.length).toBeGreaterThan(0);
		for (const ad of ads) {
			expect(ad.adType).toBe('sponsored');
		}
	});
});

/**
 * The consent RECORD added beside the setting must not move the gate (#088).
 * These are the tests that make "nothing about what renders changes" an
 * assertion rather than a promise: same rows, same output, whatever the record
 * table happens to hold.
 */
describe('the consent record does not gate anything', () => {
	/** A user who once consented, then withdrew — evidence, not a setting. */
	function consentHistory(): unknown[] {
		return [
			{ userId: 'u1', decision: 'granted', recordedAt: new Date('2026-01-01') },
			{ userId: 'u1', decision: 'withdrawn', recordedAt: new Date('2026-02-01') }
		];
	}

	it('serves ads exactly as before when the field is true and records exist', async () => {
		rows.adConsentRecords = consentHistory();
		rows.userSettings = settingsRow(true);

		// Byte-for-byte the same decision as with an empty record table.
		expect(shouldServeAds({ showAdsAsEvents: true })).toBe(true);
		expect(await userAllowsAds('u1')).toBe(true);
		const ads = await generateAdEventsForMonth({ userId: 'u1', month: 9, year: 2026 });
		expect(ads.length).toBeGreaterThan(0);
	});

	it('withholds ads exactly as before when the field is false and records exist', async () => {
		// The strongest form: a `granted` record on file, but the setting says
		// no. A record is evidence of a past event, never a live permission.
		rows.adConsentRecords = consentHistory();
		rows.userSettings = settingsRow(false);

		expect(shouldServeAds({ showAdsAsEvents: false })).toBe(false);
		expect(await userAllowsAds('u1')).toBe(false);
		expect(await generateAdEventsForMonth({ userId: 'u1', month: 9, year: 2026 })).toEqual([]);
	});

	it('never reads the record table to make the decision', async () => {
		rows.adConsentRecords = consentHistory();
		rows.userSettings = settingsRow(true);
		await generateAdEventsForMonth({ userId: 'u1', month: 9, year: 2026 });

		// The gate is settings-only: no consent-record SELECT on the read path.
		expect(touched.read).not.toContain('adConsentRecords');
	});

	it('writes no consent record when ads are served', async () => {
		// A record is evidence of a DECISION. Serving an ad is not a decision,
		// so it must leave the trail untouched — otherwise the history is a log.
		rows.userSettings = settingsRow(true);
		await generateAdEventsForMonth({ userId: 'u1', month: 9, year: 2026 });
		await userAllowsAds('u1');

		expect(touched.written).not.toContain('adConsentRecords');
	});
});
