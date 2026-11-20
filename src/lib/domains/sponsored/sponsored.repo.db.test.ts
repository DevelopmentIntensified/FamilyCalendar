/**
 * The sponsored repo against real Postgres: the own-📢 month read (owner,
 * marker, window edges, order, columns), the consent append and its
 * newest-first read, and the `adEvents` prune (anchor and cutoff edge). Each
 * test runs in `rollbackTest`, so the rows it seeds vanish afterwards; writes
 * are given their timestamps, so the tests assert them instead of a clock.
 *
 * Doc: ./README.md#how-to-test
 */
import { eq } from 'drizzle-orm';
import { describe, expect } from 'vitest';
import { adConsentRecords, adEvents } from '$lib/kernel/db/tables.server';
import { seedUser } from '$lib/kernel/testing/seedRows.server';
import { rollbackTest } from '$lib/kernel/testing/testDb.server';
import { toInstantString } from '$lib/kernel/time/dates';
import {
	seedAdConsentRecord,
	seedAdEvent,
	seedOwnedSponsoredEvent
} from './sponsored.fixtures.server';
import {
	deleteAdEventsCreatedBefore,
	insertSponsoredConsentRecord,
	listOwnedSponsoredEventRows,
	listSponsoredConsentRecords
} from './sponsored.repo.server';

const NOVEMBER = { fromIso: '2026-11-01T00:00:00.000Z', toIso: '2026-12-01T00:00:00.000Z' };

describe('listOwnedSponsoredEventRows', () => {
	rollbackTest(
		"keeps the user's own 📢 rows inside [from, to), in start order, four columns",
		async (db) => {
			const user = await seedUser(db);
			const other = await seedUser(db);
			// In: owned, marker first, inside the window (seeded out of order).
			await seedOwnedSponsoredEvent(db, {
				id: 'late',
				ownerId: user.id,
				title: '📢 Later',
				start: '2026-11-20T10:00:00.000Z'
			});
			await seedOwnedSponsoredEvent(db, {
				id: 'early',
				ownerId: user.id,
				title: '📢 Earlier',
				description: 'Ends Friday',
				start: '2026-11-03T10:00:00.000Z'
			});
			// In: exactly at the window start (inclusive).
			await seedOwnedSponsoredEvent(db, {
				id: 'atstart',
				ownerId: user.id,
				title: '📢 At start',
				start: '2026-11-01T00:00:00.000Z'
			});
			// Out: exactly at the window end (exclusive), and a second before the start.
			await seedOwnedSponsoredEvent(db, {
				id: 'atend',
				ownerId: user.id,
				title: '📢 At end',
				start: '2026-12-01T00:00:00.000Z'
			});
			await seedOwnedSponsoredEvent(db, {
				id: 'before',
				ownerId: user.id,
				title: '📢 Before',
				start: '2026-10-31T23:59:59.000Z'
			});
			// Out: no marker, the marker not first, a leading space.
			await seedOwnedSponsoredEvent(db, {
				id: 'plain',
				ownerId: user.id,
				title: 'Dentist',
				start: '2026-11-08T09:00:00.000Z'
			});
			await seedOwnedSponsoredEvent(db, {
				id: 'inner',
				ownerId: user.id,
				title: 'Sale 📢',
				start: '2026-11-09T09:00:00.000Z'
			});
			await seedOwnedSponsoredEvent(db, {
				id: 'leading',
				ownerId: user.id,
				title: ' 📢 Leading space',
				start: '2026-11-10T09:00:00.000Z'
			});
			// Out: another user's 📢 row in the window.
			await seedOwnedSponsoredEvent(db, {
				id: 'others',
				ownerId: other.id,
				title: '📢 Not yours',
				start: '2026-11-05T10:00:00.000Z'
			});

			const rows = await listOwnedSponsoredEventRows(db, { ownerId: user.id, ...NOVEMBER });

			expect(rows.map((row) => Object.keys(row).sort())).toEqual([
				['description', 'id', 'start', 'title'],
				['description', 'id', 'start', 'title'],
				['description', 'id', 'start', 'title']
			]);
			expect(rows.map((row) => ({ ...row, start: toInstantString(row.start) }))).toEqual([
				{
					id: 'atstart',
					title: '📢 At start',
					description: null,
					start: '2026-11-01T00:00:00.000Z'
				},
				{
					id: 'early',
					title: '📢 Earlier',
					description: 'Ends Friday',
					start: '2026-11-03T10:00:00.000Z'
				},
				{ id: 'late', title: '📢 Later', description: null, start: '2026-11-20T10:00:00.000Z' }
			]);
		}
	);

	rollbackTest('windows on the stored instant, whatever offset it was written with', async (db) => {
		const user = await seedUser(db);
		// 05:00Z on 1 November: inside November in UTC, October in Honolulu.
		await seedOwnedSponsoredEvent(db, {
			id: 'island',
			ownerId: user.id,
			title: '📢 Island time',
			start: '2026-10-31T19:00:00-10:00'
		});

		const october = await listOwnedSponsoredEventRows(db, {
			ownerId: user.id,
			fromIso: '2026-10-01T10:00:00.000Z',
			toIso: '2026-11-01T10:00:00.000Z'
		});
		const novemberUtc = await listOwnedSponsoredEventRows(db, { ownerId: user.id, ...NOVEMBER });
		const novemberHonolulu = await listOwnedSponsoredEventRows(db, {
			ownerId: user.id,
			fromIso: '2026-11-01T10:00:00.000Z',
			toIso: '2026-12-01T10:00:00.000Z'
		});

		expect(october.map((row) => row.id)).toEqual(['island']);
		expect(novemberUtc.map((row) => row.id)).toEqual(['island']);
		expect(novemberHonolulu).toEqual([]);
		expect(toInstantString(october[0].start)).toBe('2026-11-01T05:00:00.000Z');
	});

	rollbackTest('returns nothing for a month without own 📢 rows', async (db) => {
		const user = await seedUser(db);
		await seedOwnedSponsoredEvent(db, {
			ownerId: user.id,
			title: 'Dentist',
			start: '2026-11-08T09:00:00.000Z'
		});
		expect(await listOwnedSponsoredEventRows(db, { ownerId: user.id, ...NOVEMBER })).toEqual([]);
	});
});

