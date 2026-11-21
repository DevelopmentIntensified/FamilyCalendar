/**
 * identity session service against real Postgres: the insert shape, the
 * signed-cookie seam, sliding renewal at the 24-hour edge, expiry deletion,
 * the missing-person drop, and the three logout scopes. `rollbackTest` plus a
 * fixed clock make every expiry exact.
 *
 * Doc: ./README.md#how-to-test
 */
import { eq, sql } from 'drizzle-orm';
import { describe, expect } from 'vitest';
import { actorFromUser } from '$lib/kernel/ctx/actor';
import { authSession, users } from '$lib/kernel/db/tables.server';
import { seedUser } from '$lib/kernel/testing/seedRows.server';
import { rollbackTest } from '$lib/kernel/testing/testDb.server';
import { testCtx } from '$lib/kernel/testing/testCtx.server';
import { seedIdentitySession } from './identity.fixtures.server';
import {
	endAllSessions,
	endOtherSessions,
	endSession,
	sessionCookie,
	signSessionToken,
	startSession,
	validateSession
} from './identity.session.service.server';
import {
	SESSION_COOKIE_NAME,
	SESSION_LIFETIME_SECONDS,
	SESSION_UPDATE_AGE_SECONDS
} from './identity.session.rules';

const NOW = new Date('2026-04-01T12:00:00.000Z');

describe('startSession', () => {
	rollbackTest('inserts a session row and mints the cookie through one seam', async (db) => {
		const requestedLengths: number[] = [];
		const ctx = {
			...testCtx({ db, now: NOW.toISOString() }),
			ids: {
				id: (length = 15) => {
					requestedLengths.push(length);
					return 'x'.repeat(length);
				}
			}
		};
		const user = await seedUser(db);

		const started = await startSession(ctx, user.id);
		expect(requestedLengths).toEqual([15, 32]);

		expect(started.session.id).toHaveLength(15);
		expect(started.session.token).toHaveLength(32);
		expect(started.session.userId).toBe(user.id);
		expect(started.session.expiresAt).toEqual(
			new Date(NOW.getTime() + SESSION_LIFETIME_SECONDS * 1000)
		);
		expect(started.session.createdAt).toEqual(NOW);
		expect([started.session.ipAddress, started.session.userAgent]).toEqual([null, null]);

		expect(started.cookie.name).toBe(SESSION_COOKIE_NAME);
		const [token, signature] = started.cookie.value.split('.');
		expect(token).toBe(started.session.token);
		expect(signature).toBe(signSessionToken('test-session-secret', started.session.token));
		expect(signature).toHaveLength(44);
		expect(started.cookie.attributes).toEqual({
			path: '/',
			httpOnly: true,
			sameSite: 'lax',
			secure: false,
			maxAge: SESSION_LIFETIME_SECONDS
		});

		const rows = await db.select().from(authSession).where(eq(authSession.userId, user.id));
		expect(rows).toHaveLength(1);
		expect(rows[0].token).toBe(started.session.token);
	});

	rollbackTest('marks the cookie Secure in production only', async (db) => {
		const ctx = testCtx({ db, now: NOW.toISOString(), production: true });
		const user = await seedUser(db);
		const started = await startSession(ctx, user.id);
		expect(started.cookie.attributes.secure).toBe(true);
	});
});

