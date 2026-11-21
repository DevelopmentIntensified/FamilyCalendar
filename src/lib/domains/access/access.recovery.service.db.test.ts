/**
 * access recovery against real Postgres: the forgot-password mail and the
 * single-use reset behind it, every rule titled after the Invariant it pins.
 *
 * Codes are seeded through identity's own `issueEmailCode` (never by writing a
 * digest here), so the stored value asserted below is the one production
 * writes: `HMAC-SHA-256(pepper, code)` (Q-116, Q-117).
 *
 * Doc: ./README.md#invariants
 */
import { describe, expect } from 'vitest';
import { TimeSpan } from 'oslo';
import { createJWT, parseJWT } from 'oslo/jwt';
import { apiTokens, authSession, codes, users } from '$lib/kernel/db/tables.server';
import { hmacSha256Hex, sha256Hex } from '$lib/kernel/ids/ids';
import { seedUser } from '$lib/kernel/testing/seedRows.server';
import { rollbackTest } from '$lib/kernel/testing/testDb.server';
import { testCtx, type TestCtx } from '$lib/kernel/testing/testCtx.server';
import { eq } from 'drizzle-orm';
import { issueEmailCode } from '$lib/domains/identity/index.server';
import {
	FORGOT_EMAIL_REQUIRED_MESSAGE,
	PASSWORD_TOO_SHORT_MESSAGE,
	RATE_LIMIT_MESSAGE,
	RESET_ACCOUNT_NOT_FOUND_MESSAGE,
	RESET_FIELDS_REQUIRED_MESSAGE,
	RESET_INVALID_PAYLOAD_MESSAGE,
	RESET_INVALID_TOKEN_MESSAGE,
	RESET_USED_MESSAGE
} from './access.contract';
import { RESET_TOKEN_PURPOSE } from './access.email.rules';
import {
	RESET_ATTEMPT_LIMIT,
	requestPasswordReset,
	resetPassword,
	resetLinkUrl,
	signOutEverywhere
} from './access.recovery.service.server';

const NOW = '2026-04-01T12:00:00.000Z';
const SITE_URL = 'https://familyplanz.test';
const CLIENT_KEY = 'reset:mia@example.test:10.0.0.1';

/**
 * A reset JWT exactly as the forgot mail mints one: the `purpose` claim plus
 * `email`, 60 minutes (Q-102). A test that must omit the claim passes its own
 * `createJWT`.
 */
async function mintResetToken(ctx: TestCtx, payload: Record<string, string>): Promise<string> {
	return await createJWT(
		'HS256',
		new TextEncoder().encode(ctx.config.codePepper),
		{ purpose: RESET_TOKEN_PURPOSE, ...payload },
		{ headers: { alg: 'HS256', typ: 'JWT' }, expiresIn: new TimeSpan(60, 'm') }
	);
}

function tokenFrom(mailHtml: string): string {
	const match = /token=([A-Za-z0-9_.-]+)/.exec(mailHtml);
	if (!match?.[1]) throw new Error('the reset mail carried no token');
	return match[1];
}

describe('requestPasswordReset', () => {
	rollbackTest('refuses an absent email before spending the bucket', async (db) => {
		const ctx = testCtx({ db, now: NOW });
		await expect(
			requestPasswordReset(ctx, { email: '', clientKey: CLIENT_KEY, siteUrl: SITE_URL })
		).rejects.toMatchObject({ code: 'invalid', message: FORGOT_EMAIL_REQUIRED_MESSAGE });
		expect(ctx.mail.outbox).toEqual([]);
	});

	rollbackTest('answers {sent:true} for an unknown address and mails nothing', async (db) => {
		const ctx = testCtx({ db, now: NOW });
		expect(
			await requestPasswordReset(ctx, {
				email: 'nobody@example.test',
				clientKey: CLIENT_KEY,
				siteUrl: SITE_URL
			})
		).toEqual({ sent: true });
		expect(ctx.mail.outbox).toEqual([]);
		expect(await db.select().from(codes).where(eq(codes.email, 'nobody@example.test'))).toEqual([]);
	});

	rollbackTest('treats an Anonymous Account placeholder as unknown', async (db) => {
		const ctx = testCtx({ db, now: NOW });
		const guest = await seedUser(db, {
			email: 'guest-1@anonymous.placeholder.invalid',
			emailVerified: false
		});
		expect(
			await requestPasswordReset(ctx, {
				email: guest.email ?? '',
				clientKey: CLIENT_KEY,
				siteUrl: SITE_URL
			})
		).toEqual({ sent: true });
		expect(ctx.mail.outbox).toEqual([]);
	});

	rollbackTest('mails a 60-minute link whose token names the address', async (db) => {
		const ctx = testCtx({ db, now: NOW });
		const person = await seedUser(db, { email: 'mia@example.test' });

		expect(
			await requestPasswordReset(ctx, {
				email: 'mia@example.test',
				clientKey: CLIENT_KEY,
				siteUrl: SITE_URL
			})
		).toEqual({ sent: true });

		const [mail] = ctx.mail.outbox;
		expect(mail?.to).toBe('mia@example.test');
		expect(mail?.subject).toBe('Family Planz Password Reset');
		const token = tokenFrom(mail?.html ?? '');
		const parsed = parseJWT(token);
		expect(parsed?.payload).toMatchObject({ email: 'mia@example.test' });
		expect(parsed?.expiresAt?.getTime()).toBeGreaterThan(
			ctx.clock.now().getTime() + 59 * 60 * 1000
		);
		// Nothing is stored until the link is used: the token is stateless.
		expect(await db.select().from(codes)).toEqual([]);
		expect(person.email).toBe('mia@example.test');
	});

	rollbackTest('throttles one address at 5 sends per 15 minutes per client', async (db) => {
		const ctx = testCtx({ db, now: NOW });
		await seedUser(db, { email: 'mia@example.test' });
		const send = (key: string) =>
			requestPasswordReset(ctx, { email: 'mia@example.test', clientKey: key, siteUrl: SITE_URL });

		for (let attempt = 0; attempt < 5; attempt += 1) {
			expect(await send(CLIENT_KEY)).toEqual({ sent: true });
		}
		await expect(send(CLIENT_KEY)).rejects.toMatchObject({
			code: 'tooMany',
			message: RATE_LIMIT_MESSAGE
		});
		// The key folds the address and the client: another client is a new bucket.
		expect(await send('reset:mia@example.test:10.0.0.2')).toEqual({ sent: true });
	});

	rollbackTest('builds the mail link on the caller site origin', async () => {
		expect(resetLinkUrl(SITE_URL, 'a.b.c')).toBe(`${SITE_URL}/forgot-password/reset?token=a.b.c`);
	});
});

