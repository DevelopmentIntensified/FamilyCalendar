import { describe, it, expect, vi, beforeEach } from 'vitest';
import { parseJWT, createJWT as realCreateJwt } from 'oslo/jwt';
import { clearRateLimitState } from '$lib/server/utils/rateLimit';
import { DEFAULT_INVITE_MAX_USES } from '$lib/server/db/actions/families';
import { POST, type InviteLinkSendDeps } from './+server';

// Issue 152 — shareable invite links honour the shared maxUses default and
// carry a real invite row id the consumer can enforce against; minting is
// rate limited like the email send.

const deps = {
	familyMember: vi.fn(),
	familyRole: vi.fn(),
	generateInviteCode: vi.fn(),
	createJwt: realCreateJwt,
	jwtSecret: new TextEncoder().encode('test-secret-1234567890')
} as unknown as InviteLinkSendDeps;

const TOKEN_BODY = { email: 'guest@x.com', firstName: 'Guest', lastName: 'User' };

function postEvent(ip: string, user: { id: string } | null = { id: 'admin-1' }) {
	return {
		params: { familyId: 'fam-1' },
		locals: { user },
		request: new Request('http://localhost/family/fam-1/members/add/email/link', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json', 'x-forwarded-for': ip },
			body: JSON.stringify(TOKEN_BODY)
		})
	} as never;
}

beforeEach(() => {
	vi.clearAllMocks();
	deps.familyMember.mockResolvedValue({ userId: 'admin-1' });
	deps.familyRole.mockResolvedValue('creator');
	deps.generateInviteCode.mockResolvedValue({ code: 'code-1', familyId: 'fam-1' });
	clearRateLimitState();
});

describe('POST /family/[familyId]/members/add/email/link', () => {
	it('mints an invite row at the shared default cap and embeds it in the link', async () => {
		const res = await POST(postEvent('1.2.3.4'), deps);

		const body = await res.json();

		expect(res.status).toBe(200);
		expect(body.success).toBe(true);
		expect(deps.generateInviteCode).toHaveBeenCalledWith('fam-1', {
			expiresInDays: 1,
			maxUses: DEFAULT_INVITE_MAX_USES,
			createdBy: 'admin-1'
		});

		const link: string = body.link;
		expect(link).toContain('/family/invite/email?token=');
		const rawToken = link.split('token=')[1];
		const parsed = parseJWT(decodeURIComponent(rawToken));
		expect(parsed?.payload).toMatchObject({
			email: 'guest@x.com',
			familyId: 'fam-1',
			inviteCode: 'code-1'
		});
	});

	it('trips the limiter on a mint burst', async () => {
		const limit = 10;
		for (let i = 0; i < limit; i++) {
			expect((await POST(postEvent('9.9.9.9'), deps)).status).toBe(200);
		}

		const res = await POST(postEvent('9.9.9.9'), deps);

		expect(res.status).toBe(429);
		expect(deps.generateInviteCode).toHaveBeenCalledTimes(limit);
	});

	it('still lets a second IP mint', async () => {
		for (let i = 0; i < 50; i++) {
			await POST(postEvent('8.8.8.8'), deps);
		}

		expect((await POST(postEvent('7.7.7.7'), deps)).status).toBe(200);
	});

	it('refuses members and mints nothing', async () => {
		deps.familyRole.mockResolvedValue('member');

		const res = await POST(postEvent('5.5.5.5'), deps);

		expect(res.status).toBe(403);
		expect(deps.generateInviteCode).not.toHaveBeenCalled();
	});

	it('refuses anonymous callers', async () => {
		expect((await POST(postEvent('5.5.5.5', null), deps)).status).toBe(401);
		expect(deps.generateInviteCode).not.toHaveBeenCalled();
	});

	it('refuses an invalid email address', async () => {
		const res = await POST(
			{
				params: { familyId: 'fam-1' },
				locals: { user: { id: 'admin-1' } },
				request: new Request('http://localhost/x', {
					method: 'POST',
					headers: { 'Content-Type': 'application/json', 'x-forwarded-for': '5.5.5.5' },
					body: JSON.stringify({ ...TOKEN_BODY, email: 'not-an-email' })
				})
			} as never,
			deps
		);

		expect(res.status).toBe(400);
		expect(deps.generateInviteCode).not.toHaveBeenCalled();
	});
});
