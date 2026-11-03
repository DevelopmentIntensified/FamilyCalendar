import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * #292 G10a / G10c / G11 read endpoints, through the real familyData
 * service with the membership + DB seams scripted. The point under test:
 * the pages fall back to the OLDEST family when ?familyId= misses; the API
 * never does — an id you are not a member of is a 404.
 */
const state = vi.hoisted(() => ({ codes: [] as unknown[] }));

// oxlint-disable-next-line anti-slop/no-module-mocking -- scripted drizzle stub (invite-code read + overview grouped reads).
vi.mock('$lib/server/db', () => {
	const n: Record<string, unknown> = {};
	const rows = () => state.codes;
	Object.assign(n, {
		from: () => n,
		innerJoin: () => n,
		groupBy: () => Promise.resolve([]),
		orderBy: () => Promise.resolve([]),
		where: () => Object.assign(Promise.resolve(rows()), n)
	});
	return { db: { select: () => n } };
});
// oxlint-disable-next-line anti-slop/no-module-mocking -- DB-backed membership reads.
vi.mock('$lib/server/db/actions/families', () => ({
	getUserFamilyMemberships: vi.fn(async () => [
		{
			family: { id: 'fam-old', name: 'Old', color: null, createdAt: new Date('2025-01-01') },
			role: 'member',
			memberType: 'parent',
			memberCount: 2,
			firstNames: ['Ann', 'Bob']
		},
		{
			family: { id: 'fam-mine', name: 'Mine', color: '#00ff00', createdAt: new Date('2026-01-01') },
			role: 'creator',
			memberType: 'parent',
			memberCount: 1,
			firstNames: ['Ann']
		}
	]),
	getFamilyRoster: vi.fn(async () => [{ userId: 'u1', firstName: 'Ann' }])
}));
// oxlint-disable-next-line anti-slop/no-module-mocking -- DB-backed task reads.
vi.mock('$lib/server/db/actions/tasks', () => ({
	getTasksForFamily: vi.fn(async (f: string) => [{ id: `t-${f}` }]),
	getPublicTasksForFamily: vi.fn(async () => [])
}));
// oxlint-disable-next-line anti-slop/no-module-mocking -- DB-backed category read.
vi.mock('$lib/server/db/actions/taskCategories', () => ({
	listCategoryOptions: vi.fn(async () => [{ id: 'c1', name: 'Home' }])
}));
// oxlint-disable-next-line anti-slop/no-module-mocking -- DB-backed settings (zone).
vi.mock('$lib/server/db/actions/userSettings', () => ({
	getUserSettings: vi.fn(async () => ({ timeZone: 'UTC' }))
}));
// oxlint-disable-next-line anti-slop/no-module-mocking -- DB-backed plan reads.
vi.mock('$lib/server/services/subscriptionService', () => ({
	getUserSubscriptionLimits: vi.fn(async () => ({ familyLimit: 3 }))
}));

import { GET as LIST } from './+server';
import { GET as CODES } from './[id]/invite-codes/+server';
import { GET as TASKS } from './[id]/tasks/+server';

function ev(user: { id: string } | null, id = 'fam-mine') {
	// SAFETY: test double — handlers read locals.user and params.
	return { locals: { user }, params: { id } } as never;
}

beforeEach(() => {
	vi.clearAllMocks();
	state.codes = [];
});

describe('GET /api/families (G10a)', () => {
	it('401 without auth', async () => {
		expect((await LIST(ev(null))).status).toBe(401);
	});

	it('every family with role + canInvite, plan usage', async () => {
		const body = await (await LIST(ev({ id: 'u1' }))).json();
		expect(body.families.map((f: { id: string; role: string; canInvite: boolean }) => [f.id, f.role, f.canInvite])).toEqual([
			['fam-old', 'member', false],
			['fam-mine', 'creator', true]
		]);
		expect(body.plan).toEqual({ used: 2, limit: 3 });
		expect(body).toHaveProperty('roster');
		expect(body).toHaveProperty('activeInvites');
	});
});

describe('GET /api/families/{id}/invite-codes (G10c)', () => {
	it('404 for a family you are not in (no fallback to another family)', async () => {
		const res = await CODES(ev({ id: 'u1' }, 'fam-other'));
		expect(res.status).toBe(404);
	});

	it('a plain member: canManageInvites false, no codes', async () => {
		state.codes = [{ code: 'SECRET' }];
		expect(await (await CODES(ev({ id: 'u1' }, 'fam-old'))).json()).toEqual({
			canManageInvites: false,
			codes: []
		});
	});

	it('the creator sees the codes', async () => {
		const expiresAt = '2026-12-01T00:00:00.000Z';
		state.codes = [{ code: 'ABC', useCount: null, maxUses: 1, expiresAt, createdBy: 'u1', familyId: 'fam-mine' }];
		expect(await (await CODES(ev({ id: 'u1' }, 'fam-mine'))).json()).toEqual({
			canManageInvites: true,
			codes: [{ code: 'ABC', useCount: 0, maxUses: 1, expiresAt, createdBy: 'u1' }]
		});
	});
});

describe('GET /api/families/{id}/tasks (G11)', () => {
	it('404 for a family you are not in', async () => {
		expect((await TASKS(ev({ id: 'u1' }, 'fam-other'))).status).toBe(404);
	});

	it("that family's board", async () => {
		const body = await (await TASKS(ev({ id: 'u1' }, 'fam-old'))).json();
		expect(body).toEqual({
			tasks: [{ id: 't-fam-old' }],
			publicTasks: [],
			familyRoster: [{ userId: 'u1', firstName: 'Ann' }],
			taskCategories: [{ id: 'c1', name: 'Home' }]
		});
	});
});
