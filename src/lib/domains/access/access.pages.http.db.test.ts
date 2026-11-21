/**
 * access page handlers against real Postgres: the loads the auth screens
 * render, the two form actions that answer data (`/claim`, `/account/verify-email`)
 * and the three that redirect (`/merge-guest`, the Claim verify POST), plus the
 * two email-link callbacks.
 *
 * Every case drives the PORTED handler with `goldenCtx` (real mail port, memory
 * limiter) and reads the legacy route's answer out of the legacy sources —
 * never out of the handler. Instant is pinned so the Claim TTL and the code
 * expiries never depend on the clock.
 *
 * Doc: ./README.md#how-to-test
 */
import { eq } from 'drizzle-orm';
import { describe, expect } from 'vitest';
import type { Db } from '$lib/kernel/db/database.server';
import { calendars, events, tasks, users, type UserRow } from '$lib/kernel/db/tables.server';
import type { ActionFail } from '$lib/kernel/http/pageHandlers.server';
import { sha256Hex } from '$lib/kernel/ids/ids';
import { invoke, invokeAction, invokeLoad, isActionFailure } from '$lib/kernel/testing/invokeHandlers.server';
import { seedUser } from '$lib/kernel/testing/seedRows.server';
import { rollbackTest } from '$lib/kernel/testing/testDb.server';
import { goldenCtx } from '$lib/app/testing/goldenCtx.server';
import { issueEmailCode } from '$lib/domains/identity/index.server';
import {
	claimPage,
	claimRequestAction,
	claimVerifyAction,
	claimVerifyPage,
	loginCallback,
	loginPage,
	mergeGuestAction,
	mergeGuestPage,
	mergeGuestSkipAction,
	signupCallback,
	signupPage,
	verifyEmailAction,
	verifyEmailPage,
	type VerifyEmailActionData
} from './access.pages.http.server';
import { seedAccessClaimToken, seedAccessGuest } from './access.fixtures.server';

const NOW = '2026-06-01T12:00:00.000Z';

/** A thrown Kit redirect (or this file's own "expected a redirect" guard). */
async function redirectOf(run: () => Promise<unknown>): Promise<{ status: number; location: string }> {
	try {
		await run();
	} catch (cause) {
		if (typeof cause === 'object' && cause !== null && 'status' in cause && 'location' in cause) {
			const { status, location } = cause as { status: unknown; location: unknown };
			if (typeof status === 'number' && typeof location === 'string') return { status, location };
		}
		throw cause;
	}
	throw new Error('expected a redirect');
}

describe('/login and /signup loads', () => {
	rollbackTest('login reads the merge flag and sanitises the landing target', async (db) => {
		const ctx = goldenCtx({ db, now: NOW });
		const data = await invokeLoad(loginPage, {
			ctx,
			path: '/login',
			query: { merge: '1', redirect: '/family/abc' }
		});
		expect(data).toEqual({ isLoggedIn: false, mergeMode: true, redirectTo: '/family/abc' });

		const unsafe = await invokeLoad(loginPage, {
			ctx,
			path: '/login',
			query: { redirect: '//evil.example' }
		});
		expect(unsafe).toEqual({ isLoggedIn: false, mergeMode: false, redirectTo: '/calendar' });
	});

	rollbackTest('login reports a registered session and a guest as not logged in', async (db) => {
		const ctx = goldenCtx({ db, now: NOW });
		const registered = await seedUser(db, { email: 'login-page@example.test' });
		const guest = await seedAccessGuest();
		expect((await invokeLoad(loginPage, { ctx, user: registered })).isLoggedIn).toBe(true);
		expect((await invokeLoad(loginPage, { ctx, user: guest })).isLoggedIn).toBe(false);
	});

	rollbackTest('signup falls back to /calendar and keeps a safe target', async (db) => {
		const ctx = goldenCtx({ db, now: NOW });
		expect(await invokeLoad(signupPage, { ctx, path: '/signup' })).toEqual({
			isLoggedIn: false,
			redirectTo: '/calendar'
		});
		expect(
			await invokeLoad(signupPage, { ctx, path: '/signup', query: { redirect: '/checkout' } })
		).toEqual({ isLoggedIn: false, redirectTo: '/checkout' });
	});
});

