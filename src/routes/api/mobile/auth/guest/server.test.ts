import { describe, it, expect, beforeEach } from 'vitest';
import { POST } from './+server';
import { makeFakes, jsonRequest, eventFor, type TestBody } from '../fakes';
import { clearRateLimitState } from '$lib/server/utils/rateLimit';

let f: ReturnType<typeof makeFakes>;

beforeEach(() => {
	clearRateLimitState();
	f = makeFakes();
	f.fakes.createAnonymousUser.mockResolvedValue({
		id: 'g1',
		firstName: 'Guest',
		lastName: '',
		email: 'g1@anonymous.placeholder.invalid'
	});
});

const post = (body: TestBody, ip = 'ip-1', raw?: string) =>
	POST(eventFor(jsonRequest('/api/mobile/auth/guest', body, { ip, raw })), f.deps);

describe('POST /api/mobile/auth/guest', () => {
	it('creates an Anonymous Account + token; placeholder email hidden; no Set-Cookie', async () => {
		const res = await post({ deviceName: 'Pixel' });
		expect(res.status).toBe(200);
		expect(await res.json()).toEqual({
			token: 'fp_minted',
			user: { id: 'g1', firstName: 'Guest', lastName: '', email: null }
		});
		expect(res.headers.get('set-cookie')).toBeNull();
		expect(f.fakes.createAnonymousUser).toHaveBeenCalledTimes(1);
		expect(f.fakes.createApiToken).toHaveBeenCalledWith('g1', 'Android — Pixel');
	});

	it('accepts an empty body (deviceName defaults to "Android")', async () => {
		const res = await post(undefined);
		expect(res.status).toBe(200);
		expect(f.fakes.createApiToken).toHaveBeenCalledWith('g1', 'Android — Android');
	});

	it('malformed JSON → 400, no account created', async () => {
		expect((await post(undefined, 'ip-1', '{oops')).status).toBe(400);
		expect(f.fakes.createAnonymousUser).not.toHaveBeenCalled();
	});

	it('rate-limits guest creation per IP (10 / hour) → 429', async () => {
		for (let i = 0; i < 10; i++) expect((await post({}, 'ip-rl')).status).toBe(200);
		const res = await post({}, 'ip-rl');
		expect(res.status).toBe(429);
		expect(f.fakes.createAnonymousUser).toHaveBeenCalledTimes(10);
	});
});
