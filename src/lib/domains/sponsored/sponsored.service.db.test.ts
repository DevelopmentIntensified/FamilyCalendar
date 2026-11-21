/**
 * sponsored services against real Postgres: one test per IO Invariant, titled
 * after the rule. Each runs in `rollbackTest`, and the ctx is `testCtx` plus
 * fakes for identity's two ports, so nothing reads the process clock or a
 * global generator: time comes from `testCtx({ now })` and the draw is the
 * seed the service derives itself (Q-041 B).
 *
 * Doc: ./README.md#how-to-test
 */
import { eq } from 'drizzle-orm';
import { describe, expect } from 'vitest';
import type { IdentityCtx, IdentityPorts } from '$lib/domains/identity/index.server';
import { actorFromUser } from '$lib/kernel/ctx/actor';
import type { Db } from '$lib/kernel/db/database.server';
import { adConsentRecords, adEvents, events, userSettings } from '$lib/kernel/db/tables.server';
import { systemIds } from '$lib/kernel/ids/ids';
import { seedUser } from '$lib/kernel/testing/seedRows.server';
import { testCtx } from '$lib/kernel/testing/testCtx.server';
import { rollbackTest } from '$lib/kernel/testing/testDb.server';
import {
	seedAdConsentRecord,
	seedAdEvent,
	seedSponsoredSettings
} from './sponsored.fixtures.server';
import { SPONSORED_EVENT_MESSAGES } from './sponsored.month.rules';
import {
	listSponsoredConsentHistory,
	listSponsoredEvents,
	pruneSponsoredEventsOlderThan,
	recordSponsoredConsentChange
} from './sponsored.service.server';

const NOW = '2026-11-20T09:00:00.000Z';

/** November's window in UTC, the served `created_at` (Q-042 B). */
const NOVEMBER_START = '2026-11-01T00:00:00.000Z';

/**
 * `testCtx` plus identity's two ports the settings view reads, and the REAL id
 * generator (`systemIds`), so a generated Sponsored Event's wire id is the
 * legacy-shaped row id (`generateId(15)`) production mints. The consent fake
 * is empty by default: a test that needs the gate to IGNORE a consent record
 * seeds it here.
 */
function sponsoredTestCtx(
	db: Db,
	options: {
		readonly now?: string;
		readonly consentHistory?: readonly {
			readonly decision: string;
			readonly recordedAt: Date;
		}[];
	} = {}
): IdentityCtx {
	const base = testCtx({ db, now: options.now ?? NOW });
	const identityPorts: IdentityPorts = {
		calendarAccess: { listAccessibleCalendarIds: async () => [] },
		adConsent: {
			listConsentHistory: async () => options.consentHistory ?? [],
			recordConsentChange: async () => {}
		}
	};
	return {
		...base,
		ids: systemIds,
		...identityPorts
	};
}

/** An Event row a user owns, seeded to prove the serve path ignores it (Q-040 B). */
async function seedOwnedEvent(
	db: Db,
	seed: { readonly id: string; readonly ownerId: string; readonly title: string; readonly start: string }
): Promise<void> {
	await db.insert(events).values({ ...seed, description: null, allDay: false });
}

