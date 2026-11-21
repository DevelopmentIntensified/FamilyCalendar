/**
 * access Claim services against real Postgres: the guests-only request, the
 * uniform answer, the two throttles, and confirming — claimed, burned twice,
 * refused for the wrong owner, and the Claim Conflict merge into the account
 * the address already belongs to.
 *
 * Doc: ./README.md#how-to-test
 */
import { eq } from 'drizzle-orm';
import { describe, expect } from 'vitest';
import { actorFromUser } from '$lib/kernel/ctx/actor';
import type { Db } from '$lib/kernel/db/database.server';
import { authSession, claimTokens, userSettings, users } from '$lib/kernel/db/tables.server';
import { seedUser } from '$lib/kernel/testing/seedRows.server';
import { rollbackTest } from '$lib/kernel/testing/testDb.server';
import { testCtx, type TestCtx } from '$lib/kernel/testing/testCtx.server';
import { accessTestIds, seedAccessGuest } from './access.fixtures.server';
import { confirmClaim, requestClaim } from './access.claim.service.server';

const NOW = new Date('2026-05-04T12:00:00.000Z');
const FIFTEEN_MINUTES = 15 * 60 * 1000;

function ctxFor(db: Db): TestCtx {
	return { ...testCtx({ db, now: NOW.toISOString() }), ids: accessTestIds() };
}

async function claimRows(db: Db, userId: string) {
	return await db.select().from(claimTokens).where(eq(claimTokens.userId, userId));
}

/** The token the mailed link carries: `/claim/verify/<token>` in the html. */
function mailedClaimToken(ctx: TestCtx, index = 0): string {
	const html = ctx.mail.outbox[index]?.html ?? '';
	const match = /\/claim\/verify\/([0-9a-f]{64})/.exec(html);
	if (!match) throw new Error('no claim token in the mailed html');
	return match[1];
}

describe('requestClaim', () => {
	rollbackTest('mints one hashed 15-minute token and mails the save copy to a fresh address', async (db) => {
		const ctx = ctxFor(db);
		const guest = await seedAccessGuest();

		const result = await requestClaim(ctx, actorFromUser(guest, 'session'), {
			email: '  Fresh.Claim@Example.Test ',
			clientIp: '10.23.0.1'
		});
		expect(result).toEqual({ sent: true });

		const rows = await claimRows(db, guest.id);
		expect(rows).toHaveLength(1);
		const [row] = rows;
		expect(row.email).toBe('fresh.claim@example.test');
		expect(row.tokenHash).toMatch(/^[0-9a-f]{64}$/);
		expect(row.expiresAt).toEqual(new Date(NOW.getTime() + FIFTEEN_MINUTES));
		expect(row.createdAt).toEqual(NOW);
		// The mailed token is the plaintext the hash stands for.
		expect(mailedClaimToken(ctx)).toHaveLength(64);

		expect(ctx.mail.outbox).toHaveLength(1);
		expect(ctx.mail.outbox[0].to).toBe('fresh.claim@example.test');
		expect(ctx.mail.outbox[0].subject).toBe('Save your Family Planz calendar');
		expect(ctx.mail.outbox[0].html).toContain('Save my calendar');
	});

	rollbackTest('answers the same shape for a registered address, with the merge copy', async (db) => {
		const ctx = ctxFor(db);
		const guest = await seedAccessGuest();
		const email = 'claim-taken@example.test';
		await seedUser(db, { email });

		expect(
			await requestClaim(ctx, actorFromUser(guest, 'session'), { email, clientIp: '10.23.0.2' })
		).toEqual({ sent: true });
		expect((await claimRows(db, guest.id)).map((row) => row.email)).toEqual([email]);
		expect(ctx.mail.outbox[0].subject).toBe(
			'Merge your calendar into your Family Planz account'
		);
		expect(ctx.mail.outbox[0].html).toContain('Merge my calendar into my account');
	});

	rollbackTest('refuses a registered person before the address and an address without a dot', async (db) => {
		const ctx = ctxFor(db);
		const registered = await seedUser(db, { email: 'claim-owner@example.test' });
		await expect(
			requestClaim(ctx, actorFromUser(registered, 'session'), {
				email: 'anything@example.test',
				clientIp: '10.23.0.3'
			})
		).rejects.toMatchObject({
			code: 'invalid',
			message: 'Account already has an email'
		});

		const guest = await seedAccessGuest();
		await expect(
			requestClaim(ctx, actorFromUser(guest, 'session'), { email: 'nope', clientIp: '10.23.0.4' })
		).rejects.toMatchObject({
			code: 'invalid',
			message: 'Please enter a valid email address'
		});
		expect(await claimRows(db, guest.id)).toEqual([]);
	});

	rollbackTest('throttles 3 per address and 10 per IP, each with its own control', async (db) => {
		const ctx = ctxFor(db);
		const guest = await seedAccessGuest();
		const send = (clientIp: string, email: string) =>
			requestClaim(ctx, actorFromUser(guest, 'session'), { email, clientIp });

		for (let index = 0; index < 3; index += 1) {
			expect((await send('10.23.1.1', 'claim-429@example.test')).sent).toBe(true);
		}
		await expect(send('10.23.1.1', 'claim-429@example.test')).rejects.toMatchObject({
			code: 'tooMany',
			message: 'Too many attempts. Try again shortly.'
		});
		// Key is `claim:<email>:<ip>`: a new client is a new bucket.
		expect((await send('10.23.1.2', 'claim-429@example.test')).sent).toBe(true);

		// The per-IP bucket spans addresses: ten sends, the eleventh refused.
		for (let index = 0; index < 10; index += 1) {
			expect((await send('10.23.1.3', `spray-${index}@example.test`)).sent).toBe(true);
		}
		await expect(send('10.23.1.3', 'spray-10@example.test')).rejects.toMatchObject({
			code: 'tooMany'
		});
		expect((await send('10.23.1.4', 'spray-11@example.test')).sent).toBe(true);
	});
});

