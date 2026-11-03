import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * #292 G10e: the /api twins of the web's members/add/* handlers ARE those
 * handlers — the twin only renames the path param. Pinned here: auth, the
 * family id reaching the handler's own role check, and a happy direct add.
 */
const state = vi.hoisted(() => ({ rows: [] as unknown[][], inserts: [] as unknown[] }));

// oxlint-disable-next-line anti-slop/no-module-mocking -- scripted drizzle queue; the handlers' checks stay real.
vi.mock('$lib/server/db', () => {
	const chain = () => {
		const n = {
			from: () => n,
			where: () => {
				const r = state.rows.shift() ?? [];
				return Object.assign(Promise.resolve(r), { limit: () => Promise.resolve(r) });
			}
		};
		return n;
	};
	return {
		db: {
			select: () => chain(),
			insert: () => ({
				values: async (v: unknown) => {
					state.inserts.push(v);
				}
			})
		}
	};
});
// oxlint-disable-next-line anti-slop/no-module-mocking -- DB-backed role read, scripted per family id.
vi.mock('$lib/server/db/actions/families', () => ({
	getFamilyMemberRole: vi.fn(async (_u: string, familyId: string) =>
		familyId === 'fam-1' ? 'admin' : null
	),
	generateInviteCode: vi.fn(),
	DEFAULT_INVITE_MAX_USES: 10
}));
// oxlint-disable-next-line anti-slop/no-module-mocking -- notification write is a side channel.
vi.mock('$lib/server/db/actions/notifications', () => ({ createNotification: vi.fn() }));
// oxlint-disable-next-line anti-slop/no-module-mocking -- plan checks have their own tests.
vi.mock('$lib/server/services/subscriptionService', () => ({
	canAddFamilyMember: vi.fn(async () => ({ allowed: true }))
}));

import { POST as DIRECT } from './direct/+server';
import { POST as CHILD } from './child/+server';
import { POST as EMAIL } from './email/+server';
import { POST as LINK } from './email/link/+server';
import { getFamilyMemberRole } from '$lib/server/db/actions/families';
import { clearRateLimitState } from '$lib/server/utils/rateLimit';

function ev(id: string, body: unknown, user: Record<string, string> | null = { id: 'u-admin', firstName: 'Ann', lastName: 'Lee' }) {
	// SAFETY: test double — the handlers read request, locals and params.
	return {
		locals: { user },
		params: { id },
		request: new Request('http://x/api', {
			method: 'POST',
			headers: { 'x-forwarded-for': '1.1.1.1' },
			body: JSON.stringify(body)
		})
	} as never;
}

beforeEach(() => {
	vi.clearAllMocks();
	clearRateLimitState();
	state.rows = [];
	state.inserts = [];
});

describe('/api/families/{id}/members/* (G10e)', () => {
	it.each([
		['direct', DIRECT],
		['child', CHILD],
		['email', EMAIL],
		['email/link', LINK]
	])('%s: 401 without auth', async (_n, handler) => {
		expect((await handler(ev('fam-1', {}, null))).status).toBe(401);
	});

	it('direct: 403 for a family you are not in — the path id reaches the role check', async () => {
		const res = await DIRECT(ev('fam-other', { userId: 'u2' }));
		expect(res.status).toBe(403);
		expect(await res.json()).toEqual({ error: 'You are not a member of this family' });
		expect(getFamilyMemberRole).toHaveBeenCalledWith('u-admin', 'fam-other');
	});

	it('child: 403 for a family you are not in', async () => {
		expect((await CHILD(ev('fam-other', {}))).status).toBe(403);
	});

	it('email + email/link: 403 when not a member', async () => {
		expect((await EMAIL(ev('fam-other', {}))).status).toBe(403);
		expect((await LINK(ev('fam-other', {}))).status).toBe(403);
	});

	it('direct: an admin adds an existing user', async () => {
		// user lookup → found; membership lookup → none
		state.rows = [[{ id: 'u2' }], []];
		const res = await DIRECT(ev('fam-1', { userId: 'u2' }));
		expect(res.status).toBe(200);
		expect(await res.json()).toEqual({ success: true });
		expect(state.inserts).toEqual([{ userId: 'u2', familyId: 'fam-1' }]);
	});
});