describe('consent trail', () => {
	rollbackTest(
		'insertSponsoredConsentRecord appends the decision with the given recordedAt',
		async (db) => {
			const user = await seedUser(db);
			const recordedAt = new Date('2026-11-19T08:30:00.000Z');

			const row = await insertSponsoredConsentRecord(db, {
				userId: user.id,
				decision: 'withdrawn',
				recordedAt
			});

			expect(row.userId).toBe(user.id);
			expect(row.decision).toBe('withdrawn');
			expect(row.recordedAt.getTime()).toBe(recordedAt.getTime());
			const stored = await db
				.select()
				.from(adConsentRecords)
				.where(eq(adConsentRecords.userId, user.id));
			expect(stored.map((record) => [record.id, record.decision, record.recordedAt.getTime()])).toEqual(
				[[row.id, 'withdrawn', recordedAt.getTime()]]
			);
		}
	);

	rollbackTest('insertSponsoredConsentRecord appends rather than replacing', async (db) => {
		// Legacy case: adConsentService.test.ts:128 "appends rather than replacing, so history survives".
		const user = await seedUser(db);
		await insertSponsoredConsentRecord(db, {
			userId: user.id,
			decision: 'granted',
			recordedAt: new Date('2026-01-01T00:00:00.000Z')
		});
		await insertSponsoredConsentRecord(db, {
			userId: user.id,
			decision: 'withdrawn',
			recordedAt: new Date('2026-02-01T00:00:00.000Z')
		});
		await insertSponsoredConsentRecord(db, {
			userId: user.id,
			decision: 'granted',
			recordedAt: new Date('2026-03-01T00:00:00.000Z')
		});

		const stored = await db
			.select()
			.from(adConsentRecords)
			.where(eq(adConsentRecords.userId, user.id));
		expect(stored).toHaveLength(3);
	});

	rollbackTest(
		"listSponsoredConsentRecords returns only the user's trail, newest first",
		async (db) => {
			// Legacy case: adConsentService.test.ts:151 "returns the whole trail, newest first" —
			// seeded oldest-first and out of order, so a read that forgot to order fails.
			const user = await seedUser(db);
			const other = await seedUser(db);
			const january = await seedAdConsentRecord(db, {
				userId: user.id,
				decision: 'granted',
				recordedAt: new Date('2026-01-01T00:00:00.000Z')
			});
			const march = await seedAdConsentRecord(db, {
				userId: user.id,
				decision: 'withdrawn',
				recordedAt: new Date('2026-03-01T00:00:00.000Z')
			});
			const february = await seedAdConsentRecord(db, {
				userId: user.id,
				decision: 'granted',
				recordedAt: new Date('2026-02-01T00:00:00.000Z')
			});
			await seedAdConsentRecord(db, {
				userId: other.id,
				decision: 'granted',
				recordedAt: new Date('2026-04-01T00:00:00.000Z')
			});

			const trail = await listSponsoredConsentRecords(db, user.id);

			expect(trail.map((record) => record.id)).toEqual([march.id, february.id, january.id]);
			expect(trail.map((record) => record.decision)).toEqual(['withdrawn', 'granted', 'granted']);
		}
	);

	rollbackTest('listSponsoredConsentRecords is empty for a user who never decided', async (db) => {
		// Legacy case: adConsentService.test.ts:167 "is empty for a user who has never consented".
		const user = await seedUser(db);
		expect(await listSponsoredConsentRecords(db, user.id)).toEqual([]);
	});
});

