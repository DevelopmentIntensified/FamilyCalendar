/**
 * access sign-in services against real Postgres: the link and code doors, the
 * password door the web and Android share, the Android Anonymous Account door,
 * the guest-session kill, and the two sign-outs. Expected values come from the
 * legacy routes and the frozen `access.http.db.test.ts` rows.
 *
 * Doc: ./README.md#how-to-test
 */
import { eq } from 'drizzle-orm';
import { describe, expect } from 'vitest';
import { actorFromUser } from '$lib/kernel/ctx/actor';
import type { Db } from '$lib/kernel/db/database.server';
import {
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
	ACCESS_PASSWORD_HASH,
	accessTestIds,
	seedAccessApiToken,
	seedAccessGuest,
	seedAccessSession
} from './access.fixtures.server';
import {
	completeEmailLoginCode,
	completeEmailLoginLink,
	createMobileGuest,
	requestMobileEmailCode,
	signInMobileWithPassword,
	signInWithPassword,
	startEmailLogin,
	verifyMobileEmailCode
} from './access.login.service.server';
import { signOut } from './access.account.service.server';

const NOW = new Date('2026-05-03T12:00:00.000Z');
const PASSWORD = 'correct-horse-battery';

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

async function tokensFor(db: Db, userId: string) {
	return await db.select().from(apiTokens).where(eq(apiTokens.userId, userId));
}

describe('startEmailLogin', () => {
	rollbackTest('mails a login link carrying the stored names', async (db) => {
		const ctx = ctxFor(db);
		const email = 'login-link@example.test';
		await seedUser(db, { email, firstName: 'Ada', lastName: 'Lovelace' });

		expect(await startEmailLogin(ctx, { email, clientIp: '10.22.0.1' })).toEqual({ sent: true });
		const rows = await codesFor(db, email);
		expect(rows.map((row) => [row.type, row.firstName, row.lastName])).toEqual([
			['login', 'Ada', 'Lovelace']
		]);
		expect(ctx.mail.outbox[0].html).toContain('/login/email/callback?token=');
		expect(mailedCode(ctx)).toMatch(/^\d{8}$/);
	});

	rollbackTest('answers {sent:true} without mailing for an unknown address', async (db) => {
		const ctx = ctxFor(db);
		const email = 'unknown-login@example.test';

		expect(await startEmailLogin(ctx, { email, clientIp: '10.22.0.2' })).toEqual({ sent: true });
		expect(ctx.mail.outbox).toEqual([]);
		expect(await codesFor(db, email)).toEqual([]);

		await expect(
			startEmailLogin(ctx, { email: 'nope', clientIp: '10.22.0.3' })
		).rejects.toMatchObject({ code: 'invalid', message: 'Invalid email' });
	});
});

describe('completeEmailLoginCode', () => {
	rollbackTest('signs in, burns the code, and ends exactly the arriving guest session', async (db) => {
		const ctx = ctxFor(db);
		const email = 'code-login@example.test';
		const person = await seedUser(db, { email });
		await issueEmailCode(ctx, { code: '11223344', email, type: 'login' });

		const guest = await seedAccessGuest();
		const arriving = await seedAccessSession(guest.id);
		const other = await seedAccessSession(guest.id);

		const result = await completeEmailLoginCode(ctx, {
			code: '11223344',
			email,
			actor: actorFromUser(guest, 'session'),
			sessionId: arriving.id,
			clientIp: '10.22.1.1'
		});
		expect(result.outcome).toBe('signed-in');
		expect(await codesFor(db, email)).toEqual([]);

		// The new session belongs to the person; only the arriving guest row died.
		const sessions = await db.select().from(authSession).where(eq(authSession.userId, person.id));
		expect(sessions).toHaveLength(1);
		const guestSessions = await db
			.select()
			.from(authSession)
			.where(eq(authSession.userId, guest.id));
		expect(guestSessions.map((row) => row.id)).toEqual([other.id]);
	});

	rollbackTest('leaves a registered session alone and keeps an orphaned code', async (db) => {
		const ctx = ctxFor(db);
		const person = await seedUser(db, { email: 'registered-login@example.test' });
		const current = await seedAccessSession(person.id, {}, db);
		await issueEmailCode(ctx, {
			code: '55667788',
			email: 'registered-login@example.test',
			type: 'login'
		});

		const signedIn = await completeEmailLoginCode(ctx, {
			code: '55667788',
			email: 'registered-login@example.test',
			actor: actorFromUser(person, 'session'),
			sessionId: current.id,
			clientIp: '10.22.1.2'
		});
		expect(signedIn.outcome).toBe('signed-in');
		// Same person, so the anonymous-swap rule does not fire.
		expect(
			(await db.select().from(authSession).where(eq(authSession.userId, person.id))).map(
				(row) => row.id
			)
		).toContain(current.id);

		const orphan = 'orphan-login@example.test';
		await issueEmailCode(ctx, { code: '99001122', email: orphan, type: 'login' });
		expect(
			await completeEmailLoginCode(ctx, {
				code: '99001122',
				email: orphan,
				actor: null,
				sessionId: null,
				clientIp: '10.22.1.3'
			})
		).toEqual({ outcome: 'no-account' });
		// Legacy returned before the delete: the row survives its full 15 minutes.
		expect(await codesFor(db, orphan)).toHaveLength(1);
	});
});

