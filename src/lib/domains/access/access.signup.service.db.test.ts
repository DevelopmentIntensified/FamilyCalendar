/**
 * access sign-up services against real Postgres: the two account-creation doors
 * (emailed link/code, email + password), the password-verification confirm and
 * its resend. Expected values come from the legacy routes and from the frozen
 * `access.http.db.test.ts` rows (the provider binding, the settings colour, the
 * lazily created personal calendar, the burned code).
 *
 * Doc: ./README.md#how-to-test
 */
import { eq } from 'drizzle-orm';
import { describe, expect } from 'vitest';
import { actorFromUser } from '$lib/kernel/ctx/actor';
import type { Db } from '$lib/kernel/db/database.server';
import {
	accounts,
	apiTokens,
	authSession,
	calendars,
	codes,
	userSettings,
	users
} from '$lib/kernel/db/tables.server';
import { seedUser } from '$lib/kernel/testing/seedRows.server';
import { rollbackTest } from '$lib/kernel/testing/testDb.server';
import { testCtx, type TestCtx } from '$lib/kernel/testing/testCtx.server';
import { issueEmailCode } from '$lib/domains/identity/index.server';
import {
	ACCESS_ANON_DOMAIN,
	accessTestIds,
	seedAccessProviderAccount
} from './access.fixtures.server';
import { startEmailLogin } from './access.login.service.server';
import {
	completeEmailSignupCode,
	completeEmailSignupLink,
	resendSignupCode,
	signUpMobileWithPassword,
	signUpWebWithPassword,
	signUpWithPassword,
	startEmailSignup,
	verifySignupCode
} from './access.signup.service.server';

const NOW = new Date('2026-05-02T12:00:00.000Z');
const FIFTEEN_MINUTES = 15 * 60 * 1000;

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

async function codesFor(db: Db, email: string) {
	return await db.select().from(codes).where(eq(codes.email, email));
}

describe('startEmailSignup', () => {
	rollbackTest('mails a signup link for a fresh address and stores its names', async (db) => {
		const ctx = ctxFor(db);
		const email = 'fresh-signup@example.test';

		expect(
			await startEmailSignup(ctx, {
				email,
				firstName: ' Noah ',
				lastName: 'Kim',
				redirectTo: '/family/join/abc',
				clientIp: '10.21.0.1'
			})
		).toEqual({ sent: true });

		const rows = await codesFor(db, email);
		expect(rows.map((row) => [row.type, row.firstName, row.lastName])).toEqual([
			['signup', ' Noah ', 'Kim']
		]);
		expect(rows[0].expiresAt).toEqual(new Date(NOW.getTime() + FIFTEEN_MINUTES));
	});

	rollbackTest('answers {sent:true} without mailing for an address that already has an account', async (db) => {
		const ctx = ctxFor(db);
		const email = 'taken-signup@example.test';
		await seedUser(db, { email });

		expect(
			await startEmailSignup(ctx, {
				email,
				firstName: 'Ada',
				lastName: 'Lovelace',
				clientIp: '10.21.0.2'
			})
		).toEqual({ sent: true });
		expect(ctx.mail.outbox).toEqual([]);
		expect(await codesFor(db, email)).toEqual([]);
	});
});