describe('/claim', () => {
	rollbackTest('the page refuses a signed-out visitor and a registered account', async (db) => {
		const ctx = goldenCtx({ db, now: NOW });
		expect(await redirectOf(() => invokeLoad(claimPage, { ctx }))).toEqual({
			status: 302,
			location: '/login'
		});
		const registered = await seedUser(db, { email: 'claim-page@example.test' });
		expect(await redirectOf(() => invokeLoad(claimPage, { ctx, user: registered }))).toEqual({
			status: 302,
			location: '/calendar'
		});
		const guest = await seedAccessGuest();
		expect(await invokeLoad(claimPage, { ctx, user: guest })).toEqual({});
	});

	rollbackTest('the request action echoes the normalised address', async (db) => {
		const ctx = goldenCtx({ db, now: NOW });
		const guest = await seedAccessGuest();
		const answer = await invokeAction(claimRequestAction, {
			ctx,
			user: guest,
			path: '/claim',
			headers: { 'x-real-ip': '10.20.0.1' },
			form: { email: '  New@Example.test ' }
		});
		expect(answer).toEqual({ success: true, email: 'new@example.test' });
	});

	rollbackTest('the request action refuses a registered account', async (db) => {
		const ctx = goldenCtx({ db, now: NOW });
		const registered = await seedUser(db, { email: 'claim-registered@example.test' });
		const answer = await invokeAction(claimRequestAction, {
			ctx,
			user: registered,
			path: '/claim',
			headers: { 'x-real-ip': '10.20.0.2' },
			form: { email: 'new@example.test' }
		});
		if (!isActionFailure(answer)) throw new Error('expected an action failure');
		expect({ status: answer.status, data: answer.data }).toEqual({
			status: 400,
			data: { success: false, error: 'Account already has an email' }
		});
	});

	rollbackTest('the verify GET renders the confirm page without burning the token', async (db) => {
		const ctx = goldenCtx({ db, now: NOW });
		const guest = await seedAccessGuest();
		await seedAccessClaimToken(db, {
			userId: guest.id,
			tokenHash: sha256Hex('claim-page-token'),
			email: 'claim-page-token@example.test'
		});
		const res = await invoke(claimVerifyPage.handler, {
			ctx,
			user: guest,
			path: '/claim/verify/claim-page-token',
			params: { token: 'claim-page-token' }
		});
		expect(res.status).toBe(200);
		expect(res.text).toContain('action="/claim/verify/claim-page-token"');
		expect(res.headers.get('content-type')).toContain('text/html');
	});

	rollbackTest('the verify POST refuses an unknown token and claims a live one', async (db) => {
		const ctx = goldenCtx({ db, now: NOW });
		const guest = await seedAccessGuest();
		expect(
			await redirectOf(() =>
				invoke(claimVerifyAction.handler, {
					ctx,
					user: guest,
					path: '/claim/verify/nope',
					params: { token: 'nope' }
				})
			)
		).toEqual({ status: 302, location: '/claim?error=invalid' });

		await seedAccessClaimToken(db, {
			userId: guest.id,
			tokenHash: sha256Hex('claim-live-token'),
			email: 'claimed-address@example.test'
		});
		expect(
			await redirectOf(() =>
				invoke(claimVerifyAction.handler, {
					ctx,
					user: guest,
					path: '/claim/verify/claim-live-token',
					params: { token: 'claim-live-token' }
				})
			)
		).toEqual({ status: 302, location: '/calendar?claimed=1' });
		const [row] = await db.select().from(users).where(eq(users.id, guest.id));
		expect([row.email, row.emailVerified]).toEqual(['claimed-address@example.test', true]);
	});
});

describe('/account/verify-email', () => {
	rollbackTest('the page redirects a signed-out visitor', async (db) => {
		const ctx = goldenCtx({ db, now: NOW });
		expect(await redirectOf(() => invokeLoad(verifyEmailPage, { ctx }))).toEqual({
			status: 302,
			location: '/login'
		});
	});

	rollbackTest('the action asks for a code, refuses an expired one, then changes the address', async (db) => {
		const ctx = goldenCtx({ db, now: NOW });
		const person = await seedUser(db, { email: 'verify-page@example.test' });

		const empty = await invokeAction(verifyEmailAction, {
			ctx,
			user: person,
			path: '/account/verify-email',
			headers: { 'x-real-ip': '10.21.0.1' },
			form: {}
		});
		if (!isActionFailure<ActionFail | VerifyEmailActionData, VerifyEmailActionData>(empty))
			throw new Error('expected an action failure');
		expect({ status: empty.status, data: empty.data }).toEqual({
			status: 400,
			data: { success: false, message: 'Verification code is required' }
		});

		await issueEmailCode(ctx, {
			code: '13572468',
			email: person.email ?? '',
			type: 'email_change',
			pendingEmail: 'moved@example.test',
			expiresAt: new Date('2020-01-01T00:00:00.000Z')
		});
		const expired = await invokeAction(verifyEmailAction, {
			ctx,
			user: person,
			path: '/account/verify-email',
			headers: { 'x-real-ip': '10.21.0.2' },
			form: { code: '13572468' }
		});
		if (!isActionFailure<ActionFail | VerifyEmailActionData, VerifyEmailActionData>(expired))
			throw new Error('expected an action failure');
		expect(expired.data).toEqual({
			success: false,
			message: 'Verification code has expired'
		});

		await issueEmailCode(ctx, {
			code: '24681357',
			email: person.email ?? '',
			type: 'email_change',
			pendingEmail: 'moved@example.test'
		});
		expect(
			await invokeAction(verifyEmailAction, {
				ctx,
				user: person,
				path: '/account/verify-email',
				headers: { 'x-real-ip': '10.21.0.3' },
				form: { code: '24681357' }
			})
		).toEqual({ success: true, message: 'Email verified successfully!' });
		const [row] = await db.select().from(users).where(eq(users.id, person.id));
		expect([row.email, row.emailVerified]).toEqual(['moved@example.test', true]);
	});
});

