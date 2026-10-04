import { describe, it, expect, vi, beforeEach } from 'vitest';
import { isActionFailure, isRedirect } from '@sveltejs/kit';

/**
 * Issue 124 / 076 — "members before the finish line" on the create page.
 *
 * The prototype's premise is that a family created with nobody in it is an
 * empty shell, and the app had no way to put anybody in it before the finish
 * line: the create action wrote three rows and stopped. So a family could only
 * be created, then populated, by a second trip through the members page.
 *
 * What is pinned here is the server half, because that is where the mistakes
 * live: who gets inserted, with which role and Member Type, what happens when
 * the pick is over the plan's member limit, and whether a half-made family can
 * be left behind. The picker that posts `memberIds` is a component
 * (`CreateFamilyMemberPicker.svelte`); it cannot add a member without this.
 */

/** A stubbed DB row: plain JSON-ish values only. */
type Row = Record<string, string | number | boolean | null>;

interface StubState {
	/** Every row handed to insert().values(), in call order. */
	inserts: Row[];
	/** How many transactions were opened. */
	transactions: number;
	/** User rows the users table holds, as { id, emailVerified }. */
	users: Row[];
	/** The member limit the plan reports. */
	memberLimit: number;
	/** Set when a transaction rolled back. */
	rolledBack: boolean;
}

const state = vi.hoisted(
	(): StubState => ({
		inserts: [],
		transactions: 0,
		users: [],
		memberLimit: 5,
		rolledBack: false
	})
);

// oxlint-disable-next-line anti-slop/no-module-mocking -- scripted insert/select stub records what the action would write; the real-Postgres harness is tracked in docs/issues/002.
vi.mock('$lib/server/db', () => {
	const db = {
		insert: () => ({
			values: (row: Row | Row[]) => {
				// One call may carry a batch (the memberships are written as one).
				const rows = Array.isArray(row) ? row : [row];
				state.inserts.push(...rows);
				return Promise.resolve(rows);
			}
		}),
		select: () => ({
			from: () => ({
				where: () => Promise.resolve(state.users)
			})
		}),
		transaction: async (run: (tx: FamilyCreateTx) => Promise<void>) => {
			state.transactions += 1;
			try {
				return await run(db);
			} catch (error) {
				state.rolledBack = true;
				throw error;
			}
		}
	};
	return { db };
});

/** The slice of the drizzle transaction client the create action uses. */
interface FamilyCreateTx {
	insert(): { values(row: Row | Row[]): Promise<Row[]> };
}

// oxlint-disable-next-line anti-slop/no-module-mocking -- the plan checks are a separate service with their own tests.
vi.mock('$lib/server/services/subscriptionService', () => ({
	canCreateFamily: async () => ({ allowed: true, limit: 1, used: 0 }),
	getUserSubscriptionLimits: async () => ({ memberLimit: state.memberLimit })
}));

import { actions } from './+page.server';

/** The signed-in creator the action runs as. */
type Locals = { user: { id: string } | null };

/** SAFETY: the action reads locals.user and the posted form body, nothing else. */
const createFamily = actions.default as unknown as (event: {
	request: Request;
	locals: Locals;
}) => Promise<Outcome>;

/** A create POST carrying the given fields (memberIds may repeat). */
function post(fields: Record<string, string | string[]>): Request {
	const body = new URLSearchParams();
	for (const [key, value] of Object.entries(fields)) {
		for (const one of Array.isArray(value) ? value : [value]) body.append(key, one);
	}
	return new Request('http://localhost/family/create', { method: 'POST', body });
}

/** What the action produced: an action failure, or the redirect it threw. */
type Outcome = {
	status?: number;
	data?: { error?: string };
	redirect?: number;
	location?: string;
};

/** Run the action as a signed-in creator. */
async function create(
	fields: Record<string, string | string[]>,
	userId: string | null = 'creator-1'
): Promise<Outcome> {
	const locals: Locals = { user: userId ? { id: userId } : null };
	try {
		// SAFETY: the action either answers with one of the shapes in Outcome or
		// throws a redirect, both of which this file asserts on.
		return (await createFamily({ request: post(fields), locals })) as Outcome;
	} catch (thrown) {
		// `redirect` throws by design — the success path ends that way.
		if (isRedirect(thrown)) return { redirect: thrown.status, location: thrown.location };
		throw thrown;
	}
}