describe('completeEmailLoginLink', () => {
	rollbackTest('signed-in landing is re-sanitised and every code for the address goes', async (db) => {
		const ctx = ctxFor(db);
		const email = 'link-login@example.test';
		await seedUser(db, { email });
		await startEmailLogin(ctx, {
			email,
			redirectTo: '//evil.example.test',
			clientIp: '10.22.2.1'
		});
		await issueEmailCode(ctx, { code: '77889900', email, type: 'password-signup' });

		const guest = await seedAccessGuest();
		const arriving = await seedAccessSession(guest.id);
		const result = await completeEmailLoginLink(ctx, {
			token: mailedToken(ctx),
			actor: actorFromUser(guest, 'session'),
			sessionId: arriving.id
		});

		expect(result.outcome).toBe('signed-in');
		if (result.outcome !== 'signed-in') throw new Error('expected a session');
		// An unsafe `?redirect=` is dropped for the email fallback.
		expect(result.redirectTo).toBe('/calendar/');
		expect(await codesFor(db, email)).toEqual([]);
		expect(await db.select().from(authSession).where(eq(authSession.userId, guest.id))).toEqual(
			[]
		);
	});

	rollbackTest('refuses a registered signed-in person and a missing token', async (db) => {
		const ctx = ctxFor(db);
		const person = await seedUser(db, { email: 'already-signed@example.test' });

		expect(
			await completeEmailLoginLink(ctx, {
				token: 'anything',
				actor: actorFromUser(person, 'session'),
				sessionId: null
			})
		).toEqual({ outcome: 'already-signed-in' });
		expect(
			await completeEmailLoginLink(ctx, { token: null, actor: null, sessionId: null })
		).toEqual({ outcome: 'invalid-token' });
	});
});