describe('resetPassword', () => {
	rollbackTest('checks the fields, then the length, before the token', async (db) => {
		const ctx = testCtx({ db, now: NOW });
		await expect(
			resetPassword(ctx, { token: '', password: 'long-enough', clientKey: CLIENT_KEY })
		).rejects.toMatchObject({ code: 'invalid', message: RESET_FIELDS_REQUIRED_MESSAGE });
		await expect(
			resetPassword(ctx, { token: 'not.a.jwt', password: 'short', clientKey: CLIENT_KEY })
		).rejects.toMatchObject({ code: 'invalid', message: PASSWORD_TOO_SHORT_MESSAGE });
	});

	rollbackTest('refuses a token it did not sign', async (db) => {
		const ctx = testCtx({ db, now: NOW });
		await expect(
			resetPassword(ctx, {
				token: 'not.a.jwt',
				password: 'long-enough-password',
				clientKey: CLIENT_KEY
			})
		).rejects.toMatchObject({ code: 'invalid', message: RESET_INVALID_TOKEN_MESSAGE });
	});

	rollbackTest('refuses a signed token without an email claim', async (db) => {
		const ctx = testCtx({ db, now: NOW });
		const token = await mintResetToken(ctx, { code: '12345678' });
		await expect(
			resetPassword(ctx, { token, password: 'long-enough-password', clientKey: CLIENT_KEY })
		).rejects.toMatchObject({ code: 'invalid', message: RESET_INVALID_PAYLOAD_MESSAGE });
	});

	// Q-102 B: a sign-in link is signed with the same secret and carries an
	// `email` claim, but nothing marks it for a reset, so it is refused.
	rollbackTest('refuses a signed token whose purpose is not a reset', async (db) => {
		const ctx = testCtx({ db, now: NOW });
		const person = await seedUser(db, {
			email: 'login-link@example.test',
			passwordHash: 'seeded-hash'
		});
		const token = await createJWT(
			'HS256',
			new TextEncoder().encode(ctx.config.codePepper),
			{ kind: 'login', email: 'login-link@example.test', code: '13572468' },
			{ headers: { alg: 'HS256', typ: 'JWT' }, expiresIn: new TimeSpan(15, 'm') }
		);
		await expect(
			resetPassword(ctx, { token, password: 'long-enough-password', clientKey: CLIENT_KEY })
		).rejects.toMatchObject({ code: 'invalid', message: RESET_INVALID_PAYLOAD_MESSAGE });
		const [row] = await db.select().from(users).where(eq(users.id, person.id));
		expect(row?.passwordHash).toBe('seeded-hash');
	});

	rollbackTest('answers Account not found for a signed token with no account', async (db) => {
		const ctx = testCtx({ db, now: NOW });
		const token = await mintResetToken(ctx, { email: 'gone@example.test' });
		await expect(
			resetPassword(ctx, { token, password: 'long-enough-password', clientKey: CLIENT_KEY })
		).rejects.toMatchObject({ code: 'invalid', message: RESET_ACCOUNT_NOT_FOUND_MESSAGE });
		// The marker is written only after the account is found.
		expect(await db.select().from(codes)).toEqual([]);
	});

	// Q-066 B: the cap lives here, so the web form spends the same bucket the
	// mobile door does. It runs before the field checks, as the wrapper's did.
	rollbackTest('throttles attempts at 10 per 15 minutes per client key', async (db) => {
		const ctx = testCtx({ db, now: NOW });
		for (let attempt = 0; attempt < RESET_ATTEMPT_LIMIT; attempt += 1) {
			await expect(
				resetPassword(ctx, { token: 'not.a.jwt', password: 'long-enough', clientKey: CLIENT_KEY })
			).rejects.toMatchObject({ message: RESET_INVALID_TOKEN_MESSAGE });
		}
		await expect(
			resetPassword(ctx, { token: 'not.a.jwt', password: 'long-enough', clientKey: CLIENT_KEY })
		).rejects.toMatchObject({ code: 'tooMany', message: RATE_LIMIT_MESSAGE });
		// A new client key is a new bucket.
		await expect(
			resetPassword(ctx, {
				token: 'not.a.jwt',
				password: 'long-enough',
				clientKey: 'pw-reset-ip:10.0.0.2'
			})
		).rejects.toMatchObject({ message: RESET_INVALID_TOKEN_MESSAGE });
	});

	rollbackTest(
		'resets the password, kills every session and token, and refuses the link again',
		async (db) => {
			const ctx = testCtx({ db, now: NOW });
			const person = await seedUser(db, {
				email: 'reset-ok@example.test',
				passwordHash: 'seeded-hash',
				emailVerified: true
			});
			await db.insert(authSession).values({
				id: 'session-reset',
				token: 'session-token-reset',
				userId: person.id,
				expiresAt: new Date('2099-01-01T00:00:00.000Z')
			});
			await db.insert(apiTokens).values({
				userId: person.id,
				name: 'Old phone',
				tokenHash: sha256Hex('fp_doomed')
			});

			const token = await mintResetToken(ctx, { email: 'reset-ok@example.test' });
			const parsed = parseJWT(token);
			expect(
				await resetPassword(ctx, {
					token,
					password: 'a-brand-new-password',
					clientKey: CLIENT_KEY
				})
			).toEqual({ success: true });

			const [row] = await db.select().from(users).where(eq(users.id, person.id));
			expect(row?.passwordHash).toMatch(/^\$2[aby]\$/);
			expect(row?.passwordHash).not.toBe('seeded-hash');
			expect(await db.select().from(authSession).where(eq(authSession.userId, person.id))).toEqual(
				[]
			);
			expect(await db.select().from(apiTokens).where(eq(apiTokens.userId, person.id))).toEqual([]);

			// Q-116/Q-117: the marker is the keyed digest of `used:<sha256(token)>`.
			const [marker] = await db
				.select()
				.from(codes)
				.where(eq(codes.type, 'reset_used'));
			expect(marker?.code).toBe(
				hmacSha256Hex(ctx.config.codePepper, `used:${sha256Hex(token)}`)
			);
			expect(marker?.email).toBe('reset-ok@example.test');
			expect(marker?.expiresAt.getTime()).toBe(parsed?.expiresAt?.getTime());

			await expect(
				resetPassword(ctx, {
					token,
					password: 'another-brand-new-password',
					clientKey: CLIENT_KEY
				})
			).rejects.toMatchObject({ code: 'invalid', message: RESET_USED_MESSAGE });
		}
	);

	rollbackTest('refuses a second use of the same link before relooking the account', async (db) => {
		const ctx = testCtx({ db, now: NOW });
		const token = await mintResetToken(ctx, { email: 'used-marker@example.test' });
		await issueEmailCode(ctx, {
			code: `used:${sha256Hex(token)}`,
			email: 'used-marker@example.test',
			type: 'reset_used'
		});
		await expect(
			resetPassword(ctx, { token, password: 'long-enough-password', clientKey: CLIENT_KEY })
		).rejects.toMatchObject({ code: 'invalid', message: RESET_USED_MESSAGE });
	});
});

