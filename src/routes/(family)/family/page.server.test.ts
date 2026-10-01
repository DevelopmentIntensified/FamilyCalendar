import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { PgTable } from 'drizzle-orm/pg-core';

/**
 * The families list loader (issue 098). It used to answer "which family is
 * this user's family?" with the member's FIRST `familyMembers` row, so a user
 * in two families could only ever see one of them and the plan-usage figure
 * could only ever read "1 family".
 *
 * These tests stub `db` per queried table (the drizzle query-builder is
 * replaced with a chain stub, same approach as families.test.ts) so the loader
 * can be driven through a two-family user and its QUERY COUNT pinned — the
 * card's stats must be a fixed number of queries, never one per card.
 */

/** A stubbed DB row: plain JSON-ish values only. */
type Row = Record<string, string | number | boolean | null | Date>;

interface StubState {
	/** Rows the stub hands back for each queried schema table. */
	rowsByTable: Map<PgTable, Row[]>;
	/** Every select() the loader issued — the query-count pin. */
	selectCount: number;
	/** orderBy() calls, so "oldest family first" stays explicit, not DB order. */
	orderByCount: number;
}

const state = vi.hoisted(
	(): StubState => ({
		rowsByTable: new Map(),
		selectCount: 0,
		orderByCount: 0
	})
);

/**
 * A drizzle chain stub: a resolved promise carrying the builder methods, so
 * `await` and further chaining both work. Every method returns the same node.
 */
function makeChain(rows: Row[]) {
	const chain = Object.assign(Promise.resolve(rows), {
		innerJoin: () => chain,
		leftJoin: () => chain,
		where: () => chain,
		groupBy: () => chain,
		orderBy: () => {
			state.orderByCount += 1;
			return chain;
		},
		limit: () => chain
	});
	return chain;
}

// oxlint-disable-next-line anti-slop/no-module-mocking -- scripted drizzle stub pins the loader's query count; real-Postgres harness tracked in docs/issues/002.
vi.mock('$lib/server/db', () => ({
	db: {
		// Every drizzle query in this codebase opens with `.from()`, so that is
		// the only method select() has to answer — and it is where the table
		// (and therefore the scripted rows) becomes known.
		select: () => {
			state.selectCount += 1;
			return { from: (table: PgTable) => makeChain(state.rowsByTable.get(table) ?? []) };
		}
	}
}));

import { load } from './+page.server';
import { familyMembers, subscriptionTypes, subscriptions, tasks } from '$lib/server/db/schema';

/** The loader's return shape, narrowed from SvelteKit's open PageData bag. */
interface FamilyListData {
	families: {
		id: string;
		name: string;
		color: string | null;
		memberCount: number;
		openTasks: number;
		canInvite: boolean;
	}[];
	plan: { used: number; limit: number };
}

// SAFETY: SvelteKit types PageServerLoad's return as an open bag; the loader
// under test returns exactly this shape, asserted field by field below.
// SAFETY: the loader reads only locals.user.id; the rest of the kit event is irrelevant.
const runLoad = load as (event: { locals: { user: { id: string } } }) => Promise<FamilyListData>;

/** One membership row as the memberships query returns it (oldest first). */
function membership(
	familyId: string,
	name: string,
	memberCount: number,
	createdAt: string,
	role = 'creator'
) {
	return {
		id: familyId,
		name,
		color: '#3b82f6',
		createdAt: new Date(createdAt),
		role,
		memberType: 'parent',
		memberCount
	};
}

/** One grouped open-Task count row. */
function openTasks(familyId: string, openTaskCount: number) {
	return { familyId, openTasks: openTaskCount };
}

/** Script which rows the stub hands back for each table the loader touches. */
function scriptDb(memberships: Row[], counts: Row[], subs: Row[] = [], tiers: Row[] = []) {
	state.rowsByTable = new Map();
	state.rowsByTable.set(familyMembers, memberships);
	state.rowsByTable.set(tasks, counts);
	state.rowsByTable.set(subscriptions, subs);
	state.rowsByTable.set(subscriptionTypes, tiers);
}

/** Load the page for a user, with the given memberships and task counts. */
function loadPage(memberships: Row[], counts: Row[]): Promise<FamilyListData> {
	scriptDb(memberships, counts);
	return runLoad({ locals: { user: { id: 'user-1' } } });
}

beforeEach(() => {
	state.rowsByTable = new Map();
	state.selectCount = 0;
	state.orderByCount = 0;
});