describe('signInWithPassword', () => {
	rollbackTest('signs in with the stored hash and backfills the settings row', async (db) => {
		const ctx = ctxFor(db);
		const email = 'password-ok@example.test';
		const person = await seedUser(db, {
			email,
			passwordHash: ACCESS_PASSWORD_HASH
		});

		const result = await signInWithPassword(ctx, {
			email,
			password: PASSWORD,
			actor: null,
			sessionId: null,
			clientIp: '10.22.3.1'
		});
		expect(result.cookie.value).toContain('.');
		expect(
			await db.select().from(authSession).where(eq(authSession.userId, person.id))
		).toHaveLength(1);
		const [settings] = await db
			.select()
			.from(userSettings)
			.where(eq(userSettings.userId, person.id));
		expect(settings.timeZone).toBe('UTC');
	});

	rollbackTest('answers one generic 401 for a wrong password, an unknown address and a guest', async (db) => {
		const ctx = ctxFor(db);
		await seedUser(db, { email: 'password-wrong@example.test', passwordHash: ACCESS_PASSWORD_HASH });
		const guest = await seedAccessGuest();

		const attempt = (email: string, password: string, clientIp: string) =>
			signInWithPassword(ctx, { email, password, actor: null, sessionId: null, clientIp });

		await expect(attempt('password-wrong@example.test', 'not-it', '10.22.3.2')).rejects.toMatchObject(
			{ code: 'invalid', message: 'Invalid email or password' }
		);
		await expect(attempt('nobody@example.test', 'whatever', '10.22.3.3')).rejects.toMatchObject({
			code: 'invalid',
			message: 'Invalid email or password'
		});
		await expect(attempt(guest.email ?? '', 'whatever', '10.22.3.4')).rejects.toMatchObject({
			code: 'invalid',
			message: 'Invalid email or password'
		});
		// A passwordless account is told to use the email door instead.
		await seedUser(db, { email: 'passwordless@example.test' });
		await expect(
			attempt('passwordless@example.test', 'whatever', '10.22.3.5')
		).rejects.toMatchObject({
			code: 'invalid',
			message: 'Please use email login for this account'
		});
	});

	rollbackTest('throttles 10 per 5 minutes per address and IP', async (db) => {
		const ctx = ctxFor(db);
		const email = 'password-429@example.test';
		await seedUser(db, { email, passwordHash: ACCESS_PASSWORD_HASH });
		const attempt = (clientIp: string) =>
			signInWithPassword(ctx, {
				email,
				password: PASSWORD,
				actor: null,
				sessionId: null,
				clientIp
			});

		for (let index = 0; index < 10; index += 1) await attempt('10.22.3.6');
		await expect(attempt('10.22.3.6')).rejects.toMatchObject({ code: 'tooMany' });
		expect((await attempt('10.22.3.7')).cookie.value).toContain('.');
	});
});

describe('signInMobileWithPassword', () => {
	rollbackTest('mints an fp_ token, creates no cookie and no session', async (db) => {
		const ctx = ctxFor(db);
		const email = 'mobile-password@example.test';
		const person = await seedUser(db, { email, passwordHash: ACCESS_PASSWORD_HASH });

		const result = await signInMobileWithPassword(ctx, {
			email,
			password: PASSWORD,
			deviceName: '  Pixel 9 Pro  ',
			clientIp: '10.22.4.1'
		});
		expect(result.token).toMatch(/^fp_[A-Za-z0-9_-]{43}$/);
		expect(result.user).toEqual({
			id: person.id,
			firstName: person.firstName,
			lastName: person.lastName,
			email
		});
		expect((await tokensFor(db, person.id)).map((row) => row.name)).toEqual([
			'Android — Pixel 9 Pro'
		]);
		expect(
			await db.select().from(authSession).where(eq(authSession.userId, person.id))
		).toEqual([]);
	});

	rollbackTest('answers the one generic mobile 401 for a passwordless account', async (db) => {
		const ctx = ctxFor(db);
		await seedUser(db, { email: 'mobile-passwordless@example.test' });

		await expect(
			signInMobileWithPassword(ctx, {
				email: 'mobile-passwordless@example.test',
				password: 'whatever',
				deviceName: '',
				clientIp: '10.22.4.2'
			})
		).rejects.toMatchObject({ code: 'unauthorized', message: 'Email or password is incorrect' });
	});
});

