import { describe, it, expect, beforeEach } from 'vitest';
import { POST } from './+server';
import { makeFakes, jsonRequest, eventFor, type TestBody } from '../fakes';
import { clearRateLimitState } from '$lib/server/utils/rateLimit';

let f: ReturnType<typeof makeFakes>;

const user = {
	id: 'u1',
	firstName: 'Ann',
	lastName: 'Lee',
	email: 'a@b.com',
	passwordHash: 'h'
};

beforeEach(() => {
	clearRateLimitState();
	f = makeFakes();
	f.fakes.getUserByEmail.mockResolvedValue(user);
	f.fakes.verifyPassword.mockImplementation(async (pw: string) => pw === 'right');
	f.fakes.getUserSettings.mockResolvedValue({ userId: 'u1' });
});

const post = (body: TestBody, ip = 'ip-1') =>
	POST(eventFor(jsonRequest('/api/mobile/auth/password', body, { ip })), f.deps);

describe('POST /api/mobile/auth/password', () => {
	it('right password → token + user (hash never leaked), no Set-Cookie, no account created', async () => {
		const res = await post({ email: 'a@b.com', password: 'right', deviceName: 'Pixel' });
		expect(res.status).toBe(200);
		expect(await res.json()).toEqual({
			token: 'fp_minted',
			user: { id: 'u1', firstName: 'Ann', lastName: 'Lee', email: 'a@b.com' }
		});
		expect(res.headers.get('set-cookie')).toBeNull();
		expect(f.fakes.createApiToken).toHaveBeenCalledWith('u1', 'Android — Pixel');
		expect(f.fakes.createNewUser).not.toHaveBeenCalled();
	});

	it('creates the settings row on first login (as the web does)', async () => {
		f.fakes.getUserSettings.mockResolvedValue(undefined);
		await post({ email: 'a@b.com', password: 'right' });
		expect(f.fakes.createUserSettings).toHaveBeenCalledWith({ userId: 'u1', timeZone: 'UTC' });
	});

	it.each([
		['wrong password', () => {}],
		['unknown email', () => f.fakes.getUserByEmail.mockResolvedValue(undefined)],
		[
			'code-only account',
			() => f.fakes.getUserByEmail.mockResolvedValue({ ...user, passwordHash: null })
		]
	])('%s → identical 401', async (_label, arrange) => {
		arrange();
		const res = await post({ email: 'a@b.com', password: 'wrong' });
		expect(res.status).toBe(401);
		expect(await res.json()).toEqual({ error: 'Email or password is incorrect' });
		expect(f.fakes.createApiToken).not.toHaveBeenCalled();
		// Timing parity: exactly one bcrypt compare on every path.
		expect(f.fakes.verifyPassword).toHaveBeenCalledTimes(1);
	});

	it('missing fields → 400', async () => {
		expect((await post({ email: 'a@b.com' })).status).toBe(400);
		expect((await post({ password: 'x' })).status).toBe(400);
	});

	it('rate-limits per IP + email at the web limit (10 / 5 min) → 429', async () => {
		for (let i = 0; i < 10; i++) {
			expect((await post({ email: 'a@b.com', password: 'wrong' }, 'ip-rl')).status).toBe(401);
		}
		const res = await post({ email: 'a@b.com', password: 'right' }, 'ip-rl');
		expect(res.status).toBe(429);
		expect(await res.json()).toEqual({ error: 'Too many attempts — try again in a few minutes' });
	});
});
