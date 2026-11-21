/**
 * identity credentials service against real Postgres: bcrypt cost-10 hashing,
 * the HMAC-SHA-256(pepper)/'test-code-pepper' digest stored for every code kind
 * (Q-116, Q-117), the `(digest, email, type)` binding, the 15-minute TTL and
 * consume-on-redeem. `rollbackTest` plus a fixed clock make the expiry edge
 * exact.
 *
 * Doc: ./README.md#how-to-test
 */
import { describe, expect } from 'vitest';
import { codes } from '$lib/kernel/db/tables.server';
import { hmacSha256Hex, sha256Hex } from '$lib/kernel/ids/ids';
import { seedUser } from '$lib/kernel/testing/seedRows.server';
import { rollbackTest } from '$lib/kernel/testing/testDb.server';
import { testCtx } from '$lib/kernel/testing/testCtx.server';
import { EMAIL_CODE_TTL_MS } from './identity.code.rules';
import { hashPassword, issueEmailCode, redeemEmailCode, verifyPassword } from './identity.credentials.service.server';
import { seedIdentityEmailCode } from './identity.fixtures.server';

const NOW = new Date('2026-04-01T12:00:00.000Z');

describe('passwords', () => {
	rollbackTest('stores a bcrypt cost-10 hash and verifies it', async () => {
		const hash = await hashPassword('correct horse');

		expect(hash).toMatch(/^\$2[aby]\$10\$/);
		expect(await verifyPassword('correct horse', hash)).toBe(true);
		expect(await verifyPassword('wrong horse', hash)).toBe(false);
	});
});

