/**
 * The sponsored repo against real Postgres: the consent append and its
 * newest-first read, and the `adEvents` prune (anchor and cutoff edge). Each
 * test runs in `rollbackTest`, so the rows it seeds vanish afterwards; writes
 * are given their timestamps, so the tests assert them instead of a clock. The
 * module reads no foreign table (owner Q-040 B), so no window read is tested
 * here.
 *
 * Doc: ./README.md#how-to-test
 */
import { eq } from 'drizzle-orm';
import { describe, expect } from 'vitest';
import { adConsentRecords, adEvents } from '$lib/kernel/db/tables.server';
import { seedUser } from '$lib/kernel/testing/seedRows.server';
import { rollbackTest } from '$lib/kernel/testing/testDb.server';
import { seedAdConsentRecord, seedAdEvent } from './sponsored.fixtures.server';
import {
	deleteAdEventsCreatedBefore,
	insertSponsoredConsentRecord,
	listSponsoredConsentRecords
} from './sponsored.repo.server';

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