describe('deleteAdEventsCreatedBefore', () => {
	const cutoff = new Date('2026-08-21T04:00:00.000Z');

	rollbackTest(
		'deletes ad rows created before the cutoff and returns the count',
		async (db) => {
			// Legacy cases: adEvents.prune.test.ts:90 (returns the count), :95 (only rows created
			// before the cutoff). The anchor is createdAt: an old row scheduled for the future
			// goes, a new row scheduled long ago stays.
			const oldCreatedFutureScheduled = await seedAdEvent(db, {
				createdAt: new Date('2026-05-01T00:00:00.000Z'),
				scheduledFor: new Date('2026-12-01T10:00:00.000Z')
			});
			const oldCreated = await seedAdEvent(db, {
				createdAt: new Date('2026-08-21T03:59:59.000Z')
			});
			const newCreatedPastScheduled = await seedAdEvent(db, {
				createdAt: new Date('2026-09-01T00:00:00.000Z'),
				scheduledFor: new Date('2025-01-01T10:00:00.000Z')
			});

			expect(await deleteAdEventsCreatedBefore(db, cutoff)).toBe(2);
			const remaining = (await db.select({ id: adEvents.id }).from(adEvents)).map((row) => row.id);
			expect(remaining).toContain(newCreatedPastScheduled.id);
			expect(remaining).not.toContain(oldCreatedFutureScheduled.id);
			expect(remaining).not.toContain(oldCreated.id);
		}
	);

	rollbackTest('keeps rows created at or after the cutoff', async (db) => {
		const atCutoff = await seedAdEvent(db, { createdAt: cutoff });
		const after = await seedAdEvent(db, { createdAt: new Date('2026-08-21T04:00:01.000Z') });

		expect(await deleteAdEventsCreatedBefore(db, cutoff)).toBe(0);
		const remaining = (await db.select({ id: adEvents.id }).from(adEvents)).map((row) => row.id);
		expect(remaining).toEqual(expect.arrayContaining([atCutoff.id, after.id]));
	});
});
