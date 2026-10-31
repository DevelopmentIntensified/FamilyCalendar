import type { RequestEvent } from '@sveltejs/kit';
import { describe, expect, it } from 'vitest';
import { GET } from './+server';

describe('GET /api/me', () => {
	it('returns the bearer user identity (id + names only)', async () => {
		const res = await GET({
			locals: {
				user: { id: 'user-1', firstName: 'Guest', lastName: null, email: 'secret@example.com' }
			}
		} as unknown as RequestEvent);
		expect(res.status).toBe(200);
		expect(await res.json()).toEqual({ id: 'user-1', firstName: 'Guest', lastName: null });
	});

	it('401s per the universal table when no user', async () => {
		const res = await GET({ locals: { user: null } } as unknown as RequestEvent);
		expect(res.status).toBe(401);
		expect(await res.json()).toEqual({ error: 'Unauthorized' });
	});
});
