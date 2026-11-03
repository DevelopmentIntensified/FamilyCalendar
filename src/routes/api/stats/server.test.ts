import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * #292 G15 GET /api/stats and G16 GET /api/archive: the pages' loaders as
 * JSON (loadStats / loadArchive), parity with the page loaders pinned.
 */
const state = vi.hoisted(() => ({ queue: [] as unknown[][] }));

// oxlint-disable-next-line anti-slop/no-module-mocking -- scripted drizzle queue for the archive reads.
vi.mock('$lib/server/db', () => {
	const n: Record<string, unknown> = {};
	Object.assign(n, {
		from: () => n,
		where: () => {
			const r = state.queue.shift() ?? [];
			return Object.assign(Promise.resolve(r), { orderBy: () => Promise.resolve(r) });
		}
	});
	return { db: { select: () => n } };
});
// oxlint-disable-next-line anti-slop/no-module-mocking -- DB-backed counting action (has its own tests).
vi.mock('$lib/server/db/actions/taskStats', async (orig) => ({
	...(await orig<object>()),
	getTaskStats: vi.fn(async () => ({ total: 3, month: [{ day: 1, done: 1 }], doneBy: [{ userId: 'u1', done: 3 }] }))
}));
// oxlint-disable-next-line anti-slop/no-module-mocking -- DB-backed completion read.
vi.mock('$lib/server/db/actions/dashboard', () => ({
	getCompletionTimestamps: vi.fn(async () => [{ completedAt: '2026-11-02 10:00:00+00' }])
}));
// oxlint-disable-next-line anti-slop/no-module-mocking -- DB-backed family reads.
vi.mock('$lib/server/db/actions/families', () => ({
	getUserFamilyId: vi.fn(async () => 'fam-1'),
	getFamilyRoster: vi.fn(async () => [{ firstName: 'Ann', memberType: 'parent', email: 'secret@x.com' }]),
	getUserFamilyMemberships: vi.fn(async () => [{ family: { id: 'fam-1', name: 'Riveras' } }])
}));
// oxlint-disable-next-line anti-slop/no-module-mocking -- plan reads have their own tests.
vi.mock('$lib/server/services/subscriptionService', () => ({
	getUserSubscriptionLimits: vi.fn(async () => ({ retentionViewDays: 30, archivedRetentionDays: 365 })),
	canViewArchive: vi.fn(async () => ({ allowed: true })),
	getSubscriptionStatus: vi.fn(async () => ({ tier: { displayName: 'Family' } }))
}));

import { GET as STATS } from './+server';
import { GET as ARCHIVE } from '../archive/+server';
import { load as statsPage } from '../../(calendar)/calendar/stats/+page.server';
import { canViewArchive } from '$lib/server/services/subscriptionService';

function ev(user: { id: string } | null) {
	// SAFETY: test double — handlers read locals.user only.
	return { locals: { user } } as never;
}

beforeEach(() => {
	vi.clearAllMocks();
	state.queue = [];
});

describe('GET /api/stats (G15)', () => {
	it('401 without auth', async () => {
		expect((await STATS(ev(null))).status).toBe(401);
	});

	it('the stats page data; roster carries names + member type only', async () => {
		const body = await (await STATS(ev({ id: 'u1' }))).json();
		expect(Object.keys(body).sort()).toEqual(
			['stats', 'streak', 'completionIso', 'todayIso', 'month', 'doneBy', 'roster'].sort()
		);
		expect(body.roster).toEqual([{ firstName: 'Ann', memberType: 'parent' }]);
		expect(body.completionIso[0]).toMatch(/^2026-11-02T10:00/);
	});

	it('parity with the page loader (bar the clock)', async () => {
		const api = await (await STATS(ev({ id: 'u1' }))).json();
		const page = JSON.parse(JSON.stringify(await statsPage(ev({ id: 'u1' }))));
		delete api.todayIso;
		delete page.todayIso;
		expect(api).toEqual(page);
	});
});

describe('GET /api/archive (G16)', () => {
	it('401 without auth', async () => {
		expect((await ARCHIVE(ev(null))).status).toBe(401);
	});

	it('gated plan: no events, the reason + the gate facts', async () => {
		vi.mocked(canViewArchive).mockResolvedValueOnce({ allowed: false, reason: 'Upgrade to view' } as never);
		expect(await (await ARCHIVE(ev({ id: 'u1' }))).json()).toEqual({
			events: [],
			archiveAllowed: false,
			reason: 'Upgrade to view',
			planName: 'Family',
			familyCount: 1,
			retentionDays: 30,
			archivedRetentionDays: 365
		});
	});

	it('allowed: personal + family events badged with their calendar', async () => {
		state.queue = [
			[{ id: 'cal-me', familyId: null }],
			[{ id: 'e1', calendarId: 'cal-me', start: '2026-01-01T00:00:00.000Z', end: null }],
			[{ id: 'cal-fam', familyId: 'fam-1' }],
			[{ id: 'e2', calendarId: 'cal-fam', start: '2026-02-01T00:00:00.000Z', end: '2026-02-01T01:00:00.000Z' }]
		];
		const body = await (await ARCHIVE(ev({ id: 'u1' }))).json();
		expect(body.archiveAllowed).toBe(true);
		expect(body.events.map((e: { id: string; calendar: string }) => [e.id, e.calendar])).toEqual([
			['e1', 'Personal calendar'],
			['e2', 'Riveras']
		]);
	});
});
