import { describe, it, expect, vi, beforeEach } from 'vitest';
import { isRedirect } from '@sveltejs/kit';

/**
 * Issue 124 — which family the board shows.
 *
 * `/family/tasks` used to read the user's FIRST `familyMembers` row with no
 * ordering and no addressable choice, so a user in two families got whichever
 * one the database handed back — the same first-row guess issue 098 removed
 * everywhere else. The board is the approved page (issue 101), so it inherits
 * the defect; it is fixed here the way the invitations page already is:
 * `?familyId=` addresses one family, and without it the OLDEST membership wins
 * — defined, not whatever came back.
 */

/** One membership row as `getUserFamilyMemberships` returns it. */
interface Membership {
	family: { id: string; name: string };
	role: string;
	memberType: string;
	memberCount: number;
}

interface StubState {
	/** Every membership the stubbed lookup returns, oldest family first. */
	memberships: Membership[];
	/** familyIds the task queries were asked about, in call order. */
	askedFor: string[];
}

const state = vi.hoisted(
	(): StubState => ({ memberships: [], askedFor: [] })
);

// oxlint-disable-next-line anti-slop/no-module-mocking -- the loader's seams are the actions it calls; the real-Postgres harness is tracked in docs/issues/002.
vi.mock('$lib/server/db/actions/families', () => ({
	getFamilyRoster: async (familyId: string) => {
		state.askedFor.push(`roster:${familyId}`);
		return [];
	},
	getUserFamilyMemberships: async () => state.memberships
}));

// oxlint-disable-next-line anti-slop/no-module-mocking -- as above; also covers the loader's dynamic import of the same module.
vi.mock('$lib/server/db/actions/tasks', () => ({
	getTasksForFamily: async (familyId: string) => {
		state.askedFor.push(`tasks:${familyId}`);
		return [];
	},
	getPublicTasksForFamily: async (familyId: string) => {
		state.askedFor.push(`public:${familyId}`);
		return [];
	},
	syncRecurringCursors: async () => {}
}));

// oxlint-disable-next-line anti-slop/no-module-mocking -- a pure function of the user; its own tests cover the zone rules.
vi.mock('$lib/server/utils/userTimezone', () => ({
	getUserZone: async () => 'UTC'
}));

import { load } from './+page.server';

/** The loader's return, narrowed from SvelteKit's open PageData bag. */
interface BoardData {
	familyId: string;
	userId: string;
}

// SAFETY: the loader reads only locals.user and url.searchParams — both carried
// in the event below — and returns exactly the fields asserted on.
const runLoad = load as (event: {
	locals: { user: { id: string } | null };
	url: URL;
}) => Promise<BoardData>;

/** One membership row, in the order getUserFamilyMemberships returns (oldest family first). */
function membership(id: string, name: string): Membership {
	return { family: { id, name }, role: 'creator', memberType: 'parent', memberCount: 2 };
}

/** Load the board for a signed-in user, optionally naming a family. */
function loadBoard(query = ''): Promise<BoardData> {
	return runLoad({
		locals: { user: { id: 'user-1' } },
		url: new URL(`http://localhost/family/tasks${query}`)
	});
}

beforeEach(() => {
	state.memberships = [];
	state.askedFor = [];
});

describe('family task board — which family it reads (issue 124)', () => {
	it('defaults to the OLDEST family, not whichever membership row comes first', async () => {
		state.memberships = [membership('fam-old', 'Rivera Home'), membership('fam-new', 'Lake House')];

		const data = await loadBoard();

		expect(data.familyId).toBe('fam-old');
		// every query the page makes is scoped to the family it chose
		expect(state.askedFor.every((entry) => entry.endsWith(':fam-old'))).toBe(true);
	});

	it('honours ?familyId= for a family the user actually belongs to', async () => {
		state.memberships = [membership('fam-old', 'Rivera Home'), membership('fam-new', 'Lake House')];

		const data = await loadBoard('?familyId=fam-new');

		expect(data.familyId).toBe('fam-new');
		expect(state.askedFor).toContain('tasks:fam-new');
	});

	it('falls back to the oldest when the named family is not the user\'s', async () => {
		state.memberships = [membership('fam-old', 'Rivera Home')];

		const data = await loadBoard('?familyId=someone-elses');

		expect(data.familyId).toBe('fam-old');
		expect(state.askedFor).not.toContain('tasks:someone-elses');
	});

	it('sends a user in no family to the families list', async () => {
		state.memberships = [];

		let thrown: unknown;
		try {
			await loadBoard();
		} catch (e) {
			thrown = e;
		}
		expect(isRedirect(thrown)).toBe(true);
		expect(thrown).toMatchObject({ location: '/family' });
	});
});