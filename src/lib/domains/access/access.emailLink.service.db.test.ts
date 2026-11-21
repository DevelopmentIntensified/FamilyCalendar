/**
 * access email-link seam against real Postgres: the mail goes out before the
 * row is written, the gate runs once before the existence check, a suppressed
 * address consumes its hit, and the link's kind tag is enforced on the way back
 * in. `rollbackTest` plus a fixed clock make the 15-minute TTL exact.
 *
 * Doc: ./README.md#how-to-test
 */
import { TimeSpan } from 'oslo';
import { createJWT } from 'oslo/jwt';
import { eq } from 'drizzle-orm';
import { describe, expect } from 'vitest';
import { codes } from '$lib/kernel/db/tables.server';
import type { Db } from '$lib/kernel/db/database.server';
import { seedUser } from '$lib/kernel/testing/seedRows.server';
import { rollbackTest } from '$lib/kernel/testing/testDb.server';
import { testCtx, type TestCtx } from '$lib/kernel/testing/testCtx.server';
import {
	EMAIL_LINK_LIMIT,
	sendSignupVerificationCode,
	startEmailLink,
	verifyEmailLinkToken,
	type EmailLinkCopy
} from './access.emailLink.service.server';
import { accessTestIds } from './access.fixtures.server';

const NOW = new Date('2026-05-01T12:00:00.000Z');
const FIFTEEN_MINUTES = 15 * 60 * 1000;

/** The page routes' copy, verbatim, so a refusal here is the wire's. */
const COPY: EmailLinkCopy = {
	invalidEmail: 'Invalid email',
	missingName: 'First and last name are required',
	rateLimited: 'Too many attempts. Try again shortly.'
};

function ctxFor(db: Db): TestCtx {
	return { ...testCtx({ db, now: NOW.toISOString() }), ids: accessTestIds() };
}

function mailedCode(ctx: TestCtx, index = 0): string {
	const html = ctx.mail.outbox[index]?.html ?? '';
	const match = /(\d{8})/.exec(html);
	if (!match) throw new Error('no 8-digit code in the mailed html');
	return match[1];
}