describe('listSponsoredEvents', () => {
	rollbackTest(
		'generates the month and never serves an own 📢 row (Q-040 B), the same draw on every read (Q-041 B)',
		async (db) => {
			const user = await seedUser(db);
			const other = await seedUser(db);
			await seedSponsoredSettings(db, user.id);
			await seedOwnedEvent(db, {
				id: 'adrowlate00001',
				ownerId: user.id,
				title: '📢 Later',
				start: '2026-11-20T10:00:00.000Z'
			});
			await seedOwnedEvent(db, {
				id: 'adrowplain0001',
				ownerId: user.id,
				title: 'Dentist',
				start: '2026-11-08T09:00:00.000Z'
			});
			await seedOwnedEvent(db, {
				id: 'adrowother0001',
				ownerId: other.id,
				title: '📢 Not yours',
				start: '2026-11-05T10:00:00.000Z'
			});
			const ctx = sponsoredTestCtx(db);
			const actor = actorFromUser(user, 'session');

			const served = await listSponsoredEvents(ctx, actor, {
				month: '2026-11',
				now: new Date(NOW)
			});
			const again = await listSponsoredEvents(ctx, actor, {
				month: '2026-11',
				now: new Date(NOW)
			});

			// Three generated rows, none of them the user's own rows.
			expect(served).toHaveLength(3);
			const ids = served.map((event) => event.id);
			expect(ids).not.toContain('adrowlate00001');
			expect(ids).not.toContain('adrowplain0001');
			expect(ids).not.toContain('adrowother0001');
			// The seeded draw repeats: same titles, same days.
			expect(again.map((event) => [event.title, event.start])).toEqual(
				served.map((event) => [event.title, event.start])
			);
			for (const event of served) {
				expect(SPONSORED_EVENT_MESSAGES).toContain(
					event.title.replace('📢 ', '') as (typeof SPONSORED_EVENT_MESSAGES)[number]
				);
				expect(event.start).toMatch(/^2026-11-(0[1-9]|[12]\d|30)T10:00:00\.000Z$/);
				expect(event.created_at).toBe(NOVEMBER_START);
				expect(event).toMatchObject({
					description: '',
					allDay: true,
					calendarId: '',
					ownerId: user.id,
					location: null,
					color: '#f59e0b',
					isAd: true
				});
				expect(event.id).toMatch(/^[a-z0-9]{15}$/);
			}
			expect(new Set(served.map((event) => event.id)).size).toBe(3);
			// Reading never writes: the own rows are still the only Events.
			expect(
				(await db.select({ id: events.id }).from(events)).map((row) => row.id).sort()
			).toEqual(['adrowlate00001', 'adrowother0001', 'adrowplain0001']);
			expect(await db.select().from(adEvents)).toEqual([]);
		}
	);

	rollbackTest(
		'withholds ads when the user has no settings row, even with 📢 rows in the month',
		async (db) => {
			const user = await seedUser(db);
			await seedOwnedEvent(db, {
				id: 'adrownosettings',
				ownerId: user.id,
				title: '📢 Sale',
				start: '2026-11-05T10:00:00.000Z'
			});

			const served = await listSponsoredEvents(
				sponsoredTestCtx(db),
				actorFromUser(user, 'session'),
				{ month: '2026-11', now: new Date(NOW) }
			);

			expect(served).toEqual([]);
		}
	);

	rollbackTest('withholds ads unless showAdsAsEvents is exactly true', async (db) => {
		const user = await seedUser(db);
		await seedSponsoredSettings(db, user.id, { showAdsAsEvents: false });
		const ctx = sponsoredTestCtx(db);
		const actor = actorFromUser(user, 'session');

		const offFalse = await listSponsoredEvents(ctx, actor, {
			month: '2026-11',
			now: new Date(NOW)
		});
		expect(offFalse).toEqual([]);

		await db
			.update(userSettings)
			.set({ showAdsAsEvents: null })
			.where(eq(userSettings.userId, user.id));
		const offNull = await listSponsoredEvents(ctx, actor, {
			month: '2026-11',
			now: new Date(NOW)
		});
		expect(offNull).toEqual([]);

		// No other field on the row can grant consent.
		await db
			.update(userSettings)
			.set({ showAdsAsEvents: false, syncEventsToFamilyCalendar: true })
			.where(eq(userSettings.userId, user.id));
		const offOtherFields = await listSponsoredEvents(ctx, actor, {
			month: '2026-11',
			now: new Date(NOW)
		});
		expect(offOtherFields).toEqual([]);
	});

	rollbackTest(
		'treats a consent record as evidence, never permission, and writes none on a read',
		async (db) => {
			const user = await seedUser(db);
			const [granted] = await db
				.insert(adConsentRecords)
				.values({ userId: user.id, decision: 'granted' })
				.returning();

			const served = await listSponsoredEvents(
				sponsoredTestCtx(db, { consentHistory: [{ decision: 'granted', recordedAt: granted.recordedAt }] }),
				actorFromUser(user, 'session'),
				{ month: '2026-11', now: new Date(NOW) }
			);

			expect(served).toEqual([]);
			const records = await db
				.select()
				.from(adConsentRecords)
				.where(eq(adConsentRecords.userId, user.id));
			expect(records.map((record) => [record.id, record.decision])).toEqual([
				[granted.id, 'granted']
			]);
		}
	);

	rollbackTest("windows the month in the user's zone, not UTC", async (db) => {
		const user = await seedUser(db);
		// Honolulu is UTC-10: its month opens at 10:00Z, and 10:00 local is 20:00Z.
		await seedSponsoredSettings(db, user.id, { timeZone: 'Pacific/Honolulu' });
		const ctx = sponsoredTestCtx(db);
		const actor = actorFromUser(user, 'session');

		const october = await listSponsoredEvents(ctx, actor, {
			month: '2026-10',
			now: new Date(NOW)
		});
		expect(october).toHaveLength(3);
		for (const event of october) {
			expect(event.start).toMatch(/^2026-10-(0[1-9]|[12]\d|3[01])T20:00:00\.000Z$/);
			expect(event.created_at).toBe('2026-10-01T10:00:00.000Z');
		}

		const november = await listSponsoredEvents(ctx, actor, {
			month: '2026-11',
			now: new Date(NOW)
		});
		expect(november).toHaveLength(3);
		for (const event of november) {
			expect(event.start).toMatch(/^2026-11-(0[1-9]|[12]\d|30)T20:00:00\.000Z$/);
			expect(event.created_at).toBe('2026-11-01T10:00:00.000Z');
		}
	});

	rollbackTest('uses the month of "now" in the user zone when month is absent', async (db) => {
		const user = await seedUser(db);
		// Honolulu is UTC-10: 05:00Z on 1 December is still 30 November there.
		await seedSponsoredSettings(db, user.id, { timeZone: 'Pacific/Honolulu' });
		const now = new Date('2026-12-01T05:00:00.000Z');

		const served = await listSponsoredEvents(
			sponsoredTestCtx(db, { now: now.toISOString() }),
			actorFromUser(user, 'session'),
			{ now }
		);

		expect(served).toHaveLength(3);
		for (const event of served) {
			expect(event.start).toMatch(/^2026-11-(0[1-9]|[12]\d|30)T20:00:00\.000Z$/);
			expect(event.created_at).toBe('2026-11-01T10:00:00.000Z');
		}
	});

	rollbackTest('generates three Sponsored Events when the month has none', async (db) => {
		const user = await seedUser(db);
		await seedSponsoredSettings(db, user.id);

		const served = await listSponsoredEvents(
			sponsoredTestCtx(db),
			actorFromUser(user, 'session'),
			{ month: '2026-11', now: new Date(NOW) }
		);

		expect(served).toHaveLength(3);
		// Four templates remain, so three draws never repeat one.
		expect(new Set(served.map((event) => event.title)).size).toBe(3);
		for (const event of served) {
			expect(SPONSORED_EVENT_MESSAGES).toContain(
				event.title.replace('📢 ', '') as (typeof SPONSORED_EVENT_MESSAGES)[number]
			);
			// 10:00 in the user's zone (UTC here), on a day of the month.
			expect(event.start).toMatch(/^2026-11-(0[1-9]|[12]\d|30)T10:00:00\.000Z$/);
			expect(event).toMatchObject({
				description: '',
				allDay: true,
				calendarId: '',
				ownerId: user.id,
				location: null,
				created_at: NOVEMBER_START,
				color: '#f59e0b',
				isAd: true
			});
			expect(event.end).toBe(event.start);
			expect(event.date).toBe(event.start);
			expect(event.id).toMatch(/^[a-z0-9]{15}$/);
		}
		expect(new Set(served.map((event) => event.id)).size).toBe(3);
		// Generation is virtual: the request writes no Event and no adEvents row.
		expect(await db.select().from(events)).toEqual([]);
		expect(await db.select().from(adEvents)).toEqual([]);
	});
});

