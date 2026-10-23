import { describe, it, expect, vi, beforeEach } from 'vitest';
import { parseJWT, createJWT as realCreateJwt } from 'oslo/jwt';
import { clearRateLimitState } from '$lib/server/utils/rateLimit';
import { POST, type InviteEmailSendDeps } from './+server';

// Issue 152 — emailed invites must mint a durable, single-use invite row and
// bind it into the JWT, and the send endpoint must be rate limited.

const deps = {
	familyMember: vi.fn(),
	familyRole: vi.fn(),
	generateInviteCode: vi.fn(),
	createJwt: realCreateJwt,
	sendEmail: vi.fn(),
	renderEmail: vi.fn(),
	jwtSecret: new TextEncoder().encode('test-secret-1234567890')
} as unknown as InviteEmailSendDeps;

// Issue 091 — the rendered body must come out of the injected template
// function with the minted, code-bound link inside it, not from HTML built
// inline in the handler.
const TEMPLATE_RENDER = vi.fn(
	(input: { inviterName: string; inviteUrl: string }) =>
		`<a href="${input.inviteUrl}">Join — from ${input.inviterName}</a>`
);

const TOKEN_BODY = { email: 'guest@x.com', firstName: 'Guest', lastName: 'User' };

// SAFETY: test double — POST only reads params, locals and request.json().
function postEvent(
	ip: string,
	user:
		| { id: string; firstName: string; lastName: string }
		| null = { id: 'admin-1', firstName: 'Ann', lastName: 'Admin' }
) {
	return {
		params: { familyId: 'fam-1' },
		locals: { user },
		request: new Request('http://localhost/family/fam-1/members/add/email', {
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
	deps.sendEmail.mockResolvedValue({ success: true });
	// SAFETY: deps.renderEmail is a vi.fn — reset per test so each assertion
	// sees its own call.
	vi.mocked(deps.renderEmail).mockImplementation(TEMPLATE_RENDER);
	clearRateLimitState();
});

describe('POST /family/[familyId]/members/add/email', () => {
	it('mints a single-use invite row and emails a link binding it', async () => {
		const res = await POST(postEvent('1.2.3.4'), deps);

		expect(res.status).toBe(200);
		expect(deps.generateInviteCode).toHaveBeenCalledWith('fam-1', {
			expiresInDays: 1,
			maxUses: 1,
			createdBy: 'admin-1'
		});

		const mail = deps.sendEmail.mock.calls[0][0];
		expect(mail.to).toBe('guest@x.com');
		const rawToken = mail.html.match(/token=([^"<\s]+)/)![1];
		const parsed = parseJWT(decodeURIComponent(rawToken));
		expect(parsed?.payload).toMatchObject({
			email: 'guest@x.com',
			firstName: 'Guest',
			lastName: 'User',
			familyId: 'fam-1',
			inviteCode: 'code-1'
		});
	});

	it('renders the body through the injected email template, with the minted link in it', async () => {
		const res = await POST(postEvent('1.2.3.5'), deps);

		expect(res.status).toBe(200);
		const renderArg = vi.mocked(deps.renderEmail).mock.calls[0][0];
		expect(renderArg.inviterName).toBe('Ann Admin');
		expect(renderArg.inviteUrl).toContain('/family/invite/email?token=');
		// The minted code rides inside the link as a signed claim (issue 152):
		// whoever follows it joins through that exact invite row.
		const rawToken = renderArg.inviteUrl.match(/token=([^&\s]+)/)![1];
		const parsed = parseJWT(decodeURIComponent(rawToken));
		expect(parsed?.payload).toMatchObject({ familyId: 'fam-1', inviteCode: 'code-1' });
		// What landed in the send call is exactly what the template rendered.
		expect(deps.sendEmail.mock.calls[0][0].html).toBe(
			`<a href="${renderArg.inviteUrl}">Join — from Ann Admin</a>`
		);
	});

	it('trips the limiter on a send burst, before minting', async () => {
		const limit = 10;
		for (let i = 0; i < limit; i++) {
			const res = await POST(postEvent('9.9.9.9'), deps);
			expect(res.status).toBe(200);
		}

		const res = await POST(postEvent('9.9.9.9'), deps);

		expect(res.status).toBe(429);
		expect(deps.generateInviteCode).toHaveBeenCalledTimes(limit);
	});

	it('still lets a second IP send', async () => {
		for (let i = 0; i < 50; i++) {
			await POST(postEvent('8.8.8.8'), deps);
		}

		const res = await POST(postEvent('7.7.7.7'), deps);

		expect(res.status).toBe(200);
	});

	it('refuses members and mints nothing', async () => {
		deps.familyRole.mockResolvedValue('member');

		const res = await POST(postEvent('5.5.5.5'), deps);

		expect(res.status).toBe(403);
		expect(deps.generateInviteCode).not.toHaveBeenCalled();
	});

	it('refuses anonymous callers', async () => {
		const res = await POST(postEvent('5.5.5.5', null), deps);

		expect(res.status).toBe(401);
		expect(deps.generateInviteCode).not.toHaveBeenCalled();
	});

	it('refuses an invalid email address', async () => {
		const res = await POST(
			{
				...{
					params: { familyId: 'fam-1' },
					locals: { user: { id: 'admin-1' } }
				},
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