/** The membership rows the action wrote, without the family's own row. */
function membershipRows(): Row[] {
	return state.inserts.filter((row) => 'userId' in row && 'familyId' in row);
}

beforeEach(() => {
	state.inserts = [];
	state.transactions = 0;
	state.rolledBack = false;
	state.memberLimit = 5;
	state.users = [
		{ id: 'user-1', emailVerified: true },
		{ id: 'user-2', emailVerified: true },
		{ id: 'user-3', emailVerified: false }
	];
});

describe('create action — the members picked before the finish line (issue 076)', () => {
	it('creates the family, the calendar and one membership per person picked', async () => {
		const outcome = await create({
			name: 'The Hoppers',
			memberIds: ['user-1', 'user-2']
		});

		expect(outcome).toMatchObject({ redirect: 302 });
		expect(membershipRows()).toHaveLength(3);
		expect(membershipRows().map((row) => row.userId)).toEqual(['creator-1', 'user-1', 'user-2']);
	});

	it('keeps the creator as the creator and gives everyone picked the plain member role', async () => {
		await create({ name: 'The Hoppers', memberIds: ['user-1'] });

		const [creator, picked] = membershipRows();
		expect(creator).toMatchObject({ userId: 'creator-1', role: 'creator' });
		// role is the permission, memberType is the personal profile — two
		// different things, and both are written down rather than inherited
		// from a column default (CONTEXT.md, ADR-0001).
		expect(picked).toMatchObject({ userId: 'user-1', role: 'member', memberType: 'member' });
	});

	it('writes the whole family inside one transaction, so a failure leaves nothing behind', async () => {
		await create({ name: 'The Hoppers', memberIds: ['user-1'] });

		expect(state.transactions).toBe(1);
	});

	it('will not let the creator put themselves in their own family twice', async () => {
		await create({ name: 'The Hoppers', memberIds: ['creator-1'] });

		expect(membershipRows().map((row) => row.userId)).toEqual(['creator-1']);
	});

	it('collapses a repeated pick rather than failing on the primary key', async () => {
		const outcome = await create({ name: 'The Hoppers', memberIds: ['user-1', 'user-1'] });

		expect(outcome).toMatchObject({ redirect: 302 });
		expect(membershipRows().map((row) => row.userId)).toEqual(['creator-1', 'user-1']);
	});

	it('refuses somebody who is not a verified user, and writes nothing at all', async () => {
		const outcome = await create({ name: 'The Hoppers', memberIds: ['user-1', 'who-dis'] });

		expect(isActionFailure(outcome)).toBe(true);
		expect(outcome.data?.error).toMatch(/member|invite/i);
		expect(state.inserts).toEqual([]);
		expect(state.transactions).toBe(0);
	});

	it('refuses an account with no verified email — a picker never offers one', async () => {
		const outcome = await create({ name: 'The Hoppers', memberIds: ['user-3'] });

		expect(isActionFailure(outcome)).toBe(true);
		expect(state.inserts).toEqual([]);
	});

	it('refuses a pick over the plan member limit, naming the limit', async () => {
		state.memberLimit = 2;
		const outcome = await create({ name: 'The Hoppers', memberIds: ['user-1', 'user-2'] });

		expect(isActionFailure(outcome)).toBe(true);
		expect(outcome.data?.error).toMatch(/2|member limit/i);
		expect(state.inserts).toEqual([]);
	});

	it('allows a pick that exactly fills the plan member limit', async () => {
		state.memberLimit = 3;
		const outcome = await create({ name: 'The Hoppers', memberIds: ['user-1', 'user-2'] });

		expect(outcome).toMatchObject({ redirect: 302 });
		expect(membershipRows()).toHaveLength(3);
	});

	it('creates a family with nobody in it when nobody was picked — the shell is still allowed', async () => {
		const outcome = await create({ name: 'The Hoppers' });

		expect(outcome).toMatchObject({ redirect: 302 });
		expect(membershipRows().map((row) => row.userId)).toEqual(['creator-1']);
	});
});
