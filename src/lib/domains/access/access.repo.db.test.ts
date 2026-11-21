/**
 * The access repo against real Postgres: every `claimTokens` query. Each test
 * runs in `rollbackTest`, so the rows it seeds vanish afterwards. Writes take
 * their `now`, so expiry and `createdAt` are asserted, never trusted.
 *
 * Doc: ./README.md#how-to-test
 */
import { eq } from 'drizzle-orm';
import { describe, expect } from 'vitest';
import { claimTokens } from '$lib/kernel/db/tables.server';
import { sha256Hex } from '$lib/kernel/ids/ids';
import { seedUser } from '$lib/kernel/testing/seedRows.server';
import { rollbackTest } from '$lib/kernel/testing/testDb.server';
import { seedAccessClaimToken } from './access.fixtures.server';
import {
	consumeClaimToken,
	deleteExpiredClaimTokens,
	findClaimTokenByHash,
	insertClaimToken
} from './access.repo.server';

const NOW = new Date('2026-03-02T09:00:00.000Z');
const LIVE = new Date('2026-03-02T09:15:00.000Z');

describe('insertClaimToken', () => {
	rollbackTest('stores the owner, address, hash and expiry the caller gives', async (db) => {
		const owner = await seedUser(db);
		const row = await insertClaimToken(
			db,
			{
				userId: owner.id,
				email: 'claim@example.test',
				tokenHash: sha256Hex('claim-token'),
				expiresAt: LIVE
			},
			NOW
		);
		expect({
			userId: row.userId,
			email: row.email,
			tokenHash: row.tokenHash,
			expiresAt: row.expiresAt.toISOString(),
			createdAt: row.createdAt.toISOString()
		}).toEqual({
			userId: owner.id,
			email: 'claim@example.test',
			tokenHash: sha256Hex('claim-token'),
			expiresAt: LIVE.toISOString(),
			createdAt: NOW.toISOString()
		});
		// The id still comes from the table's kernel id default.
		expect(row.id).toMatch(/^[a-z0-9]{15}$/);
	});

	rollbackTest('is the only writer the other queries read', async (db) => {
		const owner = await seedUser(db);
		await insertClaimToken(
			db,
			{
				userId: owner.id,
				email: 'read-back@example.test',
				tokenHash: sha256Hex('read-back'),
				expiresAt: LIVE
			},
			NOW
		);
		expect(await findClaimTokenByHash(db, sha256Hex('read-back'), NOW)).toEqual({
			userId: owner.id,
			email: 'read-back@example.test'
		});
	});
});

describe('findClaimTokenByHash', () => {
	rollbackTest('returns the owner of a live token', async (db) => {
		const owner = await seedUser(db);
		await seedAccessClaimToken(db, {
			userId: owner.id,
			tokenHash: sha256Hex('live'),
			email: 'live@example.test',
			expiresAt: LIVE
		});
		expect(await findClaimTokenByHash(db, sha256Hex('live'), NOW)).toEqual({
			userId: owner.id,
			email: 'live@example.test'
		});
	});

	rollbackTest('returns null for an unknown hash', async (db) => {
		expect(await findClaimTokenByHash(db, sha256Hex('never-issued'), NOW)).toBeNull();
	});

	rollbackTest('never burns the row: a preview can be repeated', async (db) => {
		const owner = await seedUser(db);
		await seedAccessClaimToken(db, {
			userId: owner.id,
			tokenHash: sha256Hex('preview'),
			expiresAt: LIVE
		});
		expect(await findClaimTokenByHash(db, sha256Hex('preview'), NOW)).not.toBeNull();
		expect(await findClaimTokenByHash(db, sha256Hex('preview'), NOW)).not.toBeNull();
		expect(await db.select().from(claimTokens)).toHaveLength(1);
	});

	rollbackTest('refuses a row that expired one millisecond ago', async (db) => {
		const owner = await seedUser(db);
		await seedAccessClaimToken(db, {
			userId: owner.id,
			tokenHash: sha256Hex('dead'),
			expiresAt: new Date(NOW.getTime() - 1)
		});
		expect(await findClaimTokenByHash(db, sha256Hex('dead'), NOW)).toBeNull();
	});

	rollbackTest('accepts a row expiring exactly at now (legacy compares < now)', async (db) => {
		const owner = await seedUser(db);
		await seedAccessClaimToken(db, {
			userId: owner.id,
			tokenHash: sha256Hex('edge'),
			email: 'edge@example.test',
			expiresAt: NOW
		});
		expect(await findClaimTokenByHash(db, sha256Hex('edge'), NOW)).toEqual({
			userId: owner.id,
			email: 'edge@example.test'
		});
	});
});