describe('families list loader — every family, not the first row (issue 098)', () => {
	it('lists BOTH families of a user who belongs to two — the case that is broken today', async () => {
		const data = await loadPage(
			[
				membership('fam-old', 'Rivera Home', 4, '2026-01-04'),
				membership('fam-new', 'Lake House', 2, '2026-06-01')
			],
			[openTasks('fam-old', 3)]
		);

		expect(data.families.map((f) => f.id)).toEqual(['fam-old', 'fam-new']);
		expect(data.families.map((f) => f.name)).toEqual(['Rivera Home', 'Lake House']);
	});

	it('carries the roster size and the open-Task stat per family, zero-filling a family with none', async () => {
		const data = await loadPage(
			[
				membership('fam-old', 'Rivera Home', 4, '2026-01-04'),
				membership('fam-new', 'Lake House', 2, '2026-06-01')
			],
			[openTasks('fam-old', 3)]
		);

		expect(data.families[0]).toMatchObject({ memberCount: 4, openTasks: 3 });
		// no grouped row for fam-new — the card must still read a number
		expect(data.families[1]).toMatchObject({ memberCount: 2, openTasks: 0 });
	});

	it('orders families explicitly instead of taking whatever row the database hands back', async () => {
		await loadPage([membership('fam-old', 'Rivera Home', 4, '2026-01-04')], []);
		expect(state.orderByCount).toBeGreaterThan(0);
	});

	it('returns an empty list for a user in no family', async () => {
		const data = await loadPage([], []);
		expect(data.families).toEqual([]);
		expect(data.plan.used).toBe(0);
	});
});

describe('families list loader — the card costs a fixed number of queries (issue 078)', () => {
	it('does not issue one query per family: 1 family and 3 families cost the same', async () => {
		await loadPage([membership('fam-a', 'A', 2, '2026-01-01')], [openTasks('fam-a', 1)]);
		const oneFamilyQueries = state.selectCount;

		// rewind the counter so the second figure is this load's own cost
		state.selectCount = 0;
		await loadPage(
			[
				membership('fam-a', 'A', 2, '2026-01-01'),
				membership('fam-b', 'B', 3, '2026-02-01'),
				membership('fam-c', 'C', 4, '2026-03-01')
			],
			[openTasks('fam-a', 1), openTasks('fam-b', 2), openTasks('fam-c', 3)]
		);
		const threeFamilyQueries = state.selectCount;

		expect(threeFamilyQueries).toBe(oneFamilyQueries);
		// memberships + one grouped open-Task count + the subscription read.
		expect(oneFamilyQueries).toBe(3);
	});
});

describe('families list loader — who may mint an invite link (issue 091)', () => {
	it('offers the invite affordance for a family you create or administer', async () => {
		const data = await loadPage(
			[
				membership('fam-old', 'Rivera Home', 4, '2026-01-04', 'creator'),
				membership('fam-new', 'Lake House', 2, '2026-06-01', 'admin')
			],
			[]
		);

		expect(data.families.map((f) => f.canInvite)).toEqual([true, true]);
	});

	it('does not offer it to a plain member of their own family', async () => {
		const data = await loadPage([membership('fam-old', 'Rivera Home', 4, '2026-01-04', 'member')], []);

		// The membership ROLE is the permission here. memberType — the personal
		// profile — is not, per CONTEXT.md and ADR-0001.
		expect(data.families[0].canInvite).toBe(false);
	});
});

describe('families list loader — plan usage behind the pill (issue 098)', () => {
	it('reads real plan usage: both families against the default limit of one', async () => {
		const data = await loadPage(
			[
				membership('fam-old', 'Rivera Home', 4, '2026-01-04'),
				membership('fam-new', 'Lake House', 2, '2026-06-01')
			],
			[]
		);

		expect(data.plan).toEqual({ used: 2, limit: 1 });
	});

	it('reports the subscribed family limit when a tier grants more', async () => {
		scriptDb(
			[membership('fam-a', 'A', 2, '2026-01-01')],
			[],
			[{ id: 'sub-1', subscriptionTypeId: 'tier-1', endDate: null }],
			[{ id: 'tier-1', familyLimit: 5 }]
		);
		const data = await runLoad({ locals: { user: { id: 'user-1' } } });

		expect(data.plan).toEqual({ used: 1, limit: 5 });
	});
});
