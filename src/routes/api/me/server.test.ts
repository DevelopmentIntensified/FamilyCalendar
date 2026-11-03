import { describe, expect, it, vi } from 'vitest';

// oxlint-disable-next-line anti-slop/no-module-mocking -- scripted seam; the real module reads familyMembers from the DB.
vi.mock('$lib/server/db/actions/families', () => ({
	getUserFamilyId: vi.fn(async (id: string) => (id === 'user-1' ? 'fam-1' : null))
}));

import { GET } from './+server';

const lastActiveAt = new Date('2026-11-01T10:00:00.000Z');

describe('GET /api/me', () => {
	it('returns the bearer user identity + shell flags (G1, #292)', async () => {
		const res = await GET({
			locals: {
				user: {
					id: 'user-1',
					firstName: 'Ann',
					lastName: 'Lee',
					email: 'ann@example.com',
					emailVerified: true,
					roles: ['admin'],
					lastActiveAt,
					passwordHash: 'secret-hash'
				}
			}
		} as never);
		expect(res.status).toBe(200);
		expect(await res.json()).toEqual({
			id: 'user-1',
			firstName: 'Ann',
			lastName: 'Lee',
			email: 'ann@example.com',
			emailVerified: true,
			isAnonymous: false,
			roles: ['admin'],
			lastActiveAt: lastActiveAt.toISOString(),
			familyId: 'fam-1'
		});
	});

	it('anonymous guests get email null + isAnonymous true, no family', async () => {
		const res = await GET({
			locals: {
				user: {
					id: 'guest-1',
					firstName: 'Guest',
					lastName: null,
					email: 'g-123@anonymous.placeholder.invalid',
					emailVerified: false,
					roles: [],
					lastActiveAt
				}
			}
		} as never);
		const body = await res.json();
		expect(body.email).toBeNull();
		expect(body.isAnonymous).toBe(true);
		expect(body.emailVerified).toBe(false);
		expect(body.familyId).toBeNull();
		expect(body).not.toHaveProperty('passwordHash');
	});

	it('401s per the universal table when no user', async () => {
		const res = await GET({ locals: { user: null } } as never);
		expect(res.status).toBe(401);
		expect(await res.json()).toEqual({ error: 'Unauthorized' });
	});
});
