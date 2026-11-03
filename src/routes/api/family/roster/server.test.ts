import { describe, it, expect, vi, beforeEach } from 'vitest';

/** GET /api/family/roster (#292 G4): your family by default; 403 for others'. */
// oxlint-disable-next-line anti-slop/no-module-mocking -- DB-backed membership reads.
vi.mock('$lib/server/db/actions/families', () => ({
	getUserFamilyId: vi.fn(async () => 'fam-1'),
	getFamilyMemberRole: vi.fn(async (_u: string, f: string) => (f === 'fam-1' ? 'member' : null)),
	getFamilyRoster: vi.fn(async () => [
		{
			userId: 'u1',
			firstName: 'Ann',
			lastName: 'Lee',
			email: 'a@x.com',
			role: 'creator',
			memberType: 'parent'
		}
	])
}));

import { GET } from './+server';
import { getUserFamilyId, getFamilyRoster } from '$lib/server/db/actions/families';

function ev(user: { id: string } | null, qs = '') {
	// SAFETY: test double — the handler reads locals.user and url only.
	return { locals: { user }, url: new URL(`http://localhost/api/family/roster${qs}`) } as never;
}

beforeEach(() => vi.clearAllMocks());

describe('GET /api/family/roster (G4)', () => {
	it('401 without auth', async () => {
		expect((await GET(ev(null))).status).toBe(401);
	});

	it('defaults to your family', async () => {
		const body = await (await GET(ev({ id: 'u1' }))).json();
		expect(body.familyId).toBe('fam-1');
		expect(body.members[0]).toEqual({
			userId: 'u1',
			firstName: 'Ann',
			lastName: 'Lee',
			email: 'a@x.com',
			role: 'creator',
			memberType: 'parent'
		});
	});

	it("403 for a family you are not in, roster never read", async () => {
		const res = await GET(ev({ id: 'u1' }, '?familyId=fam-other'));
		expect(res.status).toBe(403);
		expect(await res.json()).toEqual({ error: 'Not a member of this family' });
		expect(getFamilyRoster).not.toHaveBeenCalled();
	});

	it('no family → empty roster', async () => {
		vi.mocked(getUserFamilyId).mockResolvedValueOnce(null);
		expect(await (await GET(ev({ id: 'u1' }))).json()).toEqual({ familyId: null, members: [] });
	});
});