describe('recordSponsoredConsentChange', () => {
	rollbackTest(
		'appends only on a transition, stamped with the ctx clock',
		async (db) => {
			const user = await seedUser(db);
			const ctx = testCtx({ db, now: NOW });

			const granted = await recordSponsoredConsentChange(ctx, user.id, {
				previous: undefined,
				next: true
			});
			const withdrawn = await recordSponsoredConsentChange(ctx, user.id, {
				previous: true,
				next: false
			});
			const unchanged = await recordSponsoredConsentChange(ctx, user.id, {
				previous: false,
				next: false
			});

			expect([granted, withdrawn, unchanged]).toEqual(['granted', 'withdrawn', null]);
			const rows = await db
				.select()
				.from(adConsentRecords)
				.where(eq(adConsentRecords.userId, user.id));
			// The select has no ORDER BY, so the set is what is pinned.
			expect(new Set(rows.map((row) => row.decision))).toEqual(new Set(['granted', 'withdrawn']));
			expect(rows.map((row) => row.recordedAt.toISOString())).toEqual([NOW, NOW]);
		}
	);

	rollbackTest(
		'records nothing for a user who has never touched the setting',
		async (db) => {
			const user = await seedUser(db);
			const ctx = testCtx({ db, now: NOW });

			const decision = await recordSponsoredConsentChange(ctx, user.id, {
				previous: undefined,
				next: false
			});

			expect(decision).toBeNull();
			expect(
				await db.select().from(adConsentRecords).where(eq(adConsentRecords.userId, user.id))
			).toEqual([]);
		}
	);
});

