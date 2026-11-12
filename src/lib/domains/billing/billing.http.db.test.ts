/**
 * Golden contract tests for billing's only `/api` route: `GET /api/me/subscription`.
 * They pin what an installed client (the Android plan card) sees today — status,
 * full body, and the degrade-on-read-failure path — against the legacy handler, so
 * they keep passing unchanged after the port (docs/rewrite/playbooks/characterize-endpoints.md).
 *
 * Doc: src/lib/domains/billing/README.md#invariants
 */
import { eq, sql } from 'drizzle-orm';
import { beforeEach, describe, expect, it } from 'vitest';
import { aiUsageTracking, subscriptions, subscriptionTypes } from '$lib/kernel/db/tables.server';
import { invoke } from '$lib/kernel/testing/invokeHandlers.server';
import { seedUser } from '$lib/kernel/testing/seedRows.server';
import { testCtx } from '$lib/kernel/testing/testCtx.server';
import { testDb, truncateAll } from '$lib/kernel/testing/testDb.server';
// The ROUTE module, not the service: this is what clients hit, and after the port
// it re-exports the new handler, so this import never changes.
import { GET as getSubscription } from '../../../routes/api/me/subscription/+server';

const ctx = () => testCtx({ db: testDb() });

/** Any instant serialised by the wire: shape only, the value is generated. */
const anInstant = () => expect.stringMatching(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/);

/** The free policy: 1 family, 6 members, 30 view days, 90 archived, 10 MiB, 10 AI/month. */
const FREE_LIMITS = {
	familyLimit: 1,
	memberLimit: 6,
	retentionViewDays: 30,
	archivedRetentionDays: 90,
	attachmentLimitBytes: 10485760,
	aiEventCreationsPerMonth: 10,
	exportImportEnabled: true
};

/** Base prices are monthly 9, annual 90, lifetime 150; the annual month equals 90/12. */
const PRICING = { monthly: 9, annual: 90, lifetime: 150, monthlyEquivalent: 7.5 };

const FREE_SUMMARY = {
	subscription: { tier: null, subscription: null },
	planLimits: FREE_LIMITS,
	aiUsage: { used: 0, limit: 10, remaining: 10 },
	planPricing: PRICING
};

