/**
 * app retention against real Postgres: `runRetention(ctx)` seeds an old and a
 * new row per table (plus each table's boundary and the rows a rule must
 * never touch) and asserts exactly the old ones are gone, with the counts the
 * cleanup cron's body reports.
 *
 * Windows: Anonymous Accounts inactive 90d, read notifications 90d, resolved
 * phrases and closed bug reports 180d, ad events 90d, expired claim tokens at
 * once. The cutoff edges are the repos' (`lt`, strict): a row exactly at the
 * cutoff survives.
 *
 * Rows are seeded through `$lib/kernel/db/tables.server` (a `*.db.test.ts` may
 * import it, R3) rather than another module's fixtures, so this file pins the
 * cleanup against the tables themselves. The guest marker is identity's rule.
 *
 * Doc: ./README.md#how-to-test
 */
import type { Db } from '$lib/kernel/db/database.server';
import { eq } from 'drizzle-orm';
import { describe, expect } from 'vitest';
import {
	adEvents,
	bugReports,
	claimTokens,
	notifications,
	tasks,
	unmatchedPhrases,
	users
} from '$lib/kernel/db/tables.server';
import { seedUser } from '$lib/kernel/testing/seedRows.server';
import { rollbackTest } from '$lib/kernel/testing/testDb.server';
import { testCtx } from '$lib/kernel/testing/testCtx.server';
import { ANONYMOUS_EMAIL_DOMAIN } from '$lib/domains/identity/identity.person.rules';
import { runRetention } from './retention.server';

const NOW = new Date('2026-06-01T12:00:00.000Z');
const DAY_MS = 24 * 60 * 60 * 1000;

/** `days` before NOW (negative is after). */
function daysBefore(days: number): Date {
	return new Date(NOW.getTime() - days * DAY_MS);
}

async function userIds(db: Db): Promise<string[]> {
	const rows = await db.select({ id: users.id }).from(users);
	return rows.map((row) => row.id).sort();
}

