/**
 * access account against real Postgres: email change and sign-out — every rule
 * titled after the Invariant it pins.
 *
 * Codes are issued through identity (`issueEmailCode`) and read back through
 * the service, so the digests under test are the ones production writes
 * (Q-116/Q-117). Pages' form copy is asserted where the flow owns it.
 *
 * Doc: ./README.md#invariants
 */
import { describe, expect } from 'vitest';
import { TimeSpan } from 'oslo';
import type { Actor } from '$lib/kernel/ctx/actor';
import {
	apiTokens,
	authSession,
	codes,
	users
} from '$lib/kernel/db/tables.server';
import { sha256Hex } from '$lib/kernel/ids/ids';
import { seedUser } from '$lib/kernel/testing/seedRows.server';
import { rollbackTest } from '$lib/kernel/testing/testDb.server';
import { testCtx } from '$lib/kernel/testing/testCtx.server';
import { eq } from 'drizzle-orm';
import { findEmailCode, issueEmailCode } from '$lib/domains/identity/index.server';
import {
	EMAIL_CHANGE_GUEST_MESSAGE,
	EMAIL_CHANGE_INVALID_MESSAGE,
	EMAIL_CHANGE_SAME_MESSAGE,
	EMAIL_CHANGE_SENT_MESSAGE,
	RATE_LIMIT_MESSAGE
} from './access.contract';
import {
	requestEmailChange,
	signOut,
	verifyEmailChange
} from './access.account.service.server';
import { signEmailToken } from './access.recovery.service.server';

const NOW = '2026-04-01T12:00:00.000Z';
const SITE_URL = 'https://familyplanz.test';

function actorOf(
	id: string,
	email: string | null,
	via: Actor['via'] = 'session'
): Actor {
	return { id, email, isAdmin: false, via };
}

function mailedCode(html: string): string {
	const match = /verification code is: (\d{8})/.exec(html);
	if (!match?.[1]) throw new Error('the mail carried no 8-digit code');
	return match[1];
}

describe('requestEmailChange', () => {
	rollbackTest('refuses an Anonymous Account with guestNeedsClaim', async (db) => {
		const ctx = testCtx({ db, now: NOW });
		const guest = await seedUser(db, { email: 'change-guest@anonymous.placeholder.invalid' });
		await expect(
			requestEmailChange(ctx, actorOf(guest.id, guest.email), {
				email: 'new@example.test',
				clientKey: `email-change:${guest.id}:10.3.0.1`,
				siteUrl: SITE_URL
			})
		).rejects.toMatchObject({
			code: 'invalid',
			message: EMAIL_CHANGE_GUEST_MESSAGE,
			extra: { guestNeedsClaim: true }
		});
	});

	rollbackTest('requires an @ and a different address', async (db) => {
		const ctx = testCtx({ db, now: NOW });
		const person = await seedUser(db, { email: 'change-same@example.test' });
		const change = (email: string) =>
			requestEmailChange(ctx, actorOf(person.id, person.email), {
				email,
				clientKey: `email-change:${person.id}:10.3.0.2`,
				siteUrl: SITE_URL
			});

		await expect(change('nope')).rejects.toMatchObject({
			code: 'invalid',
			message: EMAIL_CHANGE_INVALID_MESSAGE
		});
		await expect(change('change-same@example.test')).rejects.toMatchObject({
			code: 'invalid',
			message: EMAIL_CHANGE_SAME_MESSAGE
		});
	});

	rollbackTest('mails the NEW address and binds the row to the current one', async (db) => {
		const ctx = testCtx({ db, now: NOW });
		const person = await seedUser(db, { email: 'change-ok@example.test' });
		// A pending code for the current address is replaced by the new request.
		await issueEmailCode(ctx, {
			code: 'used:marker',
			email: 'change-ok@example.test',
			type: 'reset_used'
		});

		expect(
			await requestEmailChange(ctx, actorOf(person.id, person.email), {
				email: 'brand-new@example.test',
				clientKey: `email-change:${person.id}:10.3.1.1`,
				siteUrl: SITE_URL
			})
		).toEqual({ success: true, message: EMAIL_CHANGE_SENT_MESSAGE });

		const [mail] = ctx.mail.outbox;
		expect(mail?.to).toBe('brand-new@example.test');
		expect(mail?.subject).toBe('Family Planz Email Change Verification');
		const code = mailedCode(mail?.html ?? '');
		expect(mail?.html).toContain('/account/verify-email?token=');

		const rows = await db.select().from(codes).where(eq(codes.email, 'change-ok@example.test'));
		expect(rows).toHaveLength(1);
		expect(rows[0]?.type).toBe('email_change');
		expect(rows[0]?.pendingEmail).toBe('brand-new@example.test');
		expect(rows[0]?.expiresAt).toEqual(new Date(new Date(NOW).getTime() + 15 * 60 * 1000));
		// The row is keyed on the plaintext code, hashed by identity.
		const found = await findEmailCode(ctx, {
			code,
			email: 'change-ok@example.test',
			type: 'email_change'
		});
		expect(found?.pendingEmail).toBe('brand-new@example.test');
	});

	rollbackTest('throttles requests at 3 per 15 minutes per person and client', async (db) => {
		const ctx = testCtx({ db, now: NOW });
		const person = await seedUser(db, { email: 'change-429@example.test' });
		const key = `email-change:${person.id}:10.3.2.1`;
		const change = () =>
			requestEmailChange(ctx, actorOf(person.id, person.email), {
				email: '',
				clientKey: key,
				siteUrl: SITE_URL
			});
		for (let attempt = 0; attempt < 3; attempt += 1) {
			await expect(change()).rejects.toMatchObject({ code: 'invalid' });
		}
		await expect(change()).rejects.toMatchObject({ code: 'tooMany', message: RATE_LIMIT_MESSAGE });
	});
});

