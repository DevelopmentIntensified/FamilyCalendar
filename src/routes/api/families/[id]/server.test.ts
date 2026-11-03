import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * /api/families/{id}/** (#292 G10b): the family detail page's data and its
 * five admin actions, run through the SAME familyData service as the page
 * (role checks stay real). The DB seam is a queue: each SELECT shifts the
 * next scripted row set (role lookups, the family row).
 */
const state = vi.hoisted(() => ({
	queue: [] as unknown[][],
	updates: [] as unknown[]
}));

// oxlint-disable-next-line anti-slop/no-module-mocking -- scripted drizzle queue; the permission rules under test stay real.
vi.mock('$lib/server/db', () => {
	const chain = () => {
		const rows = () => state.queue.shift() ?? [];
		const n = {
			from: () => n,
			where: () => {
				const r = rows();
				return Object.assign(Promise.resolve(r), { limit: () => Promise.resolve(r) });
			}
		};
		return n;
	};
	return {
		db: {
			select: () => chain(),
			update: () => ({
				set: (patch: unknown) => ({
					where: async () => {
						state.updates.push(patch);
					}
				})
			})
		}
	};
});
// oxlint-disable-next-line anti-slop/no-module-mocking -- DB-backed family reads/writes.
vi.mock('$lib/server/db/actions/families', () => ({
	getFamily: vi.fn(async () => ({ id: 'fam-1', name: 'Riveras', color: '#00ff00' })),
	getFamilyRoster: vi.fn(async () => [{ userId: 'u-admin', firstName: 'Ann' }]),
	getFamilyInviteCodes: vi.fn(async () => []),
	getUserFamilyMemberships: vi.fn(async () => [{}]),
	removeFamilyMember: vi.fn(),
	updateFamilies: vi.fn()
}));
// oxlint-disable-next-line anti-slop/no-module-mocking -- DB-backed switches.
vi.mock('$lib/server/db/actions/dashboardModules', () => ({
	getFamilyModuleSwitches: vi.fn(async () => ({ board: true })),
	setFamilyModuleSwitch: vi.fn()
}));
// oxlint-disable-next-line anti-slop/no-module-mocking -- DB-backed activity feed.
vi.mock('$lib/server/db/actions/familyActivity', () => ({
	getRecentFamilyActivity: vi.fn(async () => [])
}));
// oxlint-disable-next-line anti-slop/no-module-mocking -- DB-backed settings.
vi.mock('$lib/server/db/actions/userSettings', () => ({
	getUserSettings: vi.fn(async () => ({ hiddenDashboardModules: ['verse'] }))
}));
// oxlint-disable-next-line anti-slop/no-module-mocking -- DB-backed plan reads.
vi.mock('$lib/server/services/subscriptionService', () => ({
	getUserSubscriptionLimits: vi.fn(async () => ({ familyLimit: 1, memberLimit: 6 })),
	getSubscriptionStatus: vi.fn(async () => ({ tier: null, subscription: null })),
	getAiUsageThisMonth: vi.fn(async () => ({ used: 0, limit: 5, remaining: 5 }))
}));

import { GET, PATCH } from './+server';
import { PATCH as PATCH_MEMBER, DELETE as DELETE_MEMBER } from './members/[userId]/+server';
import { PUT as PUT_MODULE } from './modules/[module]/+server';
import { removeFamilyMember, updateFamilies } from '$lib/server/db/actions/families';
import { setFamilyModuleSwitch } from '$lib/server/db/actions/dashboardModules';

const ADMIN = { id: 'u-admin' };
const role = (r: string | null) => (r ? [{ role: r }] : []);

function ev(
	user: { id: string } | null,
	params: Record<string, string>,
	body?: unknown,
	method = 'PATCH'
) {
	// SAFETY: test double — handlers read locals.user, params, request.
	return {
		locals: { user },
		params: { id: 'fam-1', ...params },
		request: new Request('http://x/api', {
			method,
			body: body === undefined ? undefined : JSON.stringify(body)
		})
	} as never;
}

beforeEach(() => {
	vi.clearAllMocks();
	state.queue = [];
	state.updates = [];
});

describe('GET /api/families/{id}', () => {
	it('401 without auth', async () => {
		expect((await GET(ev(null, {}))).status).toBe(401);
	});

	it('404 for a non-member (same answer as a missing family)', async () => {
		state.queue = [role(null)];
		const res = await GET(ev({ id: 'u-out' }, {}));
		expect(res.status).toBe(404);
		expect(await res.json()).toEqual({ error: 'Family not found' });
	});

	it('the detail page data for a member', async () => {
		state.queue = [role('member'), [{ id: 'fam-1', name: 'Riveras' }]];
		const body = await (await GET(ev({ id: 'u-m' }, {}))).json();
		expect(Object.keys(body).sort()).toEqual(
			[
				'family',
				'members',
				'currentUserRole',
				'currentUserId',
				'activity',
				'moduleSwitches',
				'hiddenDashboardModules',
				'activeInvite',
				'inviteCreatedBy',
				'planUsage'
			].sort()
		);
		expect(body.currentUserRole).toBe('member');
		expect(body.hiddenDashboardModules).toEqual(['verse']);
	});
});

