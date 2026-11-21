/**
 * The parsing service against real Postgres: the cloud path's gating, its
 * monthly cap, the usage record and the 200 fallback wire. Each test is titled
 * after the README Invariant it pins.
 *
 * The vendor call is the `ctx.ai` port, so a test scripts the model's answer
 * and reads `ctx.ai.calls` — no test leaves the process and no module is
 * mocked (R9). Billing rows come from billing's fixtures, settings rows from
 * identity's; the parse's "now" is `ctx.clock.now()`, so a date assertion is
 * built from the ctx clock (`NOW`) the way the frozen golden builds its own
 * from `DateTime.now()` under `goldenCtx`'s real clock.
 *
 * Doc: ./README.md#how-to-test
 */
import { eq } from 'drizzle-orm';
import { DateTime } from 'luxon';
import { describe, expect } from 'vitest';
import { createMemoryAi, type Ai } from '$lib/kernel/ai/ai';
import { actorFromUser } from '$lib/kernel/ctx/actor';
import type { Db } from '$lib/kernel/db/database.server';
import { aiUsageTracking } from '$lib/kernel/db/tables.server';
import { rollbackTest } from '$lib/kernel/testing/testDb.server';
import { seedUser } from '$lib/kernel/testing/seedRows.server';
import { testCtx } from '$lib/kernel/testing/testCtx.server';
import { seedAiUsage, seedSubscription, seedTier } from '$lib/domains/billing/billing.fixtures.server';
import { seedIdentitySettings } from '$lib/domains/identity/identity.fixtures.server';
import type { ParseEventResponse, ParseEventWireResponse } from './parsing.contract';
import { parseEventRequest } from './parsing.service.server';

/** A fixed instant in June 2026: the AI counter's period is 6/2026. */
const NOW = '2026-06-01T00:00:00.000Z';

/** The bucket `clientKeyOf(request, 'parse-event')` builds for a local caller. */
const CLIENT_KEY = 'parse-event:local';

/** Today on the ctx clock (`NOW`), plus `days`, in a zone. */
function dayIn(zone: string, days = 0): string {
	return DateTime.fromJSDate(new Date(NOW), { zone }).plus({ days }).toFormat('yyyy-MM-dd');
}

/** Narrow an answer to the single-parse shape (a list answer has no `parsed`). */
function single(answer: ParseEventWireResponse): ParseEventResponse {
	if ('results' in answer) throw new Error(`expected a single parse answer, got ${answer.method}`);
	return answer;
}

/** The caller's AI counter rows, in the shape an assertion reads. */
async function usageRows(db: Db, userId: string) {
	return await db
		.select({
			month: aiUsageTracking.month,
			year: aiUsageTracking.year,
			used: aiUsageTracking.aiEventCreationsUsed
		})
		.from(aiUsageTracking)
		.where(eq(aiUsageTracking.userId, userId));
}

/** A paid caller: an active non-free tier, so the short window never applies. */
async function seedPaidCaller(db: Db) {
	const user = await seedUser(db);
	const tier = await seedTier(db, { tierName: 'family_master' });
	await seedSubscription(db, user.id, { subscriptionTypeId: tier.id });
	return user;
}