describe('verifyEmailChange', () => {
	rollbackTest('applies the pending address from a code and burns it', async (db) => {
		const ctx = testCtx({ db, now: NOW });
		const person = await seedUser(db, { email: 'apply-code@example.test' });
		await issueEmailCode(ctx, {
			code: '13572468',
			email: 'apply-code@example.test',
			type: 'email_change',
			pendingEmail: 'applied@example.test'
		});

		expect(
			await verifyEmailChange(ctx, actorOf(person.id, person.email), {
				code: '13572468',
				clientKey: 'verify-email-change:10.4.0.1'
			})
		).toEqual({ success: true, message: 'Email verified successfully!' });

		const [row] = await db.select().from(users).where(eq(users.id, person.id));
		expect(row?.email).toBe('applied@example.test');
		expect(row?.emailVerified).toBe(true);
		expect(await db.select().from(codes)).toEqual([]);
	});

	rollbackTest('rejects a code bound to another consumer', async (db) => {
		const ctx = testCtx({ db, now: NOW });
		const person = await seedUser(db, { email: 'consumer@example.test' });
		await seedUser(db, { email: 'victim@example.test' });
		await issueEmailCode(ctx, {
			code: '86420975',
			email: 'victim@example.test',
			type: 'email_change',
			pendingEmail: 'sniffed@example.test'
		});

		await expect(
			verifyEmailChange(ctx, actorOf(person.id, person.email), {
				code: '86420975',
				clientKey: 'verify-email-change:10.4.0.2'
			})
		).rejects.toMatchObject({ code: 'invalid', message: 'Invalid verification code' });
		expect(await db.select().from(codes)).toHaveLength(1);
	});

	rollbackTest('refuses an expired code', async (db) => {
		const ctx = testCtx({ db, now: NOW });
		const person = await seedUser(db, { email: 'change-expired@example.test' });
		await issueEmailCode(ctx, {
			code: '10101010',
			email: 'change-expired@example.test',
			type: 'email_change',
			pendingEmail: 'late@example.test',
			expiresAt: new Date(new Date(NOW).getTime() - 1_000)
		});
		await expect(
			verifyEmailChange(ctx, actorOf(person.id, person.email), {
				code: '10101010',
				clientKey: 'verify-email-change:10.4.0.3'
			})
		).rejects.toMatchObject({ code: 'invalid', message: 'Verification code has expired' });
	});

	rollbackTest('refuses a pending address already in use and keeps the code', async (db) => {
		const ctx = testCtx({ db, now: NOW });
		const person = await seedUser(db, { email: 'taken-consumer@example.test' });
		await seedUser(db, { email: 'taken@example.test' });
		await issueEmailCode(ctx, {
			code: '20202020',
			email: 'taken-consumer@example.test',
			type: 'email_change',
			pendingEmail: 'taken@example.test'
		});
		await expect(
			verifyEmailChange(ctx, actorOf(person.id, person.email), {
				code: '20202020',
				clientKey: 'verify-email-change:10.4.0.4'
			})
		).rejects.toMatchObject({ code: 'invalid', message: 'That email is already in use' });
		expect(await db.select().from(codes)).toHaveLength(1);
	});

	rollbackTest('applies the pending address from the mailed token', async (db) => {
		const ctx = testCtx({ db, now: NOW });
		const person = await seedUser(db, { email: 'apply-token@example.test' });
		await issueEmailCode(ctx, {
			code: '30303030',
			email: 'apply-token@example.test',
			type: 'email_change',
			pendingEmail: 'token-applied@example.test'
		});
		const token = await signEmailToken(
			ctx,
			{ code: '30303030', pendingEmail: 'token-applied@example.test' },
			new TimeSpan(15, 'm')
		);

		expect(
			await verifyEmailChange(ctx, actorOf(person.id, person.email), {
				token,
				clientKey: 'verify-email-change:10.4.1.1'
			})
		).toEqual({ success: true, message: 'Email verified successfully!' });
		const [row] = await db.select().from(users).where(eq(users.id, person.id));
		expect(row?.email).toBe('token-applied@example.test');
	});

	rollbackTest('refuses a token whose pending address does not match its code', async (db) => {
		const ctx = testCtx({ db, now: NOW });
		const person = await seedUser(db, { email: 'token-mismatch@example.test' });
		await issueEmailCode(ctx, {
			code: '40404040',
			email: 'token-mismatch@example.test',
			type: 'email_change',
			pendingEmail: 'real@example.test'
		});
		const token = await signEmailToken(
			ctx,
			{ code: '40404040', pendingEmail: 'spoofed@example.test' },
			new TimeSpan(15, 'm')
		);
		await expect(
			verifyEmailChange(ctx, actorOf(person.id, person.email), {
				token,
				clientKey: 'verify-email-change:10.4.1.2'
			})
		).rejects.toMatchObject({ code: 'invalid', message: 'Invalid or expired token' });
	});

	rollbackTest('requires a token or a code', async (db) => {
		const ctx = testCtx({ db, now: NOW });
		const person = await seedUser(db, { email: 'change-empty@example.test' });
		await expect(
			verifyEmailChange(ctx, actorOf(person.id, person.email), {
				clientKey: 'verify-email-change:10.4.2.1'
			})
		).rejects.toMatchObject({ code: 'invalid', message: 'Verification code is required' });
	});
});