describe('runRetention', () => {
	rollbackTest('deletes every row past its window and keeps the rest', async (db) => {
		const ctx = testCtx({ db, now: NOW.toISOString() });

		const staleGuest = await seedUser(db, {
			firstName: 'Guest',
			email: `stale${ANONYMOUS_EMAIL_DOMAIN}`,
			lastActiveAt: daysBefore(91)
		});
		const activeGuest = await seedUser(db, {
			firstName: 'Guest',
			email: `active${ANONYMOUS_EMAIL_DOMAIN}`,
			lastActiveAt: daysBefore(89)
		});
		const edgeGuest = await seedUser(db, {
			firstName: 'Guest',
			email: `edge${ANONYMOUS_EMAIL_DOMAIN}`,
			lastActiveAt: daysBefore(90)
		});
		const idleRegistered = await seedUser(db, {
			email: 'idle@example.test',
			lastActiveAt: daysBefore(400)
		});

		await db
			.insert(notifications)
			.values({
				userId: activeGuest.id,
				type: 'task_completed',
				actorName: 'Sam',
				message: 'completed "Bins"',
				readAt: daysBefore(91).toISOString(),
				createdAt: daysBefore(120).toISOString()
			});
		const newRead = await db
			.insert(notifications)
			.values({
				userId: activeGuest.id,
				type: 'task_completed',
				actorName: 'Sam',
				message: 'completed "Bins"',
				readAt: daysBefore(89).toISOString(),
				createdAt: daysBefore(120).toISOString()
			})
			.returning({ id: notifications.id });
		const oldUnread = await db
			.insert(notifications)
			.values({
				userId: activeGuest.id,
				type: 'family_joined',
				actorName: 'Sam',
				message: 'joined the family',
				createdAt: daysBefore(400).toISOString()
			})
			.returning({ id: notifications.id });

		await db
			.insert(unmatchedPhrases)
			.values({
				source: 'event_parse',
				phrase: 'old resolved',
				sample: 'old resolved sample',
				resolved: true,
				createdAt: daysBefore(200),
				updatedAt: daysBefore(181)
			});
		const newResolvedPhrase = await db
			.insert(unmatchedPhrases)
			.values({
				source: 'event_parse',
				phrase: 'new resolved',
				sample: 'new resolved sample',
				resolved: true,
				createdAt: daysBefore(200),
				updatedAt: daysBefore(179)
			})
			.returning({ id: unmatchedPhrases.id });
		const oldOpenPhrase = await db
			.insert(unmatchedPhrases)
			.values({
				source: 'bulk_edit',
				phrase: 'still open',
				sample: 'still open sample',
				createdAt: daysBefore(400),
				updatedAt: daysBefore(400)
			})
			.returning({ id: unmatchedPhrases.id });

		await db
			.insert(bugReports)
			.values({
				area: 'calendar',
				description: 'old resolved',
				status: 'resolved',
				resolvedAt: daysBefore(181),
				createdAt: daysBefore(200)
			});
		await db
			.insert(bugReports)
			.values({
				area: 'tasks',
				description: 'closed without a stamp',
				status: 'resolved',
				resolvedAt: null,
				createdAt: daysBefore(181)
			});
		const newResolvedBug = await db
			.insert(bugReports)
			.values({
				area: 'calendar',
				description: 'new resolved',
				status: 'resolved',
				resolvedAt: daysBefore(179),
				createdAt: daysBefore(200)
			})
			.returning({ id: bugReports.id });
		const oldOpenBug = await db
			.insert(bugReports)
			.values({
				area: 'account',
				description: 'still open',
				status: 'open',
				createdAt: daysBefore(400)
			})
			.returning({ id: bugReports.id });

		await db
			.insert(adEvents)
			.values({
				sponsorName: 'Old Sponsor',
				message: 'old ad',
				scheduledFor: daysBefore(120),
				createdAt: daysBefore(91)
			});
		const newAdEvent = await db
			.insert(adEvents)
			.values({
				sponsorName: 'New Sponsor',
				message: 'new ad',
				scheduledFor: daysBefore(20),
				createdAt: daysBefore(89)
			})
			.returning({ id: adEvents.id });

		await db
			.insert(claimTokens)
			.values({
				userId: activeGuest.id,
				tokenHash: 'hash-old',
				email: 'claim@example.test',
				expiresAt: new Date(NOW.getTime() - 1000)
			});
		const edgeClaimToken = await db
			.insert(claimTokens)
			.values({
				userId: activeGuest.id,
				tokenHash: 'hash-edge',
				email: 'claim@example.test',
				expiresAt: NOW
			})
			.returning({ id: claimTokens.id });
		const liveClaimToken = await db
			.insert(claimTokens)
			.values({
				userId: activeGuest.id,
				tokenHash: 'hash-live',
				email: 'claim@example.test',
				expiresAt: new Date(NOW.getTime() + 1000)
			})
			.returning({ id: claimTokens.id });

		const report = await runRetention(ctx);

		expect(report).toEqual({
			deleted: 1,
			scanned: 1,
			cutoff: daysBefore(90).toISOString(),
			notificationsPruned: 1,
			phrasesPruned: 1,
			bugReportsPruned: 2,
			adEventsPruned: 1
		});

		// Every table keeps exactly its new/boundary/never-matched rows.
		expect(await userIds(db)).toEqual([activeGuest.id, edgeGuest.id, idleRegistered.id].sort());
		expect(await db.select({ id: users.id }).from(users).where(eq(users.id, staleGuest.id))).toEqual(
			[]
		);
		expect(
			(await db.select({ id: notifications.id }).from(notifications)).map((row) => row.id).sort()
		).toEqual([newRead[0].id, oldUnread[0].id].sort());
		expect(
			(await db.select({ id: unmatchedPhrases.id }).from(unmatchedPhrases))
				.map((row) => row.id)
				.sort()
		).toEqual([newResolvedPhrase[0].id, oldOpenPhrase[0].id].sort());
		expect(
			(await db.select({ id: bugReports.id }).from(bugReports)).map((row) => row.id).sort()
		).toEqual([newResolvedBug[0].id, oldOpenBug[0].id].sort());
		expect(
			(await db.select({ id: adEvents.id }).from(adEvents)).map((row) => row.id).sort()
		).toEqual([newAdEvent[0].id]);
		expect(
			(await db.select({ id: claimTokens.id }).from(claimTokens)).map((row) => row.id).sort()
		).toEqual([liveClaimToken[0].id, edgeClaimToken[0].id].sort());
	});

	rollbackTest('scans only Anonymous Accounts: a stale registered person stays', async (db) => {
		const ctx = testCtx({ db, now: NOW.toISOString() });
		const registered = await seedUser(db, { lastActiveAt: daysBefore(400) });
		const guest = await seedUser(db, {
			firstName: 'Guest',
			email: `gone${ANONYMOUS_EMAIL_DOMAIN}`,
			lastActiveAt: daysBefore(400)
		});

		const report = await runRetention(ctx);

		expect(report).toMatchObject({ deleted: 1, scanned: 1 });
		expect(await db.select({ id: users.id }).from(users).where(eq(users.id, registered.id))).toHaveLength(
			1
		);
		expect(await db.select({ id: users.id }).from(users).where(eq(users.id, guest.id))).toEqual([]);
	});

	rollbackTest('does not sweep Recurring Task cursors: that is the daily tasks-sweep job (Q-092)', async (db) => {
		const ctx = testCtx({ db, now: NOW.toISOString() });
		const owner = await seedUser(db, { lastActiveAt: daysBefore(1) });
		const [stale] = await db
			.insert(tasks)
			.values({
				title: 'Water plants',
				userId: owner.id,
				dueDate: '2026-05-01 10:00:00+00',
				recurrenceFrequency: 'daily',
				recurrenceInterval: 1
			})
			.returning({ id: tasks.id });

		const report = await runRetention(ctx);

		// The cron's body keeps the legacy seven keys, and the cleanup pins nothing.
		expect(Object.keys(report).sort()).toEqual([
			'adEventsPruned',
			'bugReportsPruned',
			'cutoff',
			'deleted',
			'notificationsPruned',
			'phrasesPruned',
			'scanned'
		]);
		const [stored] = await db.select({ dueDate: tasks.dueDate }).from(tasks).where(eq(tasks.id, stale.id));
		expect(stored.dueDate).toBe('2026-05-01 10:00:00+00');
	});
});