describe('parseEventRequest — the cloud path', () => {
	rollbackTest(
		'never calls the paid model for an Anonymous Account, even when it is configured',
		async (db) => {
			const ai = createMemoryAi({ configured: true });
			ai.script({ title: 'never asked' });
			const ctx = { ...testCtx({ db, now: NOW }), ai };

			const answer = await parseEventRequest(ctx, null, {
				input: 'dinner tomorrow at 6pm',
				useCloud: true,
				clientKey: CLIENT_KEY
			});

			expect(ai.calls).toEqual([]);
			expect(single(answer)).toEqual({
				parsed: { allDay: false, date: dayIn('UTC', 1), startTime: '18:00', title: 'dinner' },
				confidence: 0.65,
				method: 'regex'
			});
		}
	);

	rollbackTest('passes the vendor answer through verbatim and records the creation', async (db) => {
		const ai = createMemoryAi({ configured: true });
		const cloud = { title: 'dinner', date: '2026-06-02', location: 'LU', allDay: false };
		ai.script(cloud);
		const user = await seedPaidCaller(db);
		const ctx = { ...testCtx({ db, now: NOW }), ai };

		const answer = await parseEventRequest(ctx, actorFromUser(user, 'session'), {
			input: 'dinner tomorrow at 6pm',
			useCloud: true,
			clientKey: CLIENT_KEY
		});

		expect(answer).toEqual({ parsed: cloud, confidence: 0.85, method: 'cloud' });
		expect(ai.calls).toHaveLength(1);
		expect(ai.calls[0]?.system).toContain('Parse this calendar event');
		expect(ai.calls[0]?.user).toBe('dinner tomorrow at 6pm');
		expect(await usageRows(db, user.id)).toEqual([{ month: 6, year: 2026, used: 1 }]);
	});

	rollbackTest("resolves relative dates in the caller's stored zone", async (db) => {
		const user = await seedUser(db);
		await seedIdentitySettings(user.id, { timeZone: 'Pacific/Kiritimati' }, db);
		const ctx = testCtx({ db, now: NOW });

		const answer = await parseEventRequest(ctx, actorFromUser(user, 'session'), {
			input: 'meeting tomorrow',
			useCloud: false,
			clientKey: CLIENT_KEY
		});

		expect(single(answer)).toEqual({
			parsed: { allDay: false, date: dayIn('Pacific/Kiritimati', 1), title: 'meeting' },
			confidence: 0.4,
			method: 'regex'
		});
	});

	rollbackTest('adds the stored zone as a prompt hint only when the caller has one', async (db) => {
		const ai = createMemoryAi({ configured: true });
		ai.script({ title: 'a' }, { title: 'b' });
		const zoned = await seedPaidCaller(db);
		await seedIdentitySettings(zoned.id, { timeZone: 'Pacific/Kiritimati' }, db);
		const bare = await seedPaidCaller(db);
		const ctx = { ...testCtx({ db, now: NOW }), ai };

		await parseEventRequest(ctx, actorFromUser(zoned, 'session'), {
			input: 'meeting tomorrow',
			useCloud: true,
			clientKey: CLIENT_KEY
		});
		await parseEventRequest(ctx, actorFromUser(bare, 'session'), {
			input: 'meeting tomorrow',
			useCloud: true,
			clientKey: 'parse-event:second'
		});

		expect(ai.calls[0]?.user).toBe(
			"meeting tomorrow\n(The user's timezone is Pacific/Kiritimati.)"
		);
		expect(ai.calls[1]?.user).toBe('meeting tomorrow');
	});

	rollbackTest('refuses an over-cap caller with 429 before any vendor call (issue 187)', async (db) => {
		const ai = createMemoryAi({ configured: true });
		ai.script({ title: 'never asked' });
		const user = await seedUser(db);
		const tier = await seedTier(db, { tierName: 'free', aiEventCreationsPerMonth: 3 });
		await seedSubscription(db, user.id, { subscriptionTypeId: tier.id });
		await seedAiUsage(db, user.id, { month: 6, year: 2026, aiEventCreationsUsed: 3 });
		const ctx = { ...testCtx({ db, now: NOW }), ai };

		await expect(
			parseEventRequest(ctx, actorFromUser(user, 'session'), {
				input: 'dinner tomorrow',
				useCloud: true,
				clientKey: CLIENT_KEY
			})
		).rejects.toMatchObject({
			code: 'tooMany',
			status: 429,
			message: 'AI feature limit reached (3 per month). Upgrade to unlock unlimited AI.'
		});
		expect(ai.calls).toEqual([]);
		expect(await usageRows(db, user.id)).toEqual([{ month: 6, year: 2026, used: 3 }]);
	});

	rollbackTest('records usage even when the vendor answers nothing (issue 187)', async (db) => {
		const ai = createMemoryAi({ configured: true });
		const user = await seedPaidCaller(db);
		const ctx = { ...testCtx({ db, now: NOW }), ai };

		const answer = await parseEventRequest(ctx, actorFromUser(user, 'session'), {
			input: 'dentist appointment',
			useCloud: true,
			clientKey: CLIENT_KEY
		});

		expect(ai.calls).toHaveLength(1);
		expect(single(answer)).toEqual({
			parsed: { allDay: false, date: dayIn('UTC'), title: 'dentist appointment' },
			confidence: 0.2,
			method: 'regex'
		});
		expect(await usageRows(db, user.id)).toEqual([{ month: 6, year: 2026, used: 1 }]);
	});

	rollbackTest('keeps the free tier at 20 cloud parses per 5 minutes, then falls back silently', async (db) => {
		const ai = createMemoryAi({ configured: true });
		ai.script(...Array.from({ length: 20 }, () => ({ title: 'cloud', date: '2026-06-02' })));
		const user = await seedUser(db);
		// A free TIER with a high monthly cap, so the 20/5 min window is what
		// this test exercises (the free policy's 10/month would cap first).
		const tier = await seedTier(db, { tierName: 'free', aiEventCreationsPerMonth: 100 });
		await seedSubscription(db, user.id, { subscriptionTypeId: tier.id });
		const ctx = { ...testCtx({ db, now: NOW }), ai };
		const actor = actorFromUser(user, 'session');

		const methods: string[] = [];
		for (let call = 0; call < 21; call += 1) {
			const answer = await parseEventRequest(ctx, actor, {
				input: 'dinner tomorrow',
				useCloud: true,
				clientKey: CLIENT_KEY
			});
			methods.push(answer.method);
		}

		expect(methods.slice(0, 20)).toEqual(Array.from({ length: 20 }, () => 'cloud'));
		expect(methods[20]).toBe('regex');
		expect(ai.calls).toHaveLength(20);
		expect(await usageRows(db, user.id)).toEqual([{ month: 6, year: 2026, used: 20 }]);
	});

	rollbackTest('lets a paid tier skip the 20-per-5-minutes window', async (db) => {
		const ai = createMemoryAi({ configured: true });
		ai.script(...Array.from({ length: 21 }, () => ({ title: 'cloud', date: '2026-06-02' })));
		const user = await seedPaidCaller(db);
		const ctx = { ...testCtx({ db, now: NOW }), ai };
		const actor = actorFromUser(user, 'session');

		const methods: string[] = [];
		for (let call = 0; call < 21; call += 1) {
			const answer = await parseEventRequest(ctx, actor, {
				input: 'dinner tomorrow',
				useCloud: true,
				clientKey: CLIENT_KEY
			});
			methods.push(answer.method);
		}

		expect(methods.every((method) => method === 'cloud')).toBe(true);
		expect(ai.calls).toHaveLength(21);
	});

	rollbackTest('answers the multi-event list before the cloud path (Q-013)', async (db) => {
		const ai = createMemoryAi({ configured: true });
		ai.script({ title: 'never asked' });
		const user = await seedPaidCaller(db);
		const ctx = { ...testCtx({ db, now: NOW }), ai };

		const answer = await parseEventRequest(ctx, actorFromUser(user, 'session'), {
			input: 'dinner Friday and movie Saturday',
			useCloud: true,
			clientKey: CLIENT_KEY
		});

		expect(answer.method).toBe('regex-list');
		expect('results' in answer && answer.results).toHaveLength(2);
		expect(ai.calls).toEqual([]);
		expect(await usageRows(db, user.id)).toEqual([]);
	});

	rollbackTest('keeps the 200 fallback wire when a later step throws (Q-011)', async (db) => {
		const ai: Ai = {
			configured: () => true,
			chatJson: async () => {
				throw new Error('vendor down');
			}
		};
		const user = await seedPaidCaller(db);
		const ctx = { ...testCtx({ db, now: NOW }), ai };

		const answer = await parseEventRequest(ctx, actorFromUser(user, 'session'), {
			input: 'meeting tomorrow',
			useCloud: true,
			clientKey: CLIENT_KEY
		});

		expect(single(answer)).toEqual({
			parsed: { allDay: false, date: dayIn('UTC', 1), title: 'meeting' },
			confidence: 0.4,
			method: 'regex-fallback'
		});
		expect(ctx.log.entries).toContainEqual(
			expect.objectContaining({ level: 'error', event: 'parse_event_fallback' })
		);
		expect(ctx.faults.reports).toEqual([
			{
				status: 500,
				message: 'vendor down',
				path: '/api/parse-event',
				userId: user.id
			}
		]);
		expect(await usageRows(db, user.id)).toEqual([]);
	});
});