describe('signOut', () => {
	rollbackTest('revokes exactly the presented token and leaves sessions alone', async (db) => {
		const ctx = testCtx({ db, now: NOW });
		const person = await seedUser(db, { email: 'logout-token@example.test' });
		await db.insert(apiTokens).values([
			{ userId: person.id, name: 'Presented', tokenHash: sha256Hex('fp_presented') },
			{ userId: person.id, name: 'Other', tokenHash: sha256Hex('fp_other') }
		]);
		await db.insert(authSession).values({
			id: 'session-logout',
			token: 'session-token-logout',
			userId: person.id,
			expiresAt: new Date('2099-01-01T00:00:00.000Z')
		});

		expect(
			await signOut(ctx, actorOf(person.id, person.email, 'token'), { token: 'fp_presented' })
		).toEqual({ success: true });

		const remaining = await db.select().from(apiTokens).where(eq(apiTokens.userId, person.id));
		expect(remaining.map((row) => row.name)).toEqual(['Other']);
		expect(await db.select().from(authSession).where(eq(authSession.userId, person.id))).toHaveLength(
			1
		);
	});

	rollbackTest('ends exactly the presented session and returns no cookie', async (db) => {
		const ctx = testCtx({ db, now: NOW });
		const person = await seedUser(db, { email: 'logout-session@example.test' });
		await db.insert(authSession).values([
			{ id: 'session-keep', token: 'token-keep', userId: person.id, expiresAt: new Date('2099-01-01T00:00:00.000Z') },
			{ id: 'session-end', token: 'token-end', userId: person.id, expiresAt: new Date('2099-01-01T00:00:00.000Z') }
		]);
		await db.insert(apiTokens).values({
			userId: person.id,
			name: 'Phone',
			tokenHash: sha256Hex('fp_survivor')
		});

		expect(await signOut(ctx, actorOf(person.id, person.email), { sessionId: 'session-end' })).toEqual(
			{ success: true }
		);

		const sessions = await db.select().from(authSession).where(eq(authSession.userId, person.id));
		expect(sessions.map((row) => row.id)).toEqual(['session-keep']);
		// A web sign-out is not a token sign-out.
		expect(await db.select().from(apiTokens).where(eq(apiTokens.userId, person.id))).toHaveLength(1);
	});
});