describe('signUpWithPassword', () => {
	rollbackTest('creates the unverified person, its calendar and the code-only mail', async (db) => {
		const ctx = ctxFor(db);
		const email = 'password-signup@example.test';

		const result = await signUpWithPassword(ctx, {
			email,
			password: 'a-long-enough-password',
			firstName: 'Mia',
			lastName: 'Lopez',
			clientIp: '10.21.1.1'
		});
		expect(result.created).toBe(true);

		const [person] = await db.select().from(users).where(eq(users.email, email));
		expect(person).toBeDefined();
		expect(person.emailVerified).toBe(false);
		expect(person.passwordHash).not.toBeNull();
		// `createUser` (not `createNewUser`): no provider binding, no settings row.
		expect(await db.select().from(accounts).where(eq(accounts.userId, person.id))).toEqual([]);
		expect(
			await db.select().from(userSettings).where(eq(userSettings.userId, person.id))
		).toEqual([]);
		expect(
			(await db.select().from(calendars).where(eq(calendars.ownerId, person.id))).map(
				(row) => row.familyId
			)
		).toEqual([null]);

		const rows = await codesFor(db, email);
		expect(rows.map((row) => [row.type, row.firstName, row.lastName])).toEqual([
			['password-signup', 'Mia', 'Lopez']
		]);
		expect(ctx.mail.outbox).toHaveLength(1);
		expect(ctx.mail.outbox[0].html).toContain('Your Family Planz verification code is:');
		expect(ctx.mail.outbox[0].html).toContain(mailedCode(ctx));
	});

	rollbackTest('answers created:false for a taken address — no mail, no rows', async (db) => {
		const ctx = ctxFor(db);
		const email = 'password-taken@example.test';
		const existing = await seedUser(db, { email });

		const result = await signUpWithPassword(ctx, {
			email,
			password: 'a-long-enough-password',
			firstName: 'Mia',
			lastName: 'Lopez',
			clientIp: '10.21.1.2'
		});
		expect(result).toEqual({ created: false });
		expect(ctx.mail.outbox).toEqual([]);
		expect(await codesFor(db, email)).toEqual([]);
		expect(await db.select().from(users).where(eq(users.email, email))).toHaveLength(1);
		expect(
			await db.select().from(calendars).where(eq(calendars.ownerId, existing.id))
		).toEqual([]);
	});

	rollbackTest('refuses the fields, then the length, then the two buckets', async (db) => {
		const ctx = ctxFor(db);
		await expect(
			signUpWithPassword(ctx, {
				email: '',
				password: 'a-long-enough-password',
				firstName: 'Mia',
				lastName: 'Lopez',
				clientIp: '10.21.1.3'
			})
		).rejects.toMatchObject({ code: 'invalid', message: 'All fields are required' });

		await expect(
			signUpWithPassword(ctx, {
				email: 'short@example.test',
				password: 'short',
				firstName: 'Mia',
				lastName: 'Lopez',
				clientIp: '10.21.1.4'
			})
		).rejects.toMatchObject({
			code: 'invalid',
			message: 'Password must be at least 8 characters'
		});

		const attempt = (ip: string, email: string) =>
			signUpWithPassword(ctx, {
				email,
				password: 'a-long-enough-password',
				firstName: 'Mia',
				lastName: 'Lopez',
				clientIp: ip
			});
		const email = 'burst@example.test';
		// 10 / 5 min per address + IP: the eleventh attempt on that pair is refused.
		// (The first creates the account; the rest answer the same pending shape.)
		for (let index = 0; index < 10; index += 1) {
			await attempt('10.21.1.5', email);
		}
		await expect(attempt('10.21.1.5', email)).rejects.toMatchObject({
			code: 'tooMany',
			message: 'Too many attempts. Try again shortly.'
		});
		// The same address from a new client is a new bucket.
		expect(await attempt('10.21.1.6', email)).toEqual({ created: false });
	});
});

describe('resendSignupCode', () => {
	rollbackTest('mails an unverified person, no-ops once verified, and refuses a guest', async (db) => {
		const ctx = ctxFor(db);
		const email = 'resend@example.test';
		const person = await seedUser(db, {
			email,
			emailVerified: false,
			firstName: 'Ada',
			lastName: 'Lovelace'
		});

		expect(await resendSignupCode(ctx, actorFromUser(person), { clientIp: '10.21.2.1' })).toEqual({
			sent: true
		});
		const rows = await codesFor(db, email);
		expect(rows.map((row) => [row.type, row.firstName, row.lastName])).toEqual([
			['password-signup', 'Ada', 'Lovelace']
		]);
		expect(ctx.mail.outbox).toHaveLength(1);

		const verified = await seedUser(db, { email: 'verified@example.test', emailVerified: true });
		expect(
			await resendSignupCode(ctx, actorFromUser(verified), { clientIp: '10.21.2.2' })
		).toEqual({ sent: true });
		expect(ctx.mail.outbox).toHaveLength(1);

		const guest = await seedUser(db, {
			email: `guest-resend${ACCESS_ANON_DOMAIN}`,
			firstName: 'Guest',
			lastName: '',
			emailVerified: false
		});
		await expect(
			resendSignupCode(ctx, actorFromUser(guest), { clientIp: '10.21.2.3' })
		).rejects.toMatchObject({ code: 'unauthorized', message: 'Unauthorized' });

		// 5 / 15 min per person + IP, and the IP budget does not block a new client.
		for (let index = 0; index < 5; index += 1) {
			await resendSignupCode(ctx, actorFromUser(person), { clientIp: '10.21.2.4' });
		}
		await expect(
			resendSignupCode(ctx, actorFromUser(person), { clientIp: '10.21.2.4' })
		).rejects.toMatchObject({ code: 'tooMany' });
		expect(
			await resendSignupCode(ctx, actorFromUser(person), { clientIp: '10.21.2.5' })
		).toEqual({ sent: true });
	});
});