describe('requestMobileEmailCode', () => {
	rollbackTest('sends for a known login and a fresh sign-up, sharing the web bucket', async (db) => {
		const ctx = ctxFor(db);
		const known = 'mobile-email-known@example.test';
		await seedUser(db, { email: known });

		expect(
			await requestMobileEmailCode(ctx, {
				email: known,
				intent: 'login',
				clientIp: '10.22.5.1'
			})
		).toEqual({ sent: true });
		expect((await codesFor(db, known)).map((row) => row.type)).toEqual(['login']);

		const fresh = 'mobile-email-fresh@example.test';
		expect(
			await requestMobileEmailCode(ctx, {
				email: fresh,
				intent: 'signup',
				firstName: 'Noah',
				lastName: 'Kim',
				clientIp: '10.22.5.2'
			})
		).toEqual({ sent: true });
		expect((await codesFor(db, fresh)).map((row) => [row.type, row.firstName])).toEqual([
			['signup', 'Noah']
		]);

		// Unknown login: the same 200, nothing sent.
		expect(
			await requestMobileEmailCode(ctx, {
				email: 'mobile-unknown@example.test',
				intent: 'login',
				clientIp: '10.22.5.3'
			})
		).toEqual({ sent: true });
		expect(await codesFor(db, 'mobile-unknown@example.test')).toEqual([]);
	});

	rollbackTest('validates address, intent and names, then throttles in the mobile copy', async (db) => {
		const ctx = ctxFor(db);
		const send = (clientIp: string) =>
			requestMobileEmailCode(ctx, {
				email: 'mobile-burst@example.test',
				intent: 'login',
				clientIp
			});

		await expect(
			requestMobileEmailCode(ctx, { email: 'nope', intent: 'login', clientIp: '10.22.5.4' })
		).rejects.toMatchObject({ code: 'invalid', message: 'Enter a valid email' });
		await expect(
			requestMobileEmailCode(ctx, {
				email: 'mobile-burst@example.test',
				intent: 'reset',
				clientIp: '10.22.5.4'
			})
		).rejects.toMatchObject({ code: 'invalid', message: 'intent must be "login" or "signup"' });
		await expect(
			requestMobileEmailCode(ctx, {
				email: 'mobile-burst@example.test',
				intent: 'signup',
				firstName: 'Noah',
				clientIp: '10.22.5.4'
			})
		).rejects.toMatchObject({ code: 'invalid', message: 'First and last name are required' });

		for (let index = 0; index < 5; index += 1) expect(await send('10.22.5.5')).toEqual({ sent: true });
		await expect(send('10.22.5.5')).rejects.toMatchObject({
			code: 'tooMany',
			message: 'Too many attempts — try again in a few minutes'
		});
		expect(await send('10.22.5.6')).toEqual({ sent: true });
	});
});

describe('verifyMobileEmailCode', () => {
	rollbackTest('login: mints a token for the binding owner and burns the code', async (db) => {
		const ctx = ctxFor(db);
		const email = 'mobile-verify@example.test';
		const person = await seedUser(db, { email, firstName: 'Ada', lastName: 'Lovelace' });
		await issueEmailCode(ctx, { code: '24682468', email, type: 'login' });

		const result = await verifyMobileEmailCode(ctx, {
			email,
			code: '24682468',
			intent: 'login',
			deviceName: 'Pixel 9 Pro',
			clientIp: '10.22.6.1'
		});
		expect(result.outcome).toBe('signed-in');
		if (result.outcome !== 'signed-in') throw new Error('expected a token');
		expect(result.user).toEqual({
			id: person.id,
			firstName: 'Ada',
			lastName: 'Lovelace',
			email
		});
		expect(await codesFor(db, email)).toEqual([]);
	});

	rollbackTest('signup: creates the verified person from the row names, then 409 for a taken address', async (db) => {
		const ctx = ctxFor(db);
		const email = 'mobile-signup@example.test';
		await issueEmailCode(ctx, {
			code: '44556677',
			email,
			type: 'signup',
			firstName: 'Noah',
			lastName: 'Kim'
		});

		const result = await verifyMobileEmailCode(ctx, {
			email,
			code: '44556677',
			intent: 'signup',
			deviceName: 'Pixel',
			clientIp: '10.22.6.2'
		});
		expect(result.outcome).toBe('signed-in');

		const [person] = await db.select().from(users).where(eq(users.email, email));
		expect(person.emailVerified).toBe(true);
		expect(
			(await db.select().from(calendars).where(eq(calendars.ownerId, person.id))).map(
				(row) => row.familyId
			)
		).toEqual([null]);
		expect(await db.select().from(userSettings).where(eq(userSettings.userId, person.id))).toHaveLength(1);
		expect(await codesFor(db, email)).toEqual([]);

		const taken = 'mobile-taken@example.test';
		await seedUser(db, { email: taken });
		await issueEmailCode(ctx, {
			code: '77889911',
			email: taken,
			type: 'signup',
			firstName: 'Mia',
			lastName: 'Lopez'
		});
		expect(
			await verifyMobileEmailCode(ctx, {
				email: taken,
				code: '77889911',
				intent: 'signup',
				deviceName: '',
				clientIp: '10.22.6.3'
			})
		).toEqual({ outcome: 'account-exists' });
		expect(await codesFor(db, taken)).toEqual([]);
	});

	rollbackTest('keeps an orphaned login code and refuses the other intent', async (db) => {
		const ctx = ctxFor(db);
		const orphan = 'mobile-orphan@example.test';
		await issueEmailCode(ctx, { code: '33441122', email: orphan, type: 'login' });
		expect(
			await verifyMobileEmailCode(ctx, {
				email: orphan,
				code: '33441122',
				intent: 'login',
				deviceName: '',
				clientIp: '10.22.6.4'
			})
		).toEqual({ outcome: 'bad-code' });
		expect(await codesFor(db, orphan)).toHaveLength(1);

		const person = await seedUser(db, { email: 'mobile-wrong-intent@example.test' });
		await issueEmailCode(ctx, {
			code: '66778899',
			email: person.email ?? '',
			type: 'signup',
			firstName: 'Ada',
			lastName: 'Lovelace'
		});
		expect(
			await verifyMobileEmailCode(ctx, {
				email: person.email ?? '',
				code: '66778899',
				intent: 'login',
				deviceName: '',
				clientIp: '10.22.6.5'
			})
		).toEqual({ outcome: 'bad-code' });
	});
});

