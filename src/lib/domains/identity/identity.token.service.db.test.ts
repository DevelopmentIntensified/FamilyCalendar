/**
 * identity token service against real Postgres: mint shape and storage,
 * owner-scoped revocation, the password-reset and mobile-logout deletes, the
 * Bearer resolution with its `lastUsedAt` touch, and the "no token or hash in
 * the logs" rule. `rollbackTest` keeps every seeded row local.
 *
 * Doc: ./README.md#how-to-test
 */
import { createHash } from 'node:crypto';
import { eq, sql } from 'drizzle-orm';
import { describe, expect } from 'vitest';
import { actorFromUser } from '$lib/kernel/ctx/actor';
import { apiTokens, users } from '$lib/kernel/db/tables.server';
import { seedUser } from '$lib/kernel/testing/seedRows.server';
import { rollbackTest } from '$lib/kernel/testing/testDb.server';
import { testCtx } from '$lib/kernel/testing/testCtx.server';
import { seedIdentityApiToken } from './identity.fixtures.server';
import {
	authenticateApiToken,
	listApiTokens,
	mintApiToken,
	revokeAllApiTokens,
	revokeApiToken,
	revokeApiTokenByPlaintext
} from './identity.token.service.server';

const NOW = new Date('2026-04-01T12:00:00.000Z');
const sha256 = (text: string) => createHash('sha256').update(text).digest('hex');

describe('minting', () => {
	rollbackTest('stores only the SHA-256 of the plaintext', async (db) => {
		const ctx = testCtx({ db, now: NOW.toISOString() });
		const user = await seedUser(db);
		const actor = actorFromUser(user, 'session');

		const minted = await mintApiToken(ctx, actor, { name: 'My phone' });

		expect(minted.token).toMatch(/^fp_[A-Za-z0-9_-]{43}$/);
		expect(minted.record.name).toBe('My phone');
		expect(minted.record.createdAt).toEqual(NOW);

		const [row] = await db.select().from(apiTokens).where(eq(apiTokens.id, minted.record.id));
		expect(row.tokenHash).toBe(sha256(minted.token));
		expect(row.tokenHash).not.toContain(minted.token);
		expect(row.lastUsedAt).toBeNull();
		expect(ctx.log.entries).toEqual([]);
		expect(ctx.faults.reports).toEqual([]);
	});

	rollbackTest('refuses a blank name with the legacy copy and writes nothing', async (db) => {
		const ctx = testCtx({ db, now: NOW.toISOString() });
		const user = await seedUser(db);

		await expect(
			mintApiToken(ctx, actorFromUser(user, 'session'), { name: '   ' })
		).rejects.toMatchObject({
			code: 'invalid',
			status: 400,
			message: 'Token name is required'
		});
		expect(await db.select().from(apiTokens)).toEqual([]);
	});
});

describe('listing', () => {
	rollbackTest('lists only the caller’s tokens, safe columns only', async (db) => {
		const ctx = testCtx({ db, now: NOW.toISOString() });
		const user = await seedUser(db);
		const other = await seedUser(db);
		await seedIdentityApiToken(user.id, { id: 'tok-a' }, db);
		await seedIdentityApiToken(other.id, { id: 'tok-b', tokenHash: 'other-hash' }, db);

		const tokens = await listApiTokens(ctx, actorFromUser(user, 'session'));

		expect(tokens).toEqual([{ id: 'tok-a', name: 'Phone', createdAt: new Date('2026-10-07T13:00:00.000Z'), lastUsedAt: null }]);
	});
});

