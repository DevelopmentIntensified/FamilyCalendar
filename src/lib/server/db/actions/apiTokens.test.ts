import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createHash } from 'crypto';

/** Scripted drizzle stub (families.test.ts pattern): selects drain a queue
 *  so the token-lookup → getUser two-step can be scripted in order. */
const state = vi.hoisted(() => ({
	selectQueue: [] as unknown[][],
	insertValues: null as Record<string, unknown> | null,
	insertReturn: [] as Record<string, unknown>[],
	updateValues: null as Record<string, unknown> | null
}));

// oxlint-disable-next-line anti-slop/no-module-mocking -- scripted drizzle stub pins query shapes; real-Postgres harness tracked in docs/issues/002.
vi.mock('$lib/server/db', () => ({
	db: {
		select: () => ({
			from: () => ({
				where: () => Promise.resolve(state.selectQueue.shift() ?? [])
			})
		}),
		insert: () => ({
			values: (v: Record<string, unknown>) => {
				state.insertValues = v;
				return { returning: () => Promise.resolve(state.insertReturn) };
			}
		}),
		update: () => ({
			set: (v: Record<string, unknown>) => {
				state.updateValues = v;
				return { where: () => Promise.resolve([]) };
			}
		}),
		delete: () => ({
			where: () => Promise.resolve([])
		})
	}
}));

import {
	API_TOKEN_PREFIX,
	hashApiToken,
	mintApiTokenPlaintext,
	createApiToken,
	listTokensForUser,
	revokeToken,
	getUserForApiToken
} from './apiTokens';

beforeEach(() => {
	state.selectQueue = [];
	state.insertValues = null;
	state.insertReturn = [];
	state.updateValues = null;
	vi.clearAllMocks();
});

describe('hashApiToken', () => {
	it('is the SHA-256 hex of the token', () => {
		expect(hashApiToken('fp_abc')).toBe(createHash('sha256').update('fp_abc').digest('hex'));
		expect(hashApiToken('fp_abc')).toMatch(/^[0-9a-f]{64}$/);
	});

	it('differs per token', () => {
		expect(hashApiToken('fp_one')).not.toBe(hashApiToken('fp_two'));
	});
});

describe('mintApiTokenPlaintext', () => {
	it('is fp_-prefixed base64url of 32 bytes, unique per mint', () => {
		const a = mintApiTokenPlaintext();
		const b = mintApiTokenPlaintext();
		expect(a.startsWith(API_TOKEN_PREFIX)).toBe(true);
		expect(a.length).toBe(API_TOKEN_PREFIX.length + 43);
		expect(a).toMatch(/^fp_[A-Za-z0-9_-]{43}$/);
		expect(a).not.toBe(b);
	});
});

describe('createApiToken', () => {
	it('stores the hash (never the plaintext) and returns the plaintext once', async () => {
		state.insertReturn = [{ id: 'tok-1', name: 'TaskFocus' }];
		const { row, token } = await createApiToken('user-1', 'TaskFocus');

		expect(token.startsWith(API_TOKEN_PREFIX)).toBe(true);
		expect(row).toEqual({ id: 'tok-1', name: 'TaskFocus' });
		expect(state.insertValues).toMatchObject({
			userId: 'user-1',
			name: 'TaskFocus',
			tokenHash: hashApiToken(token)
		});
		expect(Object.values(state.insertValues ?? {})).not.toContain(token);
	});
});

describe('getUserForApiToken', () => {
	it('returns null without touching the DB for malformed tokens', async () => {
		const queued = state.selectQueue.length;
		expect(await getUserForApiToken('not-a-token')).toBeNull();
		expect(await getUserForApiToken('')).toBeNull();
		expect(state.selectQueue.length).toBe(queued);
		expect(state.updateValues).toBeNull();
	});

	it('returns the user and touches last-used on a valid token', async () => {
		const user = { id: 'user-1', firstName: 'Ann' };
		state.selectQueue = [[{ id: 'tok-1', userId: 'user-1' }], [user]];

		const found = await getUserForApiToken('fp_validtoken');

		expect(found).toEqual(user);
		expect(state.updateValues?.lastUsedAt).toBeInstanceOf(Date);
	});

	it('returns null for an unknown hash (no touch)', async () => {
		state.selectQueue = [[]];
		expect(await getUserForApiToken('fp_unknown')).toBeNull();
		expect(state.updateValues).toBeNull();
	});

	it('returns null when the token owner is gone (no touch)', async () => {
		state.selectQueue = [[{ id: 'tok-1', userId: 'user-gone' }], []];
		expect(await getUserForApiToken('fp_orphan')).toBeNull();
		expect(state.updateValues).toBeNull();
	});
});

describe('revokeToken + listTokensForUser', () => {
	it('revoke resolves (delete is scoped to id+userId in the query)', async () => {
		await expect(revokeToken('user-1', 'tok-1')).resolves.toBeUndefined();
	});

	it('lists rows for the user', async () => {
		const rows = [{ id: 'tok-1', name: 'TaskFocus' }];
		state.selectQueue = [rows];
		expect(await listTokensForUser('user-1')).toEqual(rows);
	});
});