function mailedToken(ctx: TestCtx, index = 0): string {
	const html = ctx.mail.outbox[index]?.html ?? '';
	const match = /token=([^"&\s]+)/.exec(html);
	if (!match) throw new Error('no link token in the mailed html');
	return decodeURIComponent(match[1]);
}

describe('startEmailLink', () => {
	rollbackTest('mails the kind-tagged link and only then writes the code row', async (db) => {
		const ctx = ctxFor(db);
		const email = 'signup-link@example.test';

		const result = await startEmailLink(ctx, {
			kind: 'signup',
			email,
			firstName: 'Noah',
			lastName: 'Kim',
			redirectTo: '/family/join/abc',
			clientIp: '10.20.0.1',
			baseUrl: 'https://test.familyplanz.com',
			copy: COPY
		});

		expect(result).toEqual({ sent: true });
		expect(ctx.mail.outbox).toHaveLength(1);
		const message = ctx.mail.outbox[0];
		expect(message.to).toBe(email);
		expect(message.from).toBe('noReply@familyplanz.com');
		expect(message.subject).toBe(`Family Planz Email Confirmation for ${email}`);

		const code = mailedCode(ctx);
		expect(message.html).toContain(code);
		expect(message.html).toContain(
			'https://test.familyplanz.com/signup/email/callback?token='
		);

		const rows = await db.select().from(codes).where(eq(codes.email, email));
		expect(rows).toHaveLength(1);
		const [row] = rows;
		expect(row.type).toBe('signup');
		expect([row.firstName, row.lastName]).toEqual(['Noah', 'Kim']);
		// #162/#117: only a keyed digest reaches the row, never the digits.
		expect(row.code).toMatch(/^[0-9a-f]{64}$/);
		expect(row.code).not.toBe(code);
		expect(row.expiresAt).toEqual(new Date(NOW.getTime() + FIFTEEN_MINUTES));
		expect(row.emailId).toBeNull();

		// The link carries the same code and the sanitised landing path.
		const verified = await verifyEmailLinkToken(ctx, mailedToken(ctx), 'signup');
		expect(verified).toEqual({
			ok: true,
			payload: {
				kind: 'signup',
				email,
				code,
				firstName: 'Noah',
				lastName: 'Kim',
				redirectTo: '/family/join/abc'
			}
		});
	});

	rollbackTest('suppresses a registered sign-up address but still spends the gate', async (db) => {
		const ctx = ctxFor(db);
		const email = 'already-here@example.test';
		await seedUser(db, { email });
		const input = {
			kind: 'signup' as const,
			email,
			firstName: 'Ada',
			lastName: 'Lovelace',
			clientIp: '10.20.0.2',
			copy: COPY
		};

		for (let attempt = 0; attempt < EMAIL_LINK_LIMIT.limit; attempt += 1) {
			expect(await startEmailLink(ctx, input)).toEqual({ sent: true });
		}
		// The gate ran before the existence check, exactly once per call.
		await expect(startEmailLink(ctx, input)).rejects.toMatchObject({
			code: 'tooMany',
			message: 'Too many attempts. Try again shortly.'
		});
		expect(ctx.mail.outbox).toEqual([]);
		expect(await db.select().from(codes).where(eq(codes.email, email))).toEqual([]);
	});

	rollbackTest('suppresses an unknown login address without mailing', async (db) => {
		const ctx = ctxFor(db);
		const email = 'nobody@example.test';

		expect(
			await startEmailLink(ctx, {
				kind: 'login',
				email,
				clientIp: '10.20.0.3',
				copy: COPY
			})
		).toEqual({ sent: true });
		expect(ctx.mail.outbox).toEqual([]);
		expect(await db.select().from(codes).where(eq(codes.email, email))).toEqual([]);
	});

	rollbackTest('refuses the address before the names, and the names before the gate', async (db) => {
		const ctx = ctxFor(db);
		await expect(
			startEmailLink(ctx, {
				kind: 'signup',
				email: 'not-an-address',
				clientIp: '10.20.0.4',
				copy: COPY
			})
		).rejects.toMatchObject({ code: 'invalid', message: 'Invalid email' });

		await expect(
			startEmailLink(ctx, {
				kind: 'signup',
				email: 'names@example.test',
				firstName: 'Mia',
				clientIp: '10.20.0.5',
				copy: COPY
			})
		).rejects.toMatchObject({
			code: 'invalid',
			message: 'First and last name are required'
		});
		// No hit was spent on the name refusal.
		const allowed = [];
		for (let attempt = 0; attempt < EMAIL_LINK_LIMIT.limit; attempt += 1) {
			allowed.push(
				await startEmailLink(ctx, {
					kind: 'login',
					email: 'names@example.test',
					clientIp: '10.20.0.5',
					copy: COPY
				})
			);
		}
		expect(allowed).toHaveLength(EMAIL_LINK_LIMIT.limit);
	});

	rollbackTest('persists nothing when the provider refuses the message', async (db) => {
		const base = ctxFor(db);
		const ctx = {
			...base,
			mail: {
				send: async () => {
					throw new Error('smtp down');
				}
			}
		};
		const email = 'send-fails@example.test';

		const result = await startEmailLink(ctx, {
			kind: 'signup',
			email,
			firstName: 'Mia',
			lastName: 'Lopez',
			clientIp: '10.20.0.6',
			copy: COPY
		});

		expect(result).toEqual({ sent: false, reason: 'send-failed' });
		expect(await db.select().from(codes).where(eq(codes.email, email))).toEqual([]);
		expect(base.log.entries).toEqual([
			{
				level: 'error',
				event: 'access_email_link_send_failed',
				fields: { type: 'signup', message: 'smtp down' }
			}
		]);
		// The log line is not the wire: the address never reaches it.
		expect(JSON.stringify(base.log.entries)).not.toContain(email);
	});
});

describe('sendSignupVerificationCode', () => {
	rollbackTest('mails the code alone, stamped password-signup, on the shared bucket', async (db) => {
		const ctx = ctxFor(db);
		const email = 'Password-Link@example.test';

		const result = await sendSignupVerificationCode(ctx, {
			email,
			firstName: 'Ada',
			lastName: 'Lovelace',
			clientIp: '10.20.1.1',
			rateLimitedMessage: 'Too many attempts. Try again shortly.',
			callbackPath: '/signup/password/verify'
		});

		expect(result).toEqual({ sent: true });
		const message = ctx.mail.outbox[0];
		expect(message.html).toContain('Your Family Planz verification code is:');
		expect(message.html).not.toContain('token=');

		const rows = await db.select().from(codes).where(eq(codes.email, email));
		expect(rows.map((row) => row.type)).toEqual(['password-signup']);
		expect([rows[0].firstName, rows[0].lastName]).toEqual(['Ada', 'Lovelace']);
		expect(rows[0].expiresAt).toEqual(new Date(NOW.getTime() + FIFTEEN_MINUTES));

		// Lowercased address is the bucket: five hits, then the sixth is refused.
		const send = () =>
			sendSignupVerificationCode(ctx, {
				email,
				firstName: 'Ada',
				lastName: 'Lovelace',
				clientIp: '10.20.1.1',
				rateLimitedMessage: 'Too many attempts. Try again shortly.',
				callbackPath: '/signup/password/verify'
			});
		for (let attempt = 0; attempt < EMAIL_LINK_LIMIT.limit - 1; attempt += 1) {
			expect(await send()).toEqual({ sent: true });
		}
		await expect(send()).rejects.toMatchObject({ code: 'tooMany' });
		// A new client is a new bucket.
		expect(
			await sendSignupVerificationCode(ctx, {
				email: 'other@example.test',
				firstName: 'Ada',
				lastName: 'Lovelace',
				clientIp: '10.20.1.2',
				rateLimitedMessage: 'Too many attempts. Try again shortly.',
				callbackPath: '/signup/password/verify'
			})
		).toEqual({ sent: true });
	});
});

describe('verifyEmailLinkToken', () => {
	rollbackTest('refuses the other kind, a legacy kind-less token, a forgery and a junk value', async (db) => {
		const ctx = ctxFor(db);
		const secret = new TextEncoder().encode(ctx.config.codePepper);
		const mint = (payload: object, expiresIn = new TimeSpan(15, 'm')) =>
			createJWT('HS256', secret, payload, {
				headers: { alg: 'HS256', typ: 'JWT' },
				expiresIn
			});

		const signupToken = await mint({ kind: 'signup', email: 'k@example.test', code: '12345678' });
		expect(await verifyEmailLinkToken(ctx, signupToken, 'login')).toEqual({
			ok: false,
			reason: 'kind-mismatch'
		});

		const legacyToken = await mint({ email: 'k@example.test', code: '12345678' });
		expect(await verifyEmailLinkToken(ctx, legacyToken, 'login')).toEqual({
			ok: false,
			reason: 'kind-mismatch'
		});

		const forged = await createJWT(
			'HS256',
			new TextEncoder().encode('another-secret'),
			{ kind: 'login', email: 'k@example.test', code: '12345678' },
			{ headers: { alg: 'HS256', typ: 'JWT' }, expiresIn: new TimeSpan(15, 'm') }
		);
		expect(await verifyEmailLinkToken(ctx, forged, 'login')).toEqual({
			ok: false,
			reason: 'invalid'
		});
		expect(await verifyEmailLinkToken(ctx, 'not-a-jwt', 'login')).toEqual({
			ok: false,
			reason: 'invalid'
		});

		// oslo's expiry throws a plain Error, so an expired link reads as invalid.
		const expired = await mint(
			{ kind: 'login', email: 'k@example.test', code: '12345678' },
			new TimeSpan(-1, 'm')
		);
		expect(await verifyEmailLinkToken(ctx, expired, 'login')).toEqual({
			ok: false,
			reason: 'invalid'
		});
	});
});