describe('GET /api/me/subscription', () => {
	beforeEach(truncateAll);

	it('answers the free-plan summary for a signed-in user with no subscription row', async () => {
		const user = await seedUser(testDb());
		const res = await invoke(getSubscription, { ctx: ctx(), user, path: '/api/me/subscription' });
		expect(res.status).toBe(200);
		expect(res.body).toEqual(FREE_SUMMARY);
	});

	it('answers the same summary for a Bearer token caller (via: "token")', async () => {
		const user = await seedUser(testDb());
		const res = await invoke(getSubscription, {
			ctx: ctx(),
			user,
			via: 'token',
			path: '/api/me/subscription'
		});
		expect(res.status).toBe(200);
		expect(res.body).toEqual(FREE_SUMMARY);
	});

	it('answers 401 {"error":"Unauthorized"} when signed out', async () => {
		const res = await invoke(getSubscription, { ctx: ctx(), path: '/api/me/subscription' });
		expect(res.status).toBe(401);
		expect(res.body).toEqual({ error: 'Unauthorized' });
	});

	it('reports the active tier, its overrides and the AI cap from that tier', async () => {
		const user = await seedUser(testDb());
		await testDb().insert(subscriptionTypes).values({
			id: 'family-master-monthly',
			name: 'Family Master Monthly',
			tierName: 'family_master',
			planType: 'family',
			displayName: 'Family Master',
			durationMonths: 1,
			enabled: true,
			familyLimit: 999,
			memberLimit: 999,
			retentionViewDays: 3650,
			archivedRetentionDays: 3650,
			attachmentLimitBytes: 1073741824,
			aiEventCreationsPerMonth: 999999,
			exportImportEnabled: true
		});
		await testDb()
			.insert(subscriptions)
			.values({
				userId: user.id,
				subscriptionTypeId: 'family-master-monthly',
				endDate: new Date('2999-01-01T00:00:00.000Z'),
				notificationMethods: { email: true, sms: false },
				startDate: new Date('2026-01-05T00:00:00.000Z'),
				createdAt: new Date('2026-01-05T00:00:00.000Z'),
				// Row overrides win for memberLimit only; the rest come from the tier,
				// and the AI count and export/import flag never take an override.
				memberLimitOverride: 12
			});

		const res = await invoke(getSubscription, { ctx: ctx(), user, path: '/api/me/subscription' });
		expect(res.status).toBe(200);
		expect(res.body).toEqual({
			subscription: {
				tier: {
					id: 'family-master-monthly',
					name: 'Family Master Monthly',
					tierName: 'family_master',
					planType: 'family',
					displayName: 'Family Master',
					createdAt: anInstant(),
					updatedAt: anInstant(),
					durationMonths: 1,
					enabled: true,
					familyLimit: 999,
					memberLimit: 999,
					retentionViewDays: 3650,
					archivedRetentionDays: 3650,
					attachmentLimitBytes: 1073741824,
					aiEventCreationsPerMonth: 999999,
					exportImportEnabled: true
				},
				subscription: {
					id: expect.any(String),
					startDate: '2026-01-05T00:00:00.000Z',
					endDate: '2999-01-01T00:00:00.000Z',
					createdAt: '2026-01-05T00:00:00.000Z'
				}
			},
			planLimits: {
				familyLimit: 999,
				memberLimit: 12,
				retentionViewDays: 3650,
				archivedRetentionDays: 3650,
				attachmentLimitBytes: 1073741824,
				aiEventCreationsPerMonth: 999999,
				exportImportEnabled: true
			},
			aiUsage: { used: 0, limit: 999999, remaining: 999999 },
			planPricing: PRICING
		});
	});

	it('counts this month of AI usage and never reports a negative remaining count', async () => {
		const user = await seedUser(testDb());
		// Legacy reads the real clock for "this month"; seed the same real month.
		const now = new Date();
		const period = { userId: user.id, month: now.getMonth() + 1, year: now.getFullYear() };

		await testDb().insert(aiUsageTracking).values({ ...period, aiEventCreationsUsed: 7 });
		const under = await invoke(getSubscription, {
			ctx: ctx(),
			user,
			path: '/api/me/subscription'
		});
		expect(under.status).toBe(200);
		expect(under.body).toMatchObject({ aiUsage: { used: 7, limit: 10, remaining: 3 } });

		await testDb()
			.update(aiUsageTracking)
			.set({ aiEventCreationsUsed: 12 })
			.where(eq(aiUsageTracking.userId, user.id));
		const over = await invoke(getSubscription, { ctx: ctx(), user, path: '/api/me/subscription' });
		expect(over.status).toBe(200);
		expect(over.body).toMatchObject({ aiUsage: { used: 12, limit: 10, remaining: 0 } });
	});

	it('ignores an expired subscription row and falls back to the free defaults', async () => {
		const user = await seedUser(testDb());
		await testDb().insert(subscriptionTypes).values({
			id: 'cal-master-monthly',
			name: 'Cal Master Monthly',
			tierName: 'cal_master',
			planType: 'individual',
			displayName: 'Cal Master',
			durationMonths: 1,
			enabled: true,
			familyLimit: 1,
			memberLimit: 6,
			retentionViewDays: 3650,
			archivedRetentionDays: 3650,
			attachmentLimitBytes: 1073741824,
			aiEventCreationsPerMonth: 999999,
			exportImportEnabled: true
		});
		await testDb()
			.insert(subscriptions)
			.values({
				userId: user.id,
				subscriptionTypeId: 'cal-master-monthly',
				endDate: new Date('2020-01-01T00:00:00.000Z'),
				notificationMethods: { email: true, sms: false },
				startDate: new Date('2019-12-01T00:00:00.000Z'),
				createdAt: new Date('2019-12-01T00:00:00.000Z')
			});

		const res = await invoke(getSubscription, { ctx: ctx(), user, path: '/api/me/subscription' });
		expect(res.status).toBe(200);
		expect(res.body).toEqual(FREE_SUMMARY);
	});

	it('reads the newest active subscription row when a user holds two', async () => {
		const user = await seedUser(testDb());
		await testDb().insert(subscriptionTypes).values([
			{
				id: 'cal-master-annual',
				name: 'Cal Master Annual',
				tierName: 'cal_master',
				planType: 'individual',
				displayName: 'Cal Master',
				durationMonths: 12,
				enabled: true,
				familyLimit: 1,
				memberLimit: 6,
				retentionViewDays: 3650,
				archivedRetentionDays: 3650,
				attachmentLimitBytes: 1073741824,
				aiEventCreationsPerMonth: 999999,
				exportImportEnabled: true
			},
			{
				id: 'family-master-annual',
				name: 'Family Master Annual',
				tierName: 'family_master',
				planType: 'family',
				displayName: 'Family Master',
				durationMonths: 12,
				enabled: true,
				familyLimit: 999,
				memberLimit: 999,
				retentionViewDays: 3650,
				archivedRetentionDays: 3650,
				attachmentLimitBytes: 1073741824,
				aiEventCreationsPerMonth: 999999,
				exportImportEnabled: true
			}
		]);
		await testDb()
			.insert(subscriptions)
			.values([
				{
					userId: user.id,
					subscriptionTypeId: 'cal-master-annual',
					endDate: new Date('2999-01-01T00:00:00.000Z'),
					notificationMethods: { email: true, sms: false },
					startDate: new Date('2026-01-01T00:00:00.000Z'),
					createdAt: new Date('2026-01-01T00:00:00.000Z')
				},
				{
					userId: user.id,
					subscriptionTypeId: 'family-master-annual',
					endDate: new Date('2999-01-01T00:00:00.000Z'),
					notificationMethods: { email: true, sms: false },
					startDate: new Date('2026-05-01T00:00:00.000Z'),
					createdAt: new Date('2026-05-01T00:00:00.000Z')
				}
			]);

		const res = await invoke(getSubscription, { ctx: ctx(), user, path: '/api/me/subscription' });
		expect(res.status).toBe(200);
		expect(res.body).toMatchObject({
			subscription: { tier: { id: 'family-master-annual' }, subscription: { id: expect.any(String) } }
		});
	});

	// A display-only read: one failed query must not break the page. The rename makes
	// the AI-usage read fail the way a broken database would; the whole summary then
	// falls back to "no subscription" + the free defaults and still answers 200.
	it('degrades to no subscription and the free defaults when a read fails', async () => {
		const user = await seedUser(testDb());
		await testDb().insert(subscriptionTypes).values({
			id: 'family-master-monthly',
			name: 'Family Master Monthly',
			tierName: 'family_master',
			planType: 'family',
			displayName: 'Family Master',
			durationMonths: 1,
			enabled: true,
			familyLimit: 999,
			memberLimit: 999,
			retentionViewDays: 3650,
			archivedRetentionDays: 3650,
			attachmentLimitBytes: 1073741824,
			aiEventCreationsPerMonth: 999999,
			exportImportEnabled: true
		});
		await testDb().insert(subscriptions).values({
			userId: user.id,
			subscriptionTypeId: 'family-master-monthly',
			endDate: new Date('2999-01-01T00:00:00.000Z'),
			notificationMethods: { email: true, sms: false }
		});

		await testDb().execute(sql`ALTER TABLE "aiUsageTracking" RENAME TO "aiUsageTracking_broken"`);
		try {
			const res = await invoke(getSubscription, {
				ctx: ctx(),
				user,
				path: '/api/me/subscription'
			});
			expect(res.status).toBe(200);
			expect(res.body).toEqual(FREE_SUMMARY);
		} finally {
			await testDb().execute(
				sql`ALTER TABLE "aiUsageTracking_broken" RENAME TO "aiUsageTracking"`
			);
		}
	});
});
