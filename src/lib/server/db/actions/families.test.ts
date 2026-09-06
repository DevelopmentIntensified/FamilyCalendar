import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * families actions hit `db`, so the drizzle query-builder is replaced with the
 * scripted stub used by the other action tests; the where-condition of each
 * select is captured so the searchUsers contract (exact-match, no substring
 * oracle) can be asserted against the compiled SQL markers.
 */
/** A stubbed DB row: plain JSON-ish values only. */
type Row = Record<string, string | number | boolean | null | Date>;

interface StubState {
	/** Rows returned by successive select calls. */
	queue: Row[][];
	/** First argument of each select's where() call, in call order. */
	capturedWhere: unknown[];
}

const state = vi.hoisted(
	(): StubState => ({
		queue: [],
		capturedWhere: []
	})
);

// oxlint-disable-next-line anti-slop/no-module-mocking -- scripted drizzle stub pins query shapes; real-Postgres harness tracked in docs/issues/002.
vi.mock('$lib/server/db', () => ({
	db: {
		select: () => ({
			from: () => ({
				where: (...args: unknown[]) => {
					state.capturedWhere.push(args[0]);
					const rows = state.queue.shift() ?? [];
					// Promise + chained limit so await and .limit() both resolve to rows.
					return Object.assign(Promise.resolve(rows), {
						limit: () => Promise.resolve(rows)
					});
				},
				limit: () => Promise.resolve(state.queue.shift() ?? [])
			})
		}),
		insert: () => ({
			values: () =>
				Object.assign(Promise.resolve([{}]), {
					returning: () => Promise.resolve([{}])
				})
		}),
		update: () => ({
			set: () => ({
				where: () => Promise.resolve()
			})
		})
	}
}));

import { searchUsers, acceptInvite } from './families';
import { clampCount } from '$lib/server/utils/clampCount';

/** A drizzle SQL internal: string leaf, chunk array, or wrapper object. */
interface SqlChunk {
	queryChunks?: SqlFragment;
	name?: SqlFragment;
	value?: SqlFragment;
}

type SqlFragment = string | undefined | readonly SqlFragment[] | SqlChunk;

/** True when the value is a drizzle SQL condition object we can walk. */
function isWalkableCondition(v: unknown): v is SqlChunk {
	return typeof v === 'object' && v !== null;
}

/** True when the fragment is a plain string (leaf marker or bound value). */
function isStringFragment(v: SqlFragment): v is string {
	return typeof v === 'string';
}

/** True when the fragment is a drizzle SQL/chunk object (non-string, non-array). */
function isSqlChunk(v: SqlFragment): v is SqlChunk {
	return !isStringFragment(v) && !Array.isArray(v) && typeof v === 'object' && v !== null;
}

/**
 * Flatten a drizzle SQL condition into string markers: quoted column names
 * (chunk `name`) and bound parameter values (chunk `value`). Walks only
 * `queryChunks` arrays to avoid circular column references.
 */
function collectMarkers(fragment: SqlFragment, acc: string[] = []): string[] {
	if (isStringFragment(fragment)) {
		acc.push(fragment);
		return acc;
	}
	if (Array.isArray(fragment)) {
		for (const chunk of fragment) collectMarkers(chunk, acc);
		return acc;
	}
	if (!isSqlChunk(fragment)) return acc;
	if (isStringFragment(fragment.name)) acc.push(fragment.name);
	if (isStringFragment(fragment.value)) acc.push(fragment.value);
	if (Array.isArray(fragment.queryChunks)) collectMarkers(fragment.queryChunks, acc);
	return acc;
}

/** Markers of the most recently captured where condition. */
function lastWhereMarkers(): string[] {
	const condition = state.capturedWhere[state.capturedWhere.length - 1];
	if (!isWalkableCondition(condition)) {
		throw new Error('expected a captured where condition');
	}
	return collectMarkers(condition);
}

