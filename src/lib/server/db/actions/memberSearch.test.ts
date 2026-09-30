import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * The create-page member search (issue 100).
 *
 * The invite-flow lookup next door is exact-match on purpose: a wildcard scan
 * there would let any family member enumerate every verified user in the
 * product one letter at a time. A create-page picker needs prefix matching, so
 * it gets its own query with its own bounds — and these tests are the bounds.
 * The drizzle builder is stubbed (same approach as families.test.ts) so the
 * compiled where-clause can be read: the enumeration guard lives in the SQL, so
 * that is where it has to be asserted.
 */

/** A stubbed DB row: plain JSON-ish values only. */
type Row = Record<string, string | number | boolean | null>;

interface StubState {
	/** Where-condition of each select, in call order. */
	capturedWhere: unknown[];
	/** The row cap each select was given, in call order. */
	limits: number[];
	/** How many times a select asked for an ordering. */
	orderByCount: number;
	rows: Row[];
}

const state = vi.hoisted(
	(): StubState => ({ capturedWhere: [], limits: [], orderByCount: 0, rows: [] })
);

// oxlint-disable-next-line anti-slop/no-module-mocking -- scripted drizzle stub pins the query shape; real-Postgres harness tracked in docs/issues/002.
vi.mock('$lib/server/db', () => ({
	db: {
		select: () => {
			// SAFETY: the stub records the builder calls this query makes and
			// nothing else; the query under test only chains select/from/where/limit.
			const node = {
				from: () => node,
				where: (condition: unknown) => {
					state.capturedWhere.push(condition);
					return node;
				},
				orderBy: () => {
					state.orderByCount += 1;
					return Promise.resolve(state.rows);
				},
				limit: (count: number) => {
					state.limits.push(count);
					return Promise.resolve(state.rows);
				}
			};
			return node;
		}
	}
}));

import {
	findVerifiedUsersByPrefix,
	MEMBER_SEARCH_MIN_QUERY,
	MEMBER_SEARCH_ROW_CAP
} from './memberSearch';

/**
 * Flatten a drizzle condition into its string markers: column names and bound
 * parameters. Walks only `queryChunks` so it never follows a column back to its
 * table. The bound prefix IS the enumeration surface, so it has to be readable.
 */
function markers(fragment: unknown, acc: string[] = []): string[] {
	if (typeof fragment === 'string') {
		acc.push(fragment);
		return acc;
	}
	if (Array.isArray(fragment)) {
		for (const part of fragment) markers(part, acc);
		return acc;
	}
	if (fragment && typeof fragment === 'object') {
		// SAFETY: the stub only stores what drizzle handed it; reading these three
		// fields is the whole contract the walker needs.
		const chunk = fragment as { name?: unknown; value?: unknown; queryChunks?: unknown };
		if (typeof chunk.name === 'string') acc.push(chunk.name);
		if (typeof chunk.value === 'string') acc.push(chunk.value);
		if (Array.isArray(chunk.value)) {
			for (const part of chunk.value) if (typeof part === 'string') acc.push(part);
		}
		if (Array.isArray(chunk.queryChunks)) markers(chunk.queryChunks, acc);
	}
	return acc;
}

/** Markers of the single select the search issued. */
function whereMarkers(): string[] {
	if (state.capturedWhere.length !== 1) {
		throw new Error(`expected exactly one select, saw ${state.capturedWhere.length}`);
	}
	return markers(state.capturedWhere[0]);
}

beforeEach(() => {
	state.capturedWhere = [];
	state.limits = [];
	state.orderByCount = 0;
	state.rows = [];
});

describe('prefix matching is what a type-ahead needs', () => {
	it('finds a person by a prefix of their name', async () => {
		state.rows = [{ id: 'u1', firstName: 'Ann', lastName: 'Lee', email: 'ann@x.com' }];
		const result = await findVerifiedUsersByPrefix('ann', { callerId: 'me' });

		expect(result).toEqual({
			ok: true,
			users: [{ id: 'u1', firstName: 'Ann', lastName: 'Lee', email: 'ann@x.com' }]
		});

		const sql = whereMarkers();
		expect(sql).toContain('ann%');
		expect(sql).toContain('firstName');
		expect(sql).toContain('lastName');
		expect(sql).toContain('email');
		// A prefix, never a scan from both ends.
		expect(sql).not.toContain('%ann%');
	});

	it('escapes the wildcards in the query, so a crafted term cannot widen the scan', async () => {
		await findVerifiedUsersByPrefix('a%n', { callerId: 'me' });

		const sql = whereMarkers();
		expect(sql).toContain('a\\%n%');
		expect(sql).not.toContain('a%n%');
	});
});

describe('the bounds that keep it from being a user directory', () => {
	it('refuses a single letter rather than scanning for it', async () => {
		const result = await findVerifiedUsersByPrefix('a', { callerId: 'me' });

		expect(result).toEqual({ ok: false, reason: 'too-short' });
		// No query at all: a refusal must not cost a round trip.
		expect(state.capturedWhere).toEqual([]);
	});

	it('refuses a whitespace-only term as short, not as a match', async () => {
		const result = await findVerifiedUsersByPrefix('   ', { callerId: 'me' });

		expect(result).toEqual({ ok: false, reason: 'too-short' });
		expect(state.capturedWhere).toEqual([]);
	});

	it('refuses an absurdly long term', async () => {
		const result = await findVerifiedUsersByPrefix('a'.repeat(200), { callerId: 'me' });

		expect(result).toEqual({ ok: false, reason: 'too-long' });
		expect(state.capturedWhere).toEqual([]);
	});

	it('caps the rows it will ever hand back', async () => {
		await findVerifiedUsersByPrefix('ann', { callerId: 'me' });

		expect(state.limits).toEqual([MEMBER_SEARCH_ROW_CAP]);
		expect(MEMBER_SEARCH_ROW_CAP).toBeLessThanOrEqual(10);
	});

	it('asks for no ordering — an order would leak more than a match does', async () => {
		await findVerifiedUsersByPrefix('ann', { callerId: 'me' });

		expect(state.orderByCount).toBe(0);
	});

	it('never returns the caller, and never returns someone already picked', async () => {
		await findVerifiedUsersByPrefix('ann', { callerId: 'me', excludeUserIds: ['picked-1'] });

		const sql = whereMarkers();
		expect(sql).toContain('me');
		expect(sql).toContain('picked-1');
	});

	it('searches only verified users', async () => {
		await findVerifiedUsersByPrefix('ann', { callerId: 'me' });

		expect(whereMarkers()).toContain('emailVerified');
	});

	it('states its floor as one number both the query and its tests read', () => {
		expect(MEMBER_SEARCH_MIN_QUERY).toBe(2);
	});
});