describe('/merge-guest', () => {
	async function seedStashedGuest(
		db: Db,
		suffix: string
	): Promise<{ guest: UserRow; target: UserRow }> {
		const guest = await seedAccessGuest();
		const target = await seedUser(db, {
			email: `merge-page-${suffix}@example.test`,
			firstName: 'Ada'
		});
		await db.insert(calendars).values({ id: `cal-${suffix}`, ownerId: guest.id, familyId: null });
		await db
			.insert(events)
			.values({ id: `evt-${suffix}`, ownerId: guest.id, title: 'Swim', start: NOW });
		await db.insert(tasks).values({ id: `task-${suffix}`, title: 'Pack', userId: guest.id });
		return { guest, target };
	}

	rollbackTest('the page refuses a guest and a missing stash', async (db) => {
		const ctx = goldenCtx({ db, now: NOW });
		const guest = await seedAccessGuest();
		expect(await redirectOf(() => invokeLoad(mergeGuestPage, { ctx, user: guest }))).toEqual({
			status: 302,
			location: '/claim'
		});
		const target = await seedUser(db, { email: 'merge-no-stash@example.test' });
		expect(await redirectOf(() => invokeLoad(mergeGuestPage, { ctx, user: target }))).toEqual({
			status: 302,
			location: '/calendar'
		});
	});

	rollbackTest('the page states the guest counts, and merge keeps them', async (db) => {
		const ctx = goldenCtx({ db, now: NOW });
		const { guest, target } = await seedStashedGuest(db, 'keep');
		expect(
			await invokeLoad(mergeGuestPage, {
				ctx,
				user: target,
				cookies: { guest_merge: guest.id }
			})
		).toEqual({ guestEvents: 1, guestTasks: 1, accountFirstName: 'Ada' });

		expect(
			await redirectOf(() =>
				invokeAction(mergeGuestAction, {
					ctx,
					user: target,
					path: '/merge-guest',
					cookies: { guest_merge: guest.id },
					form: {}
				})
			)
		).toEqual({ status: 302, location: '/calendar?merged=1&tasks=1' });
		expect(await db.select().from(users).where(eq(users.id, guest.id))).toEqual([]);
	});

	rollbackTest('skip forgets the stash and leaves the guest alone', async (db) => {
		const ctx = goldenCtx({ db, now: NOW });
		const { guest, target } = await seedStashedGuest(db, 'skip');
		expect(
			await redirectOf(() =>
				invokeAction(mergeGuestSkipAction, {
					ctx,
					user: target,
					path: '/merge-guest',
					cookies: { guest_merge: guest.id },
					form: {}
				})
			)
		).toEqual({ status: 302, location: '/calendar' });
		expect(await db.select().from(users).where(eq(users.id, guest.id))).toHaveLength(1);
		expect(await db.select().from(events).where(eq(events.ownerId, guest.id))).toHaveLength(1);
	});
});

describe('email-link callbacks', () => {
	rollbackTest('a bad login token lands on /login with the legacy sentence', async (db) => {
		const ctx = goldenCtx({ db, now: NOW });
		const res = await invoke(loginCallback.handler, {
			ctx,
			path: '/login/email/callback',
			query: { token: 'not.a.jwt' }
		});
		expect(res.status).toBe(302);
		expect(res.headers.get('location')).toBe(
			`/login?error=${encodeURIComponent('The token provided was not valid, please try again.')}`
		);
	});

	rollbackTest('a signup callback without a token lands on /signup with the same copy', async (db) => {
		const ctx = goldenCtx({ db, now: NOW });
		const res = await invoke(signupCallback.handler, {
			ctx,
			path: '/signup/email/callback'
		});
		expect(res.status).toBe(302);
		expect(res.headers.get('location')).toBe(
			`/signup?error=${encodeURIComponent('The token provided was not valid, please try again.')}`
		);
	});
});