describe('verifySignupCode', () => {
	rollbackTest('flips emailVerified, burns the code, and is a success no-op once verified', async (db) => {
		const ctx = ctxFor(db);
		const email = 'verify@example.test';
		const person = await seedUser(db, { email, emailVerified: false });
		await issueEmailCode(ctx, { code: '13572468', email, type: 'password-signup' });

		await verifySignupCode(ctx, { code: '13572468', email, clientIp: '10.21.3.1' });

		const [updated] = await db.select().from(users).where(eq(users.id, person.id));
		expect(updated.emailVerified).toBe(true);
		expect(await codesFor(db, email)).toEqual([]);

		// Idempotent: a second live code for an already-verified person is burned
		// without a second write failing.
		await issueEmailCode(ctx, { code: '24681357', email, type: 'password-signup' });
		await verifySignupCode(ctx, { code: '24681357', email, clientIp: '10.21.3.2' });
		expect(await codesFor(db, email)).toEqual([]);
	});

	rollbackTest('reads one generic 400 for a wrong type and burns the code of a gone person', async (db) => {
		const ctx = ctxFor(db);
		const email = 'verify-typed@example.test';
		await seedUser(db, { email, emailVerified: false });
		await issueEmailCode(ctx, { code: '11223344', email, type: 'login' });

		await expect(
			verifySignupCode(ctx, { code: '11223344', email, clientIp: '10.21.3.3' })
		).rejects.toMatchObject({
			code: 'invalid',
			message: 'Unexpected error, please try again'
		});
		// A mismatched type is not the row this door redeems: it survives.
		expect(await codesFor(db, email)).toHaveLength(1);

		const orphanEmail = 'verify-orphan@example.test';
		await issueEmailCode(ctx, {
			code: '55667788',
			email: orphanEmail,
			type: 'password-signup'
		});
		await expect(
			verifySignupCode(ctx, { code: '55667788', email: orphanEmail, clientIp: '10.21.3.4' })
		).rejects.toMatchObject({ code: 'invalid' });
		// Legacy burned the code whose person row was gone.
		expect(await codesFor(db, orphanEmail)).toEqual([]);
	});
});

