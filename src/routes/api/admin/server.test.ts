import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * /api/admin/** (#292 G19): the admin pages' data and resolve actions, gated
 * by the (admin) layout's own role rule (isAdminUser) — 401 / 403 JSON.
 */
// oxlint-disable-next-line anti-slop/no-module-mocking -- DB-backed admin registers.
vi.mock('$lib/server/db/actions/bugReports', () => ({
	countOpenBugReports: vi.fn(async () => 2),
	getBugReportsWithReporter: vi.fn(async (resolved: boolean) =>
		resolved
			? []
			: [
					{
						id: 'b1',
						area: 'calendar',
						description: 'Chip overlaps',
						url: '/calendar',
						status: 'open',
						createdAt: new Date('2026-11-01T00:00:00.000Z'),
						reporterFirstName: 'Ann',
						reporterLastName: 'Lee'
					}
				]
	),
	resolveBugReport: vi.fn(async (id: string) => (id === 'b1' ? { id, status: 'resolved' } : undefined))
}));
// oxlint-disable-next-line anti-slop/no-module-mocking -- DB-backed admin registers.
vi.mock('$lib/server/db/actions/unmatchedPhrases', () => ({
	countOpenUnmatchedPhrases: vi.fn(async () => {
		throw new Error('db down');
	}),
	getUnmatchedPhrases: vi.fn(async () => []),
	resolveUnmatchedPhrase: vi.fn(async () => undefined)
}));

import { GET as COUNTS } from './+server';
import { GET as BUGS } from './bugs/+server';
import { POST as RESOLVE_BUG } from './bugs/[id]/resolve/+server';
import { GET as NLP } from './nlp/+server';
import { POST as RESOLVE_PHRASE } from './nlp/[id]/resolve/+server';
import { resolveBugReport } from '$lib/server/db/actions/bugReports';

const ADMIN = { id: 'a1', roles: ['admin'] };
const MEMBER = { id: 'u1', roles: [] };

function ev(user: unknown, id = 'b1') {
	// SAFETY: test double — handlers read locals.user and params.
	return { locals: { user }, params: { id } } as never;
}

beforeEach(() => vi.clearAllMocks());

describe('/api/admin/** (G19)', () => {
	const all = [
		['counts', COUNTS],
		['bugs', BUGS],
		['resolve bug', RESOLVE_BUG],
		['nlp', NLP],
		['resolve phrase', RESOLVE_PHRASE]
	] as const;

	it.each(all)('%s: 401 without auth', async (_n, h) => {
		expect((await h(ev(null))).status).toBe(401);
	});

	it.each(all)('%s: 403 for a non-admin, nothing resolved', async (_n, h) => {
		const res = await h(ev(MEMBER));
		expect(res.status).toBe(403);
		expect(await res.json()).toEqual({ error: 'Forbidden' });
		expect(resolveBugReport).not.toHaveBeenCalled();
	});

	it('counts degrade to 0 per leg', async () => {
		vi.spyOn(console, 'error').mockImplementation(() => {});
		expect(await (await COUNTS(ev(ADMIN))).json()).toEqual({ openBugs: 2, openPhrases: 0 });
	});

	it('bugs: open + resolved + the export text', async () => {
		const body = await (await BUGS(ev(ADMIN))).json();
		expect(body.open).toHaveLength(1);
		expect(body.resolved).toEqual([]);
		expect(body.exportText).toContain('Chip overlaps');
	});

	it('resolve: 200 for a real id, 404 for an unknown one', async () => {
		expect((await RESOLVE_BUG(ev(ADMIN, 'b1'))).status).toBe(200);
		expect((await RESOLVE_BUG(ev(ADMIN, 'nope'))).status).toBe(404);
		expect((await RESOLVE_PHRASE(ev(ADMIN, 'nope'))).status).toBe(404);
	});

	it('nlp: the register + export text', async () => {
		const body = await (await NLP(ev(ADMIN))).json();
		expect(body).toEqual(expect.objectContaining({ phrases: [], resolved: [] }));
		expect(typeof body.exportText).toBe('string');
	});
});