describe('confirmClaim', () => {
	rollbackTest('attaches the address, backfills UTC settings and burns the token', async (db) => {
		const ctx = ctxFor(db);
		const guest = await seedAccessGuest();
		const email = 'claim-save@example.test';
		await requestClaim(ctx, actorFromUser(guest, 'session'), { email, clientIp: '10.23.2.1' });
		const token = mailedClaimToken(ctx);

		expect(await confirmClaim(ctx, actorFromUser(guest, 'session'), { token })).toEqual({
			outcome: 'claimed'
		});

		const [claimed] = await db.select().from(users).where(eq(users.id, guest.id));
		expect(claimed.email).toBe(email);
		expect(claimed.emailVerified).toBe(true);
		const [settings] = await db
			.select()
			.from(userSettings)
			.where(eq(userSettings.userId, guest.id));
		expect(settings.timeZone).toBe('UTC');
		expect(await claimRows(db, guest.id)).toEqual([]);

		// Consumed exactly once: the second click is invalid.
		expect(await confirmClaim(ctx, actorFromUser(guest, 'session'), { token })).toEqual({
			outcome: 'invalid'
		});
	});

	rollbackTest('refuses a token issued to another guest without burning it', async (db) => {
		const ctx = ctxFor(db);
		const owner = await seedAccessGuest();
		const other = await seedAccessGuest();
		await requestClaim(ctx, actorFromUser(owner, 'session'), {
			email: 'claim-owner-only@example.test',
			clientIp: '10.23.2.2'
		});
		const token = mailedClaimToken(ctx);

		expect(await confirmClaim(ctx, actorFromUser(other, 'session'), { token })).toEqual({
			outcome: 'invalid'
		});
		expect(await claimRows(db, owner.id)).toHaveLength(1);
	});

	rollbackTest('Claim Conflict merges the guest into the account and signs into it', async (db) => {
		const ctx = ctxFor(db);
		const guest = await seedAccessGuest();
		const target = await seedUser(db, { email: 'claim-conflict@example.test' });

		await requestClaim(ctx, actorFromUser(guest, 'session'), {
			email: target.email,
			clientIp: '10.23.2.3'
		});
		const token = mailedClaimToken(ctx);

		const result = await confirmClaim(ctx, actorFromUser(guest, 'session'), { token });
		expect(result.outcome).toBe('merged');
		if (result.outcome !== 'merged') throw new Error('expected a merged session');
		expect(result.cookie.value).toContain('.');

		// The guest row and its session are gone; the target survives untouched.
		expect(await db.select().from(users).where(eq(users.id, guest.id))).toEqual([]);
		expect(
			await db.select().from(authSession).where(eq(authSession.userId, guest.id))
		).toEqual([]);
		expect(await db.select().from(users).where(eq(users.id, target.id))).toHaveLength(1);
		expect(await claimRows(db, guest.id)).toEqual([]);
		// The click signed the browser into the target account.
		expect(
			(await db.select().from(authSession).where(eq(authSession.userId, target.id))).length
		).toBeGreaterThanOrEqual(1);
	});
});