describe('completeEmailSignupCode', () => {
	rollbackTest('creates the verified person, binding, settings and calendar, then signs in', async (db) => {
		const ctx = ctxFor(db);
		const email = 'code-signup@example.test';
		await startEmailSignup(ctx, {
			email,
			firstName: 'Noah',
			lastName: 'Kim',
			clientIp: '10.21.4.1'
		});
		const code = mailedCode(ctx);

		const result = await completeEmailSignupCode(ctx, {
			code,
			email,
			clientIp: '10.21.4.1'
		});
		expect(result.outcome).toBe('signed-in');

		const [person] = await db.select().from(users).where(eq(users.email, email));
		expect(person.emailVerified).toBe(true);
		expect([person.firstName, person.lastName]).toEqual(['Noah', 'Kim']);
		const bindings = await db.select().from(accounts).where(eq(accounts.userId, person.id));
		expect(bindings.map((row) => [row.provider, row.providerAccountId])).toEqual([
			['email', email]
		]);
		const settings = await db
			.select()
			.from(userSettings)
			.where(eq(userSettings.userId, person.id));
		expect(settings.map((row) => row.color)).toEqual([expect.stringMatching(/^#[0-9a-f]{1,6}$/)]);
		expect(
			(await db.select().from(calendars).where(eq(calendars.ownerId, person.id))).map(
				(row) => row.familyId
			)
		).toEqual([null]);
		expect(
			await db.select().from(authSession).where(eq(authSession.userId, person.id))
		).toHaveLength(1);
		if (result.outcome !== 'signed-in') throw new Error('expected a session');
		expect(result.cookie.value).toContain('.');
		expect(await codesFor(db, email)).toEqual([]);
	});

	rollbackTest('answers taken and burns the code when the address got an account', async (db) => {
		const ctx = ctxFor(db);
		const email = 'code-taken@example.test';
		const owner = await seedUser(db, { email: 'owner@example.test' });
		await seedAccessProviderAccount(email, owner.id, 'email', db);
		await issueEmailCode(ctx, {
			code: '99887766',
			email,
			type: 'signup',
			firstName: 'Mia',
			lastName: 'Lopez'
		});

		expect(
			await completeEmailSignupCode(ctx, { code: '99887766', email, clientIp: '10.21.4.2' })
		).toEqual({ outcome: 'taken' });
		expect(await codesFor(db, email)).toEqual([]);
		expect(await db.select().from(users).where(eq(users.email, email))).toEqual([]);
	});

	rollbackTest('keeps the code of a broken row and deletes an expired one', async (db) => {
		const ctx = ctxFor(db);
		const email = 'code-broken@example.test';
		await issueEmailCode(ctx, { code: '12344321', email, type: 'signup' });
		expect(
			await completeEmailSignupCode(ctx, { code: '12344321', email, clientIp: '10.21.4.3' })
		).toEqual({ outcome: 'broken-row' });
		expect(await codesFor(db, email)).toHaveLength(1);

		const expiredEmail = 'code-expired@example.test';
		await issueEmailCode(ctx, {
			code: '43211234',
			email: expiredEmail,
			type: 'signup',
			firstName: 'Ada',
			lastName: 'Lovelace',
			expiresAt: new Date(NOW.getTime() - 1000)
		});
		expect(
			await completeEmailSignupCode(ctx, {
				code: '43211234',
				email: expiredEmail,
				clientIp: '10.21.4.4'
			})
		).toEqual({ outcome: 'bad-code' });
		expect(await codesFor(db, expiredEmail)).toEqual([]);
	});
});

describe('signUpWebWithPassword / signUpMobileWithPassword', () => {
	rollbackTest('web: creates the account and its session cookie', async (db) => {
		const ctx = ctxFor(db);
		const result = await signUpWebWithPassword(ctx, {
			email: 'web-signup@example.test',
			password: 'a-long-enough-password',
			firstName: 'Mia',
			lastName: 'Lopez',
			clientIp: '10.21.6.1'
		});
		expect(result.outcome).toBe('created');
		if (result.outcome !== 'created') throw new Error('expected a session');
		expect(result.cookie.value).toContain('.');
		expect(
			await db.select().from(authSession).where(eq(authSession.userId, result.user.id))
		).toHaveLength(1);
	});

	rollbackTest('mobile: mints the Android token, and a taken address gets none', async (db) => {
		const ctx = ctxFor(db);
		const email = 'mobile-signup-wire@example.test';
		const created = await signUpMobileWithPassword(ctx, {
			email,
			password: 'a-long-enough-password',
			firstName: 'Mia',
			lastName: 'Lopez',
			deviceName: '  Pixel 9 Pro  ',
			clientIp: '10.21.6.2'
		});
		expect(created.outcome).toBe('created');
		if (created.outcome !== 'created') throw new Error('expected a token');
		expect(created.token).toMatch(/^fp_/);
		expect(
			(await db.select().from(apiTokens).where(eq(apiTokens.userId, created.user.id))).map(
				(row) => row.name
			)
		).toEqual(['Android — Pixel 9 Pro']);
		// No session row for the app: it is cookie-free.
		expect(
			await db.select().from(authSession).where(eq(authSession.userId, created.user.id))
		).toEqual([]);

		const mailsSoFar = ctx.mail.outbox.length;
		expect(
			await signUpMobileWithPassword(ctx, {
				email,
				password: 'a-long-enough-password',
				firstName: 'Mia',
				lastName: 'Lopez',
				deviceName: '',
				clientIp: '10.21.6.3'
			})
		).toEqual({ outcome: 'taken' });
		expect(ctx.mail.outbox).toHaveLength(mailsSoFar);
		expect(
			await db.select().from(apiTokens).where(eq(apiTokens.userId, created.user.id))
		).toHaveLength(1);
	});
});

describe('completeEmailSignupLink', () => {
	rollbackTest('creates the person and lands on the signed redirect target', async (db) => {
		const ctx = ctxFor(db);
		const email = 'link-signup@example.test';
		await startEmailSignup(ctx, {
			email,
			firstName: 'Noah',
			lastName: 'Kim',
			redirectTo: '/family/join/abc',
			clientIp: '10.21.5.1'
		});

		const result = await completeEmailSignupLink(ctx, {
			token: mailedToken(ctx),
			actor: null
		});
		expect(result.outcome).toBe('signed-in');
		if (result.outcome !== 'signed-in') throw new Error('expected a session');
		expect(result.redirectTo).toBe('/family/join/abc');
		const [person] = await db.select().from(users).where(eq(users.email, email));
		expect(person.emailVerified).toBe(true);
	});

	rollbackTest('refuses a login link, a guest-signin link for a registered person, and an absent token', async (db) => {
		const ctx = ctxFor(db);
		const person = await seedUser(db, { email: 'link-kind@example.test' });

		expect(await completeEmailSignupLink(ctx, { token: null, actor: null })).toEqual({
			outcome: 'invalid-token'
		});

		// A registered signed-in person lands on the calendar untouched.
		expect(
			await completeEmailSignupLink(ctx, { token: 'anything', actor: actorFromUser(person) })
		).toEqual({ outcome: 'already-signed-in', redirectTo: '/calendar/' });

		// A LOGIN link can never be consumed as a sign-up link (kind tag).
		const loginEmail = 'link-login-kind@example.test';
		await seedUser(db, { email: loginEmail });
		await startEmailLogin(ctx, { email: loginEmail, clientIp: '10.21.5.2' });
		expect(
			await completeEmailSignupLink(ctx, { token: mailedToken(ctx), actor: null })
		).toEqual({ outcome: 'invalid-token' });
	});
});