describe('validateSession', () => {
	rollbackTest('answers the person for a valid cookie and does not roll a young session', async (db) => {
		const ctx = testCtx({ db, now: NOW.toISOString() });
		const user = await seedUser(db);
		const started = await startSession(ctx, user.id);

		const validated = await validateSession(ctx, started.cookie.value);
		expect(validated.person?.id).toBe(user.id);
		expect(validated.session?.id).toBe(started.session.id);
		expect(validated.session?.fresh).toBe(false);

		const [row] = await db.select().from(authSession).where(eq(authSession.id, started.session.id));
		expect(row.expiresAt).toEqual(started.session.expiresAt);
	});

	rollbackTest('rejects a tampered or unknown cookie value', async (db) => {
		const ctx = testCtx({ db, now: NOW.toISOString() });
		const user = await seedUser(db);
		const started = await startSession(ctx, user.id);

		expect(await validateSession(ctx, undefined)).toEqual({ session: null, person: null });
		expect(await validateSession(ctx, 'garbage')).toEqual({ session: null, person: null });
		expect(
			await validateSession(ctx, `${started.session.token}.${'A'.repeat(43)}=`)
		).toEqual({ session: null, person: null });
	});

	rollbackTest('deletes an expired session', async (db) => {
		const ctx = testCtx({ db, now: NOW.toISOString() });
		const user = await seedUser(db);
		const row = await seedIdentitySession(
			user.id,
			'sess-old',
			{ expiresAt: new Date(NOW.getTime() - 1000) },
			db
		);

		const validated = await validateSession(ctx, sessionCookie(ctx, row.token).value);

		expect(validated).toEqual({ session: null, person: null });
		expect(await db.select().from(authSession).where(eq(authSession.id, 'sess-old'))).toEqual([]);
	});

	rollbackTest('renews at most once per 24 hours and flags the roll fresh', async (db) => {
		const ctx = testCtx({ db, now: NOW.toISOString() });
		const user = await seedUser(db);
		const stale = await seedIdentitySession(
			user.id,
			'sess-stale',
			{ updatedAt: new Date(NOW.getTime() - SESSION_UPDATE_AGE_SECONDS * 1000 - 1) },
			db
		);

		const validated = await validateSession(ctx, sessionCookie(ctx, stale.token).value);
		expect(validated.session?.fresh).toBe(true);

		const [rolled] = await db.select().from(authSession).where(eq(authSession.id, 'sess-stale'));
		expect(rolled.updatedAt).toEqual(NOW);
		expect(rolled.expiresAt).toEqual(new Date(NOW.getTime() + SESSION_LIFETIME_SECONDS * 1000));

		const young = await seedIdentitySession(
			user.id,
			'sess-young',
			{ updatedAt: new Date(NOW.getTime() - SESSION_UPDATE_AGE_SECONDS * 1000) },
			db
		);
		const again = await validateSession(ctx, sessionCookie(ctx, young.token).value);
		expect(again.session?.fresh).toBe(false);
	});

	rollbackTest('drops the session row when its person is gone', async (db) => {
		const ctx = testCtx({ db, now: NOW.toISOString() });
		const user = await seedUser(db);
		const row = await seedIdentitySession(user.id, 'sess-orphan', {}, db);
		// The cascade would take the session with the user; disable FK triggers
		// for one statement to reproduce the legacy getUserOrDrop branch.
		await db.execute(sql.raw('SET LOCAL session_replication_role = replica'));
		await db.delete(users).where(eq(users.id, user.id));
		await db.execute(sql.raw('SET LOCAL session_replication_role = DEFAULT'));

		const validated = await validateSession(ctx, sessionCookie(ctx, row.token).value);

		expect(validated).toEqual({ session: null, person: null });
		expect(await db.select().from(authSession).where(eq(authSession.id, 'sess-orphan'))).toEqual(
			[]
		);
	});
});

describe('ending sessions', () => {
	rollbackTest('keeps the caller’s own session and revokes the rest', async (db) => {
		const ctx = testCtx({ db, now: NOW.toISOString() });
		const user = await seedUser(db);
		const other = await seedUser(db);
		await seedIdentitySession(user.id, 'sess-keep', {}, db);
		await seedIdentitySession(user.id, 'sess-b', {}, db);
		await seedIdentitySession(other.id, 'sess-other', {}, db);

		const revoked = await endOtherSessions(ctx, actorFromUser(user, 'session'), {
			keepSessionId: 'sess-keep'
		});

		expect(revoked).toBe(1);
		const rows = await db.select().from(authSession);
		expect(rows.map((row) => row.id).sort()).toEqual(['sess-keep', 'sess-other']);
	});

	rollbackTest('a caller with no session id revokes every session of theirs', async (db) => {
		const ctx = testCtx({ db, now: NOW.toISOString() });
		const user = await seedUser(db);
		await seedIdentitySession(user.id, 'sess-a', {}, db);
		await seedIdentitySession(user.id, 'sess-b', {}, db);

		const revoked = await endOtherSessions(ctx, actorFromUser(user, 'token'), {
			keepSessionId: null
		});

		expect(revoked).toBe(2);
		expect(await db.select().from(authSession).where(eq(authSession.userId, user.id))).toEqual(
			[]
		);
	});

	rollbackTest('endSession deletes one row and endAllSessions every row of one person', async (db) => {
		const ctx = testCtx({ db, now: NOW.toISOString() });
		const user = await seedUser(db);
		const other = await seedUser(db);
		await seedIdentitySession(user.id, 'sess-a', {}, db);
		await seedIdentitySession(user.id, 'sess-b', {}, db);
		await seedIdentitySession(other.id, 'sess-other', {}, db);

		await endSession(ctx, 'sess-a');
		expect((await db.select().from(authSession)).map((row) => row.id).sort()).toEqual([
			'sess-b',
			'sess-other'
		]);

		expect(await endAllSessions(ctx, user.id)).toBe(1);
		expect((await db.select().from(authSession)).map((row) => row.id)).toEqual(['sess-other']);
	});
});
