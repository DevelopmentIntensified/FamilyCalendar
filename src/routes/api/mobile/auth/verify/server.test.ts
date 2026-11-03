import { describe, it, expect, beforeEach } from 'vitest';
import { POST } from './+server';
import { makeFakes, jsonRequest, eventFor, type TestBody } from '../fakes';
import { clearRateLimitState } from '$lib/server/utils/rateLimit';

let f: ReturnType<typeof makeFakes>;

const loginUser = { id: 'u1', firstName: 'Ann', lastName: 'Lee', email: 'a@b.com' };

beforeEach(() => {
	clearRateLimitState();
	f = makeFakes();
	f.fakes.getHashedCode.mockResolvedValue({ email: 'a@b.com', firstName: 'Ann', lastName: 'Lee' });
	f.fakes.getAccount.mockResolvedValue(undefined);
	f.fakes.getUserByEmail.mockResolvedValue(undefined);
});

const post = (body: TestBody, ip = 'ip-1') =>
	POST(eventFor(jsonRequest('/api/mobile/auth/verify', body, { ip })), f.deps);

describe('POST /api/mobile/auth/verify', () => {
	it('login: valid code → token + user, code consumed, no account created, no Set-Cookie', async () => {
		f.fakes.getAccount.mockResolvedValue({ userId: 'u1' });
		f.fakes.getUser.mockResolvedValue(loginUser);
		const res = await post({
			email: 'a@b.com',
			code: '12345678',
			intent: 'login',
			deviceName: 'Pixel 8'
		});
		expect(res.status).toBe(200);
		expect(await res.json()).toEqual({
			token: 'fp_minted',
			user: { id: 'u1', firstName: 'Ann', lastName: 'Lee', email: 'a@b.com' }
		});
		expect(res.headers.get('set-cookie')).toBeNull();
		expect(f.fakes.getHashedCode).toHaveBeenCalledWith({
			code: '12345678',
			email: 'a@b.com',
			type: 'login'
		});
		expect(f.fakes.deleteHashedCode).toHaveBeenCalledTimes(1);
		expect(f.fakes.createNewUser).not.toHaveBeenCalled();
		expect(f.fakes.createApiToken).toHaveBeenCalledWith('u1', 'Android — Pixel 8');
	});

	it('login falls back to the user row when there is no account row', async () => {
		f.fakes.getUserByEmail.mockResolvedValue(loginUser);
		const res = await post({ email: 'a@b.com', code: '1', intent: 'login', deviceName: 'X' });
		expect(res.status).toBe(200);
	});

	it('signup: valid code → creates the account from the code row names, mints a token', async () => {
		f.fakes.createNewUser.mockResolvedValue({
			id: 'new1',
			firstName: 'Ann',
			lastName: 'Lee',
			email: 'a@b.com'
		});
		const res = await post({
			email: 'a@b.com',
			code: '12345678',
			intent: 'signup',
			deviceName: ''
		});
		expect(res.status).toBe(200);
		expect(f.fakes.getHashedCode).toHaveBeenCalledWith({
			code: '12345678',
			email: 'a@b.com',
			type: 'signup'
		});
		expect(f.fakes.createNewUser).toHaveBeenCalledWith('Ann', 'Lee', 'a@b.com');
		expect(f.fakes.createApiToken).toHaveBeenCalledWith('new1', 'Android — Android');
		expect((await res.json()).user.id).toBe('new1');
	});

	it('signup for an email that got registered meanwhile → 409, nothing created', async () => {
		f.fakes.getAccount.mockResolvedValue({ userId: 'u1' });
		const res = await post({ email: 'a@b.com', code: '1', intent: 'signup', deviceName: 'X' });
		expect(res.status).toBe(409);
		expect(f.fakes.createNewUser).not.toHaveBeenCalled();
		expect(f.fakes.createApiToken).not.toHaveBeenCalled();
	});

	it('wrong / expired / other-kind code → 400 "That code is wrong or expired"', async () => {
		f.fakes.getHashedCode.mockResolvedValue(undefined);
		const res = await post({
			email: 'a@b.com',
			code: '00000000',
			intent: 'login',
			deviceName: 'X'
		});
		expect(res.status).toBe(400);
		expect(await res.json()).toEqual({ error: 'That code is wrong or expired' });
		expect(f.fakes.createApiToken).not.toHaveBeenCalled();
		expect(f.fakes.deleteDeadCodes).toHaveBeenCalled();
	});

	it('validation: missing code / bad email / bad intent → 400, no lookup', async () => {
		expect((await post({ email: 'a@b.com', intent: 'login' })).status).toBe(400);
		const bad = await post({ email: 'x', code: '1', intent: 'login' });
		expect(bad.status).toBe(400);
		expect(await bad.json()).toEqual({ error: 'Enter a valid email' });
		expect((await post({ email: 'a@b.com', code: '1', intent: 'other' })).status).toBe(400);
		expect(f.fakes.getHashedCode).not.toHaveBeenCalled();
	});

	it('rate-limits per IP + email at the web limit (10 / 15 min) → 429 before any lookup', async () => {
		f.fakes.getHashedCode.mockResolvedValue(undefined);
		for (let i = 0; i < 10; i++) {
			const res = await post({ email: 'a@b.com', code: `${i}`, intent: 'login' }, 'ip-rl');
			expect(res.status).toBe(400);
		}
		f.fakes.getHashedCode.mockClear();
		const res = await post({ email: 'a@b.com', code: 'x', intent: 'login' }, 'ip-rl');
		expect(res.status).toBe(429);
		expect(await res.json()).toEqual({ error: 'Too many attempts — try again in a few minutes' });
		expect(f.fakes.getHashedCode).not.toHaveBeenCalled();
	});

	it('limits deviceName to 60 chars in the token name', async () => {
		f.fakes.getUserByEmail.mockResolvedValue(loginUser);
		await post({
			email: 'a@b.com',
			code: '1',
			intent: 'login',
			deviceName: `  ${'d'.repeat(80)}  `
		});
		expect(f.fakes.createApiToken).toHaveBeenCalledWith('u1', `Android — ${'d'.repeat(60)}`);
	});
});
