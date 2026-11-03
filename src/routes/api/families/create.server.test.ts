import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * POST /api/families (#292 G10d): the /family/create action as JSON, via
 * the same createFamilyWithMembers (plan gate, palette, verified picks,
 * member limit, one transaction).
 */
type Row = Record<string, unknown>;
const state = vi.hoisted(() => ({
	inserts: [] as Row[],
	users: [] as Row[],
	allowed: true,
	memberLimit: 5
}));

// oxlint-disable-next-line anti-slop/no-module-mocking -- scripted insert/select/transaction stub, as in create/members.test.ts.
vi.mock('$lib/server/db', () => {
	const db = {
		insert: () => ({
			values: (row: Row | Row[]) => {
				state.inserts.push(...(Array.isArray(row) ? row : [row]));
				return Promise.resolve();
			}
		}),
		select: () => ({ from: () => ({ where: () => Promise.resolve(state.users) }) }),
		transaction: async (run: (tx: unknown) => Promise<void>) => run(db)
	};
	return { db };
});
// oxlint-disable-next-line anti-slop/no-module-mocking -- plan checks have their own tests.
vi.mock('$lib/server/services/subscriptionService', () => ({
	canCreateFamily: async () =>
		state.allowed
			? { allowed: true, limit: 2, used: 0 }
			: { allowed: false, limit: 1, used: 1, reason: 'Your plan allows 1 family.' },
	getUserSubscriptionLimits: async () => ({ memberLimit: state.memberLimit })
}));
// oxlint-disable-next-line anti-slop/no-module-mocking -- DB-backed read-back of the new row.
vi.mock('$lib/server/db/actions/families', () => ({
	getFamily: vi.fn(async (id: string) => ({ id, name: 'Riveras', color: '#3b82f6' }))
}));

import { POST } from './+server';
import { DEFAULT_FAMILY_COLOR } from '$lib/utils/familyPalette';

function ev(body: unknown, user: { id: string } | null = { id: 'u1' }) {
	// SAFETY: test double — the handler reads locals.user and request.
	return {
		locals: { user },
		request: new Request('http://x/api/families', { method: 'POST', body: JSON.stringify(body) })
	} as never;
}

beforeEach(() => {
	state.inserts = [];
	state.users = [];
	state.allowed = true;
	state.memberLimit = 5;
});

describe('POST /api/families (G10d)', () => {
	it('401 without auth', async () => {
		expect((await POST(ev({ name: 'X' }, null))).status).toBe(401);
	});

	it('403 at the plan limit, with the canCreateFamily reason, nothing written', async () => {
		state.allowed = false;
		const res = await POST(ev({ name: 'Riveras' }));
		expect(res.status).toBe(403);
		expect(await res.json()).toEqual({ error: 'Your plan allows 1 family.', upgradeRequired: true });
		expect(state.inserts).toEqual([]);
	});

	it.each([
		[{ name: '' }, 'Family name is required'],
		[{ name: 'x'.repeat(51) }, 'Family name must be 50 characters or less'],
		[{ name: 'Riveras', color: '#000001' }, 'Pick one of the offered family colours']
	])('400 %j', async (body, error) => {
		const res = await POST(ev(body));
		expect(res.status).toBe(400);
		expect(await res.json()).toEqual({ error });
	});

	it('400 when memberIds is not an array', async () => {
		expect((await POST(ev({ name: 'R', memberIds: 'u2' }))).status).toBe(400);
	});

	it('400 for an unverified pick', async () => {
		state.users = [{ id: 'u2', emailVerified: false }];
		const res = await POST(ev({ name: 'R', memberIds: ['u2'] }));
		expect(res.status).toBe(400);
	});

	it('201 with the family; creator + picks + calendar written', async () => {
		state.users = [{ id: 'u2', emailVerified: true }];
		const res = await POST(ev({ name: ' Riveras ', memberIds: ['u2', 'u1', 'u2'] }));
		expect(res.status).toBe(201);
		const body = await res.json();
		expect(body.family.name).toBe('Riveras');
		const fam = state.inserts.find((r) => 'name' in r)!;
		expect(fam).toMatchObject({ name: 'Riveras', color: DEFAULT_FAMILY_COLOR });
		expect(state.inserts.filter((r) => 'role' in r).map((r) => [r.userId, r.role])).toEqual([
			['u1', 'creator'],
			['u2', 'member']
		]);
	});
});