describe('PATCH /api/families/{id}', () => {
	it('403 for a plain member, nothing written', async () => {
		state.queue = [role('member')];
		const res = await PATCH(ev({ id: 'u-m' }, {}, { name: 'X' }));
		expect(res.status).toBe(403);
		expect(await res.json()).toEqual({
			error: 'You do not have permission to perform this action'
		});
		expect(updateFamilies).not.toHaveBeenCalled();
	});

	it('403 for a non-member', async () => {
		state.queue = [role(null)];
		expect((await PATCH(ev({ id: 'u-out' }, {}, { name: 'X' }))).status).toBe(403);
	});

	it('400 for a bad colour', async () => {
		expect((await PATCH(ev(ADMIN, {}, { color: 'green' }))).status).toBe(400);
	});

	it('admin renames → success + family', async () => {
		state.queue = [role('admin')];
		const res = await PATCH(ev(ADMIN, {}, { name: ' Riveras ' }));
		expect(res.status).toBe(200);
		expect(updateFamilies).toHaveBeenCalledWith('fam-1', { name: 'Riveras' });
		expect((await res.json()).success).toBe(true);
	});
});

describe('PATCH/DELETE /api/families/{id}/members/{userId}', () => {
	it('400 with neither field', async () => {
		expect((await PATCH_MEMBER(ev(ADMIN, { userId: 'u2' }, {}))).status).toBe(400);
	});

	it('role: same validation message as the page', async () => {
		const res = await PATCH_MEMBER(ev(ADMIN, { userId: 'u2' }, { role: 'owner' }));
		expect(res.status).toBe(400);
		expect(await res.json()).toEqual({ error: 'Role must be creator, admin, or member' });
	});

	it("role: the creator's role is untouchable", async () => {
		// actor role, then target role
		state.queue = [role('admin'), role('creator')];
		const res = await PATCH_MEMBER(ev(ADMIN, { userId: 'u-c' }, { role: 'member' }));
		expect(res.status).toBe(403);
		expect(await res.json()).toEqual({ error: "Cannot change the family creator's role" });
	});

	it('role + memberType by an admin', async () => {
		// updateRole: actor, target; setMemberType: actor, target
		state.queue = [role('admin'), role('member'), role('admin'), role('admin')];
		const res = await PATCH_MEMBER(
			ev(ADMIN, { userId: 'u2' }, { role: 'admin', memberType: 'parent' })
		);
		expect(res.status).toBe(200);
		expect(state.updates).toEqual([{ role: 'admin' }, { memberType: 'parent' }]);
	});

	it('DELETE: 403 "Cannot remove the family creator"', async () => {
		state.queue = [role('creator')];
		const res = await DELETE_MEMBER(ev(ADMIN, { userId: 'u-c' }, undefined, 'DELETE'));
		expect(res.status).toBe(403);
		expect(await res.json()).toEqual({ error: 'Cannot remove the family creator' });
		expect(removeFamilyMember).not.toHaveBeenCalled();
	});

	it('DELETE: a member cannot remove anyone', async () => {
		state.queue = [role('member'), role('member')];
		expect((await DELETE_MEMBER(ev({ id: 'u-m' }, { userId: 'u2' }, undefined, 'DELETE'))).status).toBe(403);
	});

	it('DELETE: admin removes a member', async () => {
		state.queue = [role('member'), role('admin')];
		const res = await DELETE_MEMBER(ev(ADMIN, { userId: 'u2' }, undefined, 'DELETE'));
		expect(res.status).toBe(200);
		expect(removeFamilyMember).toHaveBeenCalledWith('fam-1', 'u2');
	});
});

describe('PUT /api/families/{id}/modules/{module}', () => {
	it('400 without a boolean', async () => {
		expect((await PUT_MODULE(ev(ADMIN, { module: 'board' }, { enabled: 'no' }, 'PUT'))).status).toBe(400);
	});

	it('403 for a member', async () => {
		state.queue = [role('member')];
		expect((await PUT_MODULE(ev({ id: 'u-m' }, { module: 'board' }, { enabled: false }, 'PUT'))).status).toBe(403);
		expect(setFamilyModuleSwitch).not.toHaveBeenCalled();
	});

	it('admin flips the switch', async () => {
		state.queue = [role('admin')];
		const res = await PUT_MODULE(ev(ADMIN, { module: 'board' }, { enabled: false }, 'PUT'));
		expect(res.status).toBe(200);
		expect(setFamilyModuleSwitch).toHaveBeenCalledWith('fam-1', 'board', false);
	});
});
