import { describe, it, expect, vi, beforeEach } from 'vitest';
import { isActionFailure, isRedirect } from '@sveltejs/kit';

/**
 * The create action's colour handling (issue 099). A family colour is free text
 * in the column, so a crafted form post could set anything; the action now reads
 * the one declared palette for both its fallback and its guard.
 */

/** A stubbed DB row: plain JSON-ish values only. */
type Row = Record<string, string | number | boolean | null>;

interface StubState {
	/** Every row handed to db.insert().values(), in call order (flattened). */
	inserts: Row[];
	/** How many transactions the action opened. */
	transactions: number;
}

const state = vi.hoisted((): StubState => ({ inserts: [], transactions: 0 }));

// oxlint-disable-next-line anti-slop/no-module-mocking -- scripted insert stub records what the action would write; real-Postgres harness tracked in docs/issues/002.
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
		transaction: async (run: (tx: unknown) => Promise<unknown>) => {
			state.transactions += 1;
			return await run(db);
		}
	};
	return { db };
});

// oxlint-disable-next-line anti-slop/no-module-mocking -- the plan check is a separate service with its own tests; this file is about the colour.
vi.mock('$lib/server/services/subscriptionService', () => ({
	canCreateFamily: async () => ({ allowed: true, limit: 1, used: 0 }),
	getUserSubscriptionLimits: async () => ({ memberLimit: 5 })
}));

import { actions } from './+page.server';
import { DEFAULT_FAMILY_COLOR, FAMILY_PALETTE } from '$lib/utils/familyPalette';

/** SvelteKit types Actions as possibly-undefined entries; this one exists. */
type CreateAction = (event: {
	request: Request;
	locals: { user: { id: string } | null };
}) => Promise<unknown>;

const createFamily = actions.default as unknown as CreateAction;

/** A create POST carrying the given fields. */
function post(fields: Record<string, string>): Request {
	return new Request('http://localhost/family/create', {
		method: 'POST',
		body: new URLSearchParams(fields)
	});
}

/** What the action produced: an action failure, or the redirect it threw. */
type Outcome = {
	status?: number;
	data?: { error?: string; name?: string; color?: string };
	redirect?: number;
	location?: string;
};

/** Run the action as a signed-in user; returns whatever it produced. */
async function create(fields: Record<string, string>): Promise<{ outcome: Outcome }> {
	try {
		const result = await createFamily({ request: post(fields), locals: { user: { id: 'u1' } } });
		return { outcome: result as Outcome };
	} catch (thrown) {
		// `redirect` throws by design — the success path ends that way.
		if (isRedirect(thrown)) {
			return { outcome: { redirect: thrown.status, location: thrown.location } };
		}
		throw thrown;
	}
}

beforeEach(() => {
	state.inserts = [];
	state.transactions = 0;
});

describe('create action — the default colour has one source of truth (issue 099)', () => {
	it('falls back to the declared default, which is the palette it also offers', async () => {
		await create({ name: 'The Hoppers' });

		const family = state.inserts[0];
		expect(family.color).toBe(DEFAULT_FAMILY_COLOR);
		expect(FAMILY_PALETTE.map((c) => c.value)).toContain(family.color as string);
	});

	it('redirects to the new family on success', async () => {
		const { outcome } = await create({ name: 'The Hoppers' });

		expect(outcome).toMatchObject({ redirect: 302 });
		expect(outcome.location).toMatch(/^\/family\//);
	});

	it('writes the family, its members and its calendar in one transaction', async () => {
		await create({ name: 'The Hoppers' });

		// Three inserts used to be three separate statements, so a failure half
		// way left a family with no calendar (issue 076).
		expect(state.transactions).toBe(1);
	});
});

describe('create action — the guard on an off-palette colour (issue 099)', () => {
	it('stores a colour taken from the declared palette', async () => {
		await create({ name: 'The Hoppers', color: '#4d9c85' });

		expect(state.inserts[0].color).toBe('#4d9c85');
	});

	const refused: [string, string][] = [
		['the retired default blue', '#3B82F6'],
		['a hex outside the palette', '#123456'],
		['a colour word', 'red'],
		['a css expression', 'red; background:url(x)'],
		['a palette hex re-cased', '#C45E38']
	];

	for (const [what, color] of refused) {
		it(`refuses ${what} and writes nothing at all`, async () => {
			const { outcome } = await create({ name: 'The Hoppers', color });

			expect(isActionFailure(outcome)).toBe(true);
			expect(outcome).toMatchObject({ status: 400 });
			expect(state.inserts).toEqual([]);
		});
	}

	it('names the failure in the returned error rather than swallowing it', async () => {
		const { outcome } = await create({ name: 'The Hoppers', color: 'chartreuse' });

		expect(outcome.data).toMatchObject({ error: expect.stringMatching(/colour/i) });
		// The typed values come back so the form can be re-rendered as it was.
		expect(outcome.data).toMatchObject({ name: 'The Hoppers' });
	});
});
