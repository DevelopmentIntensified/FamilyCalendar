import { describe, it, expect, beforeEach } from 'vitest';
import { POST } from './+server';
import { makeFakes, jsonRequest, eventFor } from '../fakes';

let f: ReturnType<typeof makeFakes>;

beforeEach(() => {
	f = makeFakes();
});

describe('POST /api/mobile/auth/logout', () => {
	it('revokes exactly the presented token, scoped to its owner; no Set-Cookie', async () => {
		const req = jsonRequest('/api/mobile/auth/logout', undefined, {
			auth: 'Bearer fp_this_device'
		});
		const res = await POST(eventFor(req, { id: 'u1' }), f.deps);
		expect(res.status).toBe(200);
		expect(await res.json()).toEqual({ success: true });
		expect(res.headers.get('set-cookie')).toBeNull();
		expect(f.fakes.revokeTokenByPlaintext).toHaveBeenCalledTimes(1);
		expect(f.fakes.revokeTokenByPlaintext).toHaveBeenCalledWith('u1', 'fp_this_device');
	});

	it('no Bearer (e.g. a cookie session) → 401, nothing revoked', async () => {
		const req = jsonRequest('/api/mobile/auth/logout', undefined);
		const res = await POST(eventFor(req, { id: 'u1' }), f.deps);
		expect(res.status).toBe(401);
		expect(f.fakes.revokeTokenByPlaintext).not.toHaveBeenCalled();
	});

	it('unauthenticated → 401', async () => {
		const req = jsonRequest('/api/mobile/auth/logout', undefined, { auth: 'Bearer fp_x' });
		expect((await POST(eventFor(req, null), f.deps)).status).toBe(401);
		expect(f.fakes.revokeTokenByPlaintext).not.toHaveBeenCalled();
	});
});