describe('email codes', () => {
	rollbackTest('stores a sign-in code as its keyed digest with the 15-minute expiry', async (db) => {
		const ctx = testCtx({ db, now: NOW.toISOString() });
		await seedUser(db);

		const row = await issueEmailCode(ctx, {
			code: '24681357',
			email: 'mia@example.test',
			type: 'login'
		});

		expect(row.code).toBe(hmacSha256Hex(ctx.config.codePepper, '24681357'));
		expect(row.code).not.toContain('24681357');
		expect(row.email).toBe('mia@example.test');
		expect(row.type).toBe('login');
		expect(row.expiresAt).toEqual(new Date(NOW.getTime() + EMAIL_CODE_TTL_MS));
	});

	rollbackTest('a digest match with the wrong email or type does not redeem', async (db) => {
		const ctx = testCtx({ db, now: NOW.toISOString() });
		await issueEmailCode(ctx, { code: '11111111', email: 'mia@example.test', type: 'login' });

		expect(
			await redeemEmailCode(ctx, {
				code: '11111111',
				email: 'other@example.test',
				type: 'login'
			})
		).toBeNull();
		expect(
			await redeemEmailCode(ctx, {
				code: '11111111',
				email: 'mia@example.test',
				type: 'signup'
			})
		).toBeNull();
		// Neither attempt consumed the row.
		expect(await db.select().from(codes)).toHaveLength(1);

		const redeemed = await redeemEmailCode(ctx, {
			code: '11111111',
			email: 'mia@example.test',
			type: 'login'
		});
		expect(redeemed?.type).toBe('login');
		expect(await db.select().from(codes)).toEqual([]);
	});

	// Q-117: the pepper is the whole defence for a 6–8 digit code, so a row
	// hashed under another pepper — or with a bare SHA-256 — is a miss, while
	// the same code still redeems under the pepper it was stored with.
	rollbackTest('a row hashed with another pepper or a bare SHA-256 does not redeem', async (db) => {
		const ctx = testCtx({ db, now: NOW.toISOString() });
		const otherPepper = testCtx({ db, now: NOW.toISOString(), codePepper: 'other-pepper' });

		await issueEmailCode(otherPepper, {
			code: '33333333',
			email: 'pepper@example.test',
			type: 'login'
		});
		expect(
			await redeemEmailCode(ctx, {
				code: '33333333',
				email: 'pepper@example.test',
				type: 'login'
			})
		).toBeNull();

		await seedIdentityEmailCode(
			{ code: sha256Hex('44444444'), email: 'bare@example.test', type: 'login' },
			db
		);
		expect(
			await redeemEmailCode(ctx, {
				code: '44444444',
				email: 'bare@example.test',
				type: 'login'
			})
		).toBeNull();
		expect(await db.select().from(codes)).toHaveLength(2);

		expect(
			(await redeemEmailCode(otherPepper, {
				code: '33333333',
				email: 'pepper@example.test',
				type: 'login'
			}))?.type
		).toBe('login');
	});

	rollbackTest('an expired code answers null and is deleted', async (db) => {
		const ctx = testCtx({ db, now: NOW.toISOString() });
		await issueEmailCode(ctx, {
			code: '22222222',
			email: 'mia@example.test',
			type: 'signup',
			expiresAt: new Date(NOW.getTime() - 1)
		});

		expect(
			await redeemEmailCode(ctx, {
				code: '22222222',
				email: 'mia@example.test',
				type: 'signup'
			})
		).toBeNull();
		expect(await db.select().from(codes)).toEqual([]);
	});

	rollbackTest('stores an email-change code as its keyed digest and redeems it', async (db) => {
		const ctx = testCtx({ db, now: NOW.toISOString() });
		await issueEmailCode(ctx, {
			code: 'change-123',
			email: 'mia@example.test',
			type: 'email_change',
			pendingEmail: 'new@example.test'
		});

		const [stored] = await db.select().from(codes);
		expect(stored.code).toBe(hmacSha256Hex(ctx.config.codePepper, 'change-123'));
		expect(stored.code).not.toContain('change-123');

		// A wrong code, a wrong address and a wrong kind are all misses that
		// consume nothing: the row only answers its own `(digest, email, type)`.
		expect(
			await redeemEmailCode(ctx, {
				code: 'change-124',
				email: 'mia@example.test',
				type: 'email_change'
			})
		).toBeNull();
		expect(
			await redeemEmailCode(ctx, {
				code: 'change-123',
				email: 'other@example.test',
				type: 'email_change'
			})
		).toBeNull();
		expect(
			await redeemEmailCode(ctx, {
				code: 'change-123',
				email: 'mia@example.test',
				type: 'signup'
			})
		).toBeNull();
		expect(await db.select().from(codes)).toHaveLength(1);

		const redeemed = await redeemEmailCode(ctx, {
			code: 'change-123',
			email: 'mia@example.test',
			type: 'email_change'
		});
		expect(redeemed?.pendingEmail).toBe('new@example.test');
		expect(await db.select().from(codes)).toEqual([]);
	});

	rollbackTest('stores the reset marker as its keyed digest too (Q-116, Q-117)', async (db) => {
		const ctx = testCtx({ db, now: NOW.toISOString() });
		// Legacy's marker value is `used:<sha256(token)>` (the token hash stays a
		// bare SHA-256); the row keeps only the peppered digest of that string,
		// so a leaked table cannot revive a reset link.
		const marker = `used:${sha256Hex('reset-token')}`;
		const markerExpiry = new Date(NOW.getTime() + 60 * 60 * 1000);
		await issueEmailCode(ctx, {
			code: marker,
			email: 'mia@example.test',
			type: 'reset_used',
			expiresAt: markerExpiry
		});

		const [stored] = await db.select().from(codes);
		expect(stored.code).toBe(hmacSha256Hex(ctx.config.codePepper, marker));
		expect(stored.code).not.toContain(marker);

		expect(
			await redeemEmailCode(ctx, {
				code: `${marker}-other`,
				email: 'mia@example.test',
				type: 'reset_used'
			})
		).toBeNull();

		const redeemed = await redeemEmailCode(ctx, {
			code: marker,
			email: 'mia@example.test',
			type: 'reset_used'
		});
		expect(redeemed?.type).toBe('reset_used');
		expect(redeemed?.expiresAt).toEqual(markerExpiry);
		expect(await db.select().from(codes)).toEqual([]);
	});
});
