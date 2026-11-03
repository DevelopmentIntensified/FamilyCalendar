import { describe, it, expect, vi, beforeEach } from 'vitest';
import { POST } from './+server';
import { clearRateLimitState } from '$lib/server/utils/rateLimit';
import type { ClaimRequestDeps } from '$lib/server/services/claimRequest';

/** POST /api/me/claim (#292 G13), through the /claim page's requestClaimLink. */
function deps(registered = false) {
	return {
		sendEmail: vi.fn(),
		fromEmail: 'noreply@x.com',
		issueClaimToken: vi.fn(async () => 'tok'),
		getUserByEmail: vi.fn(async () => (registered ? { id: 'other' } : undefined)),
		sendClaimLinkEmail: vi.fn(async () => ({ ok: true })),
		baseSiteUrl: 'https://fp.test'
	} as unknown as ClaimRequestDeps & { sendClaimLinkEmail: ReturnType<typeof vi.fn> };
}

const GUEST = { id: 'g1', email: 'g1@anonymous.placeholder.invalid' };

function ev(body: unknown, user: Record<string, string> | null = GUEST, ip = '1.1.1.1') {
	// SAFETY: test double — the handler reads locals.user and request.
	return {
		locals: { user },
		request: new Request('http://x/api/me/claim', {
			method: 'POST',
			headers: { 'x-forwarded-for': ip },
			body: JSON.stringify(body)
		})
	} as never;
}

beforeEach(() => clearRateLimitState());

describe('POST /api/me/claim (G13)', () => {
	it('401 without auth', async () => {
		expect((await POST(ev({ email: 'a@b.co' }, null), deps())).status).toBe(401);
	});

	it('400 for a registered account', async () => {
		const res = await POST(ev({ email: 'a@b.co' }, { id: 'u1', email: 'me@x.com' }), deps());
		expect(res.status).toBe(400);
		expect(await res.json()).toEqual({ error: 'Account already has an email' });
	});

	it('400 for a bad email', async () => {
		const res = await POST(ev({ email: 'nope' }), deps());
		expect(await res.json()).toEqual({ error: 'Please enter a valid email address' });
	});

	it('sends the web claim link; same answer whether or not the address is registered', async () => {
		const d1 = deps(false);
		const d2 = deps(true);
		const r1 = await POST(ev({ email: 'New@B.co' }, GUEST, '2.2.2.2'), d1);
		const r2 = await POST(ev({ email: 'taken@b.co' }, GUEST, '3.3.3.3'), d2);
		expect(await r1.json()).toEqual({ sent: true });
		expect(await r2.json()).toEqual({ sent: true });
		expect(d1.sendClaimLinkEmail).toHaveBeenCalledWith(d1, {
			email: 'new@b.co',
			verifyUrl: 'https://fp.test/claim/verify/tok',
			alreadyRegistered: false
		});
	});

	it('429 after 3 sends to one address from one client', async () => {
		const d = deps();
		for (let i = 0; i < 3; i++) await POST(ev({ email: 'a@b.co' }, GUEST, '9.9.9.9'), d);
		const res = await POST(ev({ email: 'a@b.co' }, GUEST, '9.9.9.9'), d);
		expect(res.status).toBe(429);
	});
});