describe('searchUsers', () => {
	beforeEach(() => {
		state.queue = [];
		state.capturedWhere = [];
	});

	it('matches by exact email, not a substring scan', async () => {
		// select #1 = existing members (none), #2 = matched users
		state.queue = [[], [{ id: 'u1', firstName: 'Ann', lastName: 'Lee', email: 'ann@x.com' }]];
		const results = await searchUsers('ann@x.com', 'fam-1');
		expect(results).toEqual([{ id: 'u1', firstName: 'Ann', lastName: 'Lee', email: 'ann@x.com' }]);

		const markers = lastWhereMarkers();
		expect(markers).toContain('email');
		// the bound parameter is the raw query — no % wrapping, so no enumeration oracle
		expect(markers).toContain('ann@x.com');
		expect(markers).not.toContain('%ann@x.com%');
	});

	it('escapes ILIKE wildcards in the query', async () => {
		// select #1 = existing members (none), #2 = matched users
		state.queue = [[], []];
		await searchUsers('ann%@x.com', 'fam-1');
		const markers = lastWhereMarkers();
		expect(markers).toContain('ann\\%@x.com');
	});

	it('matches an exact first+last name pair', async () => {
		// select #1 = existing members (none), #2 = matched users
		state.queue = [[], []];
		await searchUsers('Ann Lee', 'fam-1');
		const markers = lastWhereMarkers();
		expect(markers).toContain('firstName');
		expect(markers).toContain('lastName');
	});

	it('excludes existing family members from results', async () => {
		// select #1 = existing members, #2 = matched users
		state.queue = [[{ userId: 'member-9' }], []];
		await searchUsers('ann@x.com', 'fam-1');
		const markers = lastWhereMarkers();
		expect(markers).toContain('member-9');
	});

	it('omits the exclusion clause when the family has no members', async () => {
		// select #1 = existing members (none), #2 = matched users
		state.queue = [[], []];
		await searchUsers('ann@x.com', 'fam-1');
		const markers = lastWhereMarkers();
		expect(markers).not.toContain('member-9');
	});
});

describe('acceptInvite', () => {
	beforeEach(() => {
		state.queue = [];
		state.capturedWhere = [];
	});

	it('refuses the join when the family is at its member limit', async () => {
		// select #1 = invite code, #2 = family, #3 = existing membership (none),
		// #4 = member count (2 members), #5 = creator lookup, #6 = subscriptions (none → limit 1)
		state.queue = [
			[{ code: 'code-1', familyId: 'fam-1', maxUses: 1, useCount: 0 }],
			[{ id: 'fam-1' }],
			[],
			[{ memberCount: 2 }],
			[{ userId: 'creator-1' }],
			[]
		];
		const result = await acceptInvite('joiner-1', 'code-1');
		expect(result.accepted).toBe(false);
		expect(result.reason).toBe('family-full');
	});

	it('accepts the join when the family is under its member limit', async () => {
		// select #1 = invite code, #2 = family, #3 = existing membership (none),
		// #4 = member count (0 members), #5 = creator lookup (none → default limit)
		state.queue = [
			[{ code: 'code-1', familyId: 'fam-1', maxUses: 1, useCount: 0 }],
			[{ id: 'fam-1' }],
			[],
			[{ memberCount: 0 }],
			[]
		];
		const result = await acceptInvite('joiner-1', 'code-1');
		expect(result.accepted).toBe(true);
	});

	it('still refuses an invalid or exhausted invite code', async () => {
		// select #1 = invite code (none)
		state.queue = [[]];
		const result = await acceptInvite('joiner-1', 'code-dead');
		expect(result.accepted).toBe(false);
		expect(result.reason).toBeUndefined();
	});
});

describe('clampCount (invite route body clamps)', () => {
	/** Mirrors the route's BodyCount without importing the private alias. */
	type TestBodyCount = number | string | null | undefined;

	interface ClampCase {
		name: string;
		input: TestBodyCount;
		expected: number;
	}

	const expiresInDaysCases: ClampCase[] = [
		{ name: 'missing value falls back to 7 days', input: undefined, expected: 7 },
		{ name: 'null falls back to 7 days', input: null, expected: 7 },
		{ name: 'empty string falls back to 7 days', input: '', expected: 7 },
		{ name: 'non-numeric string falls back to 7 days', input: 'never', expected: 7 },
		{ name: 'zero clamps up to 1 day', input: 0, expected: 1 },
		{ name: 'negative clamps up to 1 day', input: -5, expected: 1 },
		{ name: 'in-range value passes through', input: 14, expected: 14 },
		{ name: 'numeric string passes through', input: '14', expected: 14 },
		{ name: 'fraction truncates', input: 14.9, expected: 14 },
		{ name: 'huge value clamps down to 30 days', input: 1000, expected: 30 }
	];

	for (const clampCase of expiresInDaysCases) {
		it(`expiresInDays: ${clampCase.name}`, () => {
			expect(clampCount(clampCase.input, 1, 30, 7)).toBe(clampCase.expected);
		});
	}

	const maxUsesCases: ClampCase[] = [
		{ name: 'missing value falls back to 10 uses', input: undefined, expected: 10 },
		{ name: 'NaN falls back to 10 uses', input: Number.NaN, expected: 10 },
		{ name: 'zero clamps up to 1 use', input: 0, expected: 1 },
		{ name: 'in-range value passes through', input: 25, expected: 25 },
		{ name: 'huge value clamps down to 50 uses', input: 100000, expected: 50 }
	];

	for (const clampCase of maxUsesCases) {
		it(`maxUses: ${clampCase.name}`, () => {
			expect(clampCount(clampCase.input, 1, 50, 10)).toBe(clampCase.expected);
		});
	}
});