describe('revoking', () => {
	rollbackTest('revokes another person’s token as a no-op', async (db) => {
		const ctx = testCtx({ db, now: NOW.toISOString() });
		const user = await seedUser(db);
		const other = await seedUser(db);
		await seedIdentityApiToken(other.id, { id: 'tok-b', tokenHash: 'other-hash' }, db);

		await revokeApiToken(ctx, actorFromUser(user, 'session'), 'tok-b');

		expect(await db.select().from(apiTokens).where(eq(apiTokens.id, 'tok-b'))).toHaveLength(1);
	});

	rollbackTest('an empty id keeps the legacy 400 copy', async (db) => {
		const ctx = testCtx({ db, now: NOW.toISOString() });
		const user = await seedUser(db);

		await expect(revokeApiToken(ctx, actorFromUser(user, 'session'), '')).rejects.toMatchObject({
			code: 'invalid',
			status: 400,
			message: 'Token id is required'
		});
	});

	rollbackTest('revokes every token for a password reset, the caller’s included', async (db) => {
		const ctx = testCtx({ db, now: NOW.toISOString() });
		const user = await seedUser(db);
		const other = await seedUser(db);
		await seedIdentityApiToken(user.id, { id: 'tok-a' }, db);
		await seedIdentityApiToken(user.id, { id: 'tok-b', tokenHash: 'hash-b' }, db);
		await seedIdentityApiToken(other.id, { id: 'tok-other', tokenHash: 'hash-other' }, db);

		expect(await revokeAllApiTokens(ctx, user.id)).toBe(2);
		expect((await db.select().from(apiTokens)).map((row) => row.id)).toEqual(['tok-other']);
	});

	rollbackTest('revokes exactly the presented token on mobile logout', async (db) => {
		const ctx = testCtx({ db, now: NOW.toISOString() });
		const user = await seedUser(db);
		await seedIdentityApiToken(user.id, { id: 'tok-a', tokenHash: sha256('fp_first') }, db);
		await seedIdentityApiToken(user.id, { id: 'tok-b', tokenHash: sha256('fp_second') }, db);

		await revokeApiTokenByPlaintext(ctx, user.id, 'fp_second');

		expect((await db.select().from(apiTokens)).map((row) => row.id)).toEqual(['tok-a']);
	});
});

describe('Bearer authentication', () => {
	rollbackTest('resolves a token to its owner and touches lastUsedAt', async (db) => {
		const ctx = testCtx({ db, now: NOW.toISOString() });
		const user = await seedUser(db, { firstName: 'Mia' });
		await seedIdentityApiToken(user.id, { id: 'tok-a', tokenHash: sha256('fp_live') }, db);

		const person = await authenticateApiToken(ctx, 'fp_live');

		expect(person?.id).toBe(user.id);
		expect(person?.firstName).toBe('Mia');
		const [row] = await db.select().from(apiTokens).where(eq(apiTokens.id, 'tok-a'));
		expect(row.lastUsedAt).toEqual(NOW);
	});

	rollbackTest('answers null for a non-fp_ or unknown token without touching anything', async (db) => {
		const ctx = testCtx({ db, now: NOW.toISOString() });
		const user = await seedUser(db);
		await seedIdentityApiToken(user.id, { id: 'tok-a', tokenHash: sha256('fp_live') }, db);

		expect(await authenticateApiToken(ctx, 'bearer-without-prefix')).toBeNull();
		expect(await authenticateApiToken(ctx, 'fp_unknown')).toBeNull();
		const [row] = await db.select().from(apiTokens).where(eq(apiTokens.id, 'tok-a'));
		expect(row.lastUsedAt).toBeNull();
	});

	rollbackTest('answers null for a token whose owner is gone, without touching it', async (db) => {
		const ctx = testCtx({ db, now: NOW.toISOString() });
		const user = await seedUser(db);
		await seedIdentityApiToken(user.id, { id: 'tok-a', tokenHash: sha256('fp_live') }, db);
		// The cascade would remove the token with its owner; disable FK triggers
		// for one statement to reproduce the legacy join's "owner gone" answer.
		await db.execute(sql.raw('SET LOCAL session_replication_role = replica'));
		await db.delete(users).where(eq(users.id, user.id));
		await db.execute(sql.raw('SET LOCAL session_replication_role = DEFAULT'));

		expect(await authenticateApiToken(ctx, 'fp_live')).toBeNull();
		const [row] = await db.select().from(apiTokens).where(eq(apiTokens.id, 'tok-a'));
		expect(row.lastUsedAt).toBeNull();
	});
});