describe('consumeClaimToken', () => {
	rollbackTest('returns the owner once and deletes exactly that row', async (db) => {
		const owner = await seedUser(db);
		const other = await seedUser(db);
		await seedAccessClaimToken(db, {
			userId: owner.id,
			tokenHash: sha256Hex('used'),
			email: 'used@example.test',
			expiresAt: LIVE
		});
		await seedAccessClaimToken(db, {
			userId: other.id,
			tokenHash: sha256Hex('kept'),
			email: 'kept@example.test',
			expiresAt: LIVE
		});

		expect(await consumeClaimToken(db, sha256Hex('used'), NOW)).toEqual({
			userId: owner.id,
			email: 'used@example.test'
		});
		expect(await db.select().from(claimTokens)).toHaveLength(1);
		expect(await db.select().from(claimTokens).where(eq(claimTokens.tokenHash, sha256Hex('kept'))))
			.toHaveLength(1);
	});

	rollbackTest('loses the second call: one token, one winner', async (db) => {
		const owner = await seedUser(db);
		await seedAccessClaimToken(db, {
			userId: owner.id,
			tokenHash: sha256Hex('race'),
			expiresAt: LIVE
		});
		expect(await consumeClaimToken(db, sha256Hex('race'), NOW)).not.toBeNull();
		expect(await consumeClaimToken(db, sha256Hex('race'), NOW)).toBeNull();
		expect(await db.select().from(claimTokens)).toEqual([]);
	});

	rollbackTest('deletes an expired row and still answers null', async (db) => {
		const owner = await seedUser(db);
		await seedAccessClaimToken(db, {
			userId: owner.id,
			tokenHash: sha256Hex('stale'),
			expiresAt: new Date(NOW.getTime() - 1)
		});
		expect(await consumeClaimToken(db, sha256Hex('stale'), NOW)).toBeNull();
		expect(await db.select().from(claimTokens)).toEqual([]);
	});

	rollbackTest('returns null for an unknown hash', async (db) => {
		expect(await consumeClaimToken(db, sha256Hex('never-issued'), NOW)).toBeNull();
	});
});

describe('deleteExpiredClaimTokens', () => {
	rollbackTest('deletes rows before now, keeps the boundary row, and counts', async (db) => {
		const owner = await seedUser(db);
		await seedAccessClaimToken(db, {
			userId: owner.id,
			tokenHash: sha256Hex('old-1'),
			expiresAt: new Date(NOW.getTime() - 60_000)
		});
		await seedAccessClaimToken(db, {
			userId: owner.id,
			tokenHash: sha256Hex('old-2'),
			expiresAt: new Date(NOW.getTime() - 1)
		});
		await seedAccessClaimToken(db, {
			userId: owner.id,
			tokenHash: sha256Hex('edge'),
			expiresAt: NOW
		});
		await seedAccessClaimToken(db, {
			userId: owner.id,
			tokenHash: sha256Hex('live'),
			expiresAt: LIVE
		});

		expect(await deleteExpiredClaimTokens(db, NOW)).toBe(2);
		const left = await db.select({ hash: claimTokens.tokenHash }).from(claimTokens);
		expect(left.map((row) => row.hash).sort()).toEqual(
			[sha256Hex('edge'), sha256Hex('live')].sort()
		);
	});
});