describe('signOutEverywhere', () => {
	rollbackTest('ends every session and revokes every token of one person only', async (db) => {
		const ctx = testCtx({ db, now: NOW });
		const person = await seedUser(db, { email: 'everywhere@example.test' });
		const other = await seedUser(db, { email: 'other@example.test' });
		for (const [id, userId] of [
			['s-1', person.id],
			['s-2', person.id],
			['s-3', other.id]
		] as const) {
			await db.insert(authSession).values({
				id,
				token: `token-${id}`,
				userId,
				expiresAt: new Date('2099-01-01T00:00:00.000Z')
			});
		}
		await db.insert(apiTokens).values({ userId: person.id, name: 'A', tokenHash: sha256Hex('fp_a') });
		await db.insert(apiTokens).values({ userId: other.id, name: 'B', tokenHash: sha256Hex('fp_b') });

		await signOutEverywhere(ctx, person.id);

		expect(await db.select().from(authSession).where(eq(authSession.userId, person.id))).toEqual(
			[]
		);
		expect(await db.select().from(apiTokens).where(eq(apiTokens.userId, person.id))).toEqual([]);
		// The other person's credentials survive untouched.
		expect(await db.select().from(authSession).where(eq(authSession.userId, other.id))).toHaveLength(
			1
		);
		expect(await db.select().from(apiTokens).where(eq(apiTokens.userId, other.id))).toHaveLength(1);
	});
});
