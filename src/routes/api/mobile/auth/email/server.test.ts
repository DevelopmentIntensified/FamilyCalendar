import { describe, it, expect, beforeEach } from 'vitest';
import { POST } from './+server';
import { makeFakes, jsonRequest, eventFor, type TestBody } from '../fakes';
import { clearRateLimitState } from '$lib/server/utils/rateLimit';

let f: ReturnType<typeof makeFakes>;

beforeEach(() => {
	clearRateLimitState();
	f = makeFakes();
	f.fakes.magicLink.sendEmail.mockResolvedValue({ success: true, data: { id: 'em1' } });
	f.fakes.magicLink.getAccount.mockResolvedValue(undefined);
	f.fakes.magicLink.getUserByEmail.mockResolvedValue(undefined);
});

const post = (body: TestBody, ip = 'ip-1', raw?: string) =>
	POST(eventFor(jsonRequest('/api/mobile/auth/email', body, { ip, raw })), f.deps);

describe('POST /api/mobile/auth/email', () => {
	it('login: known email → sends the web code email, 200 {sent:true}, no Set-Cookie', async () => {
		f.fakes.magicLink.getUserByEmail.mockResolvedValue({ id: 'u1', firstName: 'A', lastName: 'B' });
		const res = await post({ email: 'a@b.com', intent: 'login' });
		expect(res.status).toBe(200);
		expect(await res.json()).toEqual({ sent: true });
		expect(res.headers.get('set-cookie')).toBeNull();
		expect(f.fakes.magicLink.sendEmail).toHaveBeenCalledTimes(1);
		expect(f.fakes.magicLink.createCode).toHaveBeenCalledWith(
			expect.objectContaining({ email: 'a@b.com', type: 'login' })
		);
	});

	it('login: unknown email → identical 200 {sent:true}, nothing sent (no enumeration)', async () => {
		const res = await post({ email: 'nobody@b.com', intent: 'login' });
		expect(res.status).toBe(200);
		expect(await res.json()).toEqual({ sent: true });
		expect(f.fakes.magicLink.sendEmail).not.toHaveBeenCalled();
	});

	it('signup: new email + names → code stored with names, 200 {sent:true}', async () => {
		const res = await post({ email: 'new@b.com', intent: 'signup', firstName: 'N', lastName: 'W' });
		expect(res.status).toBe(200);
		expect(await res.json()).toEqual({ sent: true });
		expect(f.fakes.magicLink.createCode).toHaveBeenCalledWith(
			expect.objectContaining({ email: 'new@b.com', type: 'signup', firstName: 'N', lastName: 'W' })
		);
	});

	it('signup: already-registered email → identical 200 {sent:true}, nothing sent', async () => {
		f.fakes.magicLink.getAccount.mockResolvedValue({ userId: 'u1' });
		const res = await post({ email: 'a@b.com', intent: 'signup', firstName: 'N', lastName: 'W' });
		expect(await res.json()).toEqual({ sent: true });
		expect(f.fakes.magicLink.sendEmail).not.toHaveBeenCalled();
	});

	it('signup without names → 400', async () => {
		const res = await post({ email: 'new@b.com', intent: 'signup' });
		expect(res.status).toBe(400);
		expect(await res.json()).toEqual({ error: 'First and last name are required' });
	});

	it.each([
		[{ email: 'not-an-email', intent: 'login' }],
		[{ intent: 'login' }],
		[{ email: 42, intent: 'login' }]
	])('malformed email %j → 400 "Enter a valid email"', async (body) => {
		const res = await post(body);
		expect(res.status).toBe(400);
		expect(await res.json()).toEqual({ error: 'Enter a valid email' });
	});

	it('bad intent → 400; non-JSON body → 400', async () => {
		expect((await post({ email: 'a@b.com', intent: 'nope' })).status).toBe(400);
		const res = await post(undefined, 'ip-1', 'not json');
		expect(res.status).toBe(400);
	});

	it('rate-limits per IP + email at the web limit (5 / 15 min) → 429', async () => {
		for (let i = 0; i < 5; i++) {
			expect((await post({ email: 'a@b.com', intent: 'login' }, 'ip-rl')).status).toBe(200);
		}
		const res = await post({ email: 'a@b.com', intent: 'login' }, 'ip-rl');
		expect(res.status).toBe(429);
		expect(await res.json()).toEqual({ error: 'Too many attempts — try again in a few minutes' });
		// A different email from the same IP has its own bucket.
		expect((await post({ email: 'c@b.com', intent: 'login' }, 'ip-rl')).status).toBe(200);
	});

	it('send failure → 500 JSON', async () => {
		f.fakes.magicLink.getUserByEmail.mockResolvedValue({ id: 'u1' });
		f.fakes.magicLink.sendEmail.mockResolvedValue({ success: false });
		const res = await post({ email: 'a@b.com', intent: 'login' });
		expect(res.status).toBe(500);
	});
});