describe('createMobileGuest', () => {
	rollbackTest('creates an Anonymous Account, names its token and never leaks the placeholder', async (db) => {
		const ctx = ctxFor(db);

		const result = await createMobileGuest(ctx, { deviceName: 'Pixel', clientIp: '10.22.7.1' });
		expect(result.token).toMatch(/^fp_/);
		expect(result.user.email).toBeNull();

		const [guest] = await db.select().from(users).where(eq(users.id, result.user.id));
		expect(guest.email).toContain(ACCESS_ANON_DOMAIN);
		expect((await tokensFor(db, guest.id)).map((row) => row.name)).toEqual(['Android — Pixel']);

		// 10 per hour per IP: ten allowed, the eleventh refused.
		for (let index = 0; index < 10; index += 1) {
			await createMobileGuest(ctx, { deviceName: '', clientIp: '10.22.7.2' });
		}
		await expect(
			createMobileGuest(ctx, { deviceName: '', clientIp: '10.22.7.2' })
		).rejects.toMatchObject({ code: 'tooMany' });
	});
});

describe('signOut', () => {
	rollbackTest('ends exactly the given session, or nothing without one', async (db) => {
		const ctx = ctxFor(db);
		const person = await seedUser(db, { email: 'logout@example.test' });
		const actor = actorFromUser(person, 'session');
		const session = await seedAccessSession(person.id, {}, db);
		const kept = await seedAccessSession(person.id, {}, db);

		await signOut(ctx, actor, { sessionId: null });
		expect(await db.select().from(authSession).where(eq(authSession.userId, person.id))).toHaveLength(
			2
		);
		await signOut(ctx, actor, { sessionId: session.id });
		expect(
			(await db.select().from(authSession).where(eq(authSession.userId, person.id))).map(
				(row) => row.id
			)
		).toEqual([kept.id]);
	});

	rollbackTest('revokes exactly the presented fp_ token, scoped to its owner', async (db) => {
		const ctx = ctxFor(db);
		const person = await seedUser(db, { email: 'mobile-logout@example.test' });
		await seedAccessApiToken(person.id, 'fp_presented-token', 'Android — Pixel', db);
		await seedAccessApiToken(person.id, 'fp_other-token', 'Android — Tablet', db);
		const session = await seedAccessSession(person.id, {}, db);

		await expect(
			signOut(ctx, actorFromUser(person, 'token'), { token: 'not-an-fp-token' })
		).rejects.toMatchObject({ code: 'unauthorized', message: 'Unauthorized' });
		expect(await tokensFor(db, person.id)).toHaveLength(2);

		await signOut(ctx, actorFromUser(person, 'token'), { token: 'fp_presented-token' });
		const remaining = await tokensFor(db, person.id);
		expect(remaining.map((row) => row.name)).toEqual(['Android — Tablet']);
		expect(
			(await db.select().from(authSession).where(eq(authSession.userId, person.id))).map(
				(row) => row.id
			)
		).toEqual([session.id]);
	});
});