describe('listSponsoredConsentHistory', () => {
	rollbackTest('keeps the whole trail newest first, and a read writes nothing', async (db) => {
		const user = await seedUser(db);
		await seedAdConsentRecord(db, {
			userId: user.id,
			decision: 'granted',
			recordedAt: new Date('2026-10-01T10:00:00.000Z')
		});
		await seedAdConsentRecord(db, {
			userId: user.id,
			decision: 'withdrawn',
			recordedAt: new Date('2026-10-03T18:30:00.000Z')
		});
		const ctx = testCtx({ db, now: NOW });

		const trail = await listSponsoredConsentHistory(ctx, user.id);

		expect(trail.map((record) => [record.decision, record.recordedAt.toISOString()])).toEqual([
			['withdrawn', '2026-10-03T18:30:00.000Z'],
			['granted', '2026-10-01T10:00:00.000Z']
		]);
		expect(
			await db.select().from(adConsentRecords).where(eq(adConsentRecords.userId, user.id))
		).toHaveLength(2);
	});
});

describe('pruneSponsoredEventsOlderThan', () => {
	rollbackTest('deletes ad rows created before the cutoff and returns the count', async (db) => {
		await seedAdEvent(db, {
			id: 'adrowold000001',
			createdAt: new Date('2026-08-21T23:59:59.000Z')
		});
		await seedAdEvent(db, {
			id: 'adrowedge00001',
			createdAt: new Date('2026-08-22T00:00:00.000Z')
		});

		const removed = await pruneSponsoredEventsOlderThan(
			testCtx({ db }),
			new Date('2026-08-22T00:00:00.000Z')
		);

		expect(removed).toBe(1);
		const left = await db.select().from(adEvents);
		expect(left.map((row) => row.id)).toEqual(['adrowedge00001']);
	});

	rollbackTest('keeps the rule even when nothing matched', async (db) => {
		await seedAdEvent(db, {
			id: 'adrowrecent001',
			createdAt: new Date('2026-11-01T00:00:00.000Z')
		});

		const removed = await pruneSponsoredEventsOlderThan(
			testCtx({ db }),
			new Date('2026-08-22T00:00:00.000Z')
		);

		expect(removed).toBe(0);
		expect(await db.select().from(adEvents)).toHaveLength(1);
	});
});
