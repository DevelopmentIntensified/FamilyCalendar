import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NOREPLYEMAIL } from '$env/static/private';
import {
	issueMagicLink,
	consumeMagicLink,
	sessionCookieFor,
	sendClaimLinkEmail,
	MAGIC_LINK_RATE_LIMIT,
	magicLinkDeps,
	type MagicLinkDeps
} from './magicLink';

// Untyped vi.fn()s: fakes flow into the typed deps seam, so the SUT stays
// type-checked while mocks accept any resolved value without casts.
const getAccount = vi.fn();
const getUser = vi.fn();
const getUserByEmail = vi.fn();
const createCode = vi.fn();
const sendEmail = vi.fn();
const createJwt = vi.fn();
const verifyJwt = vi.fn();
const lucia = {
	createSession: vi.fn(),
	createSessionCookie: vi.fn()
};

const deps: MagicLinkDeps = {
	getAccount,
	getUser,
	getUserByEmail,
	createCode,
	sendEmail,
	createJwt,
	verifyJwt,
	jwtSecret: new TextEncoder().encode('test-secret-1234567890'),
	baseSiteUrl: 'http://test.com',
	fromEmail: 'noreply@test.com',
	lucia
};

const passGate = () => true;

beforeEach(() => {
	vi.clearAllMocks();
	getAccount.mockResolvedValue(undefined);
	getUser.mockResolvedValue(undefined);
	getUserByEmail.mockResolvedValue(undefined);
	sendEmail.mockResolvedValue({ success: true, error: undefined, data: { id: 'email-1' } });
	createJwt.mockResolvedValue('mock.jwt.token');
});

describe('magicLinkDeps defaults', () => {
	it('uses the canonical NOREPLYEMAIL sender for every magic-link email', () => {
		expect(magicLinkDeps.fromEmail).toBe(NOREPLYEMAIL);
	});

	it('keeps the 5 attempts / 15 minutes rate limit', () => {
		expect(MAGIC_LINK_RATE_LIMIT).toEqual({ limit: 5, windowMs: 15 * 60 * 1000 });
	});
});

describe('issueMagicLink', () => {
	// Table over the JWT/link kinds the module owns end-to-end. Claim shares
	// only the email send (see sendClaimLinkEmail below); its token lifecycle
	// lives in claimService.
	const kindCases = [
		{
			kind: 'signup' as const,
			input: { email: 'New@User.com', firstName: 'New', lastName: 'User' },
			gateKey: 'signup-code:new@user.com',
			callbackPath: '/signup/email/callback',
			expectedCodeNames: { firstName: 'New', lastName: 'User' }
		},
		{
			kind: 'login' as const,
			input: { email: 'New@User.com' },
			gateKey: 'login-code:new@user.com',
			callbackPath: '/login/email/callback',
			expectedCodeNames: { firstName: 'New', lastName: 'User' }
		}
	];

	it.each(kindCases)(
		'[$kind] generates an 8-digit code, kind-tagged JWT, canonical email, and writes the code',
		async ({ kind, input, gateKey, callbackPath, expectedCodeNames }) => {
			if (kind === 'login') {
				getUserByEmail.mockResolvedValue({
					id: 'user-1',
					email: 'new@user.com',
					firstName: 'New',
					lastName: 'User'
				});
			}

			const result = await issueMagicLink(deps, kind, input, passGate);

			if (result.status !== 'sent') throw new Error(`expected sent, got ${result.status}`);
			const { code } = result;
			expect(code).toMatch(/^\d{8}$/);

			expect(createJwt).toHaveBeenCalledTimes(1);
			const [alg, secret, payload, options] = createJwt.mock.calls[0];
			expect(alg).toBe('HS256');
			expect(secret).toBe(deps.jwtSecret);
			expect(payload).toMatchObject({ kind, email: 'New@User.com', code });
			expect(options).toHaveProperty('expiresIn');

			expect(sendEmail).toHaveBeenCalledTimes(1);
			const emailArg = sendEmail.mock.calls[0][0];
			expect(emailArg.to).toBe('New@User.com');
			expect(emailArg.from).toBe(deps.fromEmail);
			expect(emailArg.subject).toBe('Family Planz Email Confirmation for New@User.com');
			// Canonical copy: typo fixed, code and link present.
			expect(emailArg.html).toContain('for logging in:');
			expect(emailArg.html).not.toMatch(/loggin in:/);
			expect(emailArg.html).toContain(code);
			const linkMatch = /href="([^"]+)"/.exec(emailArg.html);
			expect(linkMatch).not.toBeNull();
			const link = new URL(linkMatch![1]);
			expect(link.pathname).toBe(callbackPath);
			expect(link.searchParams.get('token')).toBe('mock.jwt.token');

			expect(createCode).toHaveBeenCalledWith(
				expect.objectContaining({ code, email: 'New@User.com', ...expectedCodeNames })
			);
			// The gate key exists so routes can wire their per-request limiter.
			expect(gateKey).toContain(kind === 'signup' ? 'signup-code' : 'login-code');
		}
	);

	it('[signup] suppresses silently without sending when the email is already known', async () => {
		getAccount.mockResolvedValue({ id: 'account-1', userId: 'user-1' });
		getUserByEmail.mockResolvedValue({ id: 'user-1', email: 'taken@user.com' });

		const result = await issueMagicLink(
			deps,
			'signup',
			{ email: 'taken@user.com', firstName: 'T', lastName: 'U' },
			passGate
		);

		expect(result.status).toBe('suppressed');
		expect(sendEmail).not.toHaveBeenCalled();
		expect(createCode).not.toHaveBeenCalled();
		expect(createJwt).not.toHaveBeenCalled();
	});

	it('[login] suppresses silently when no account or user matches', async () => {
		const result = await issueMagicLink(deps, 'login', { email: 'ghost@user.com' }, passGate);

		expect(result.status).toBe('suppressed');
		expect(sendEmail).not.toHaveBeenCalled();
	});

	it('[login] resolves the user through the account when one exists', async () => {
		getAccount.mockResolvedValue({ id: 'account-1', userId: 'user-9' });
		getUser.mockResolvedValue({
			id: 'user-9',
			email: 'pw@user.com',
			firstName: 'Pw',
			lastName: 'User'
		});

		const result = await issueMagicLink(deps, 'login', { email: 'pw@user.com' }, passGate);

		expect(result.status).toBe('sent');
		expect(getUser).toHaveBeenCalledWith('user-9');
		expect(createCode).toHaveBeenCalledWith(
			expect.objectContaining({ firstName: 'Pw', lastName: 'User' })
		);
	});

	it.each(['not-an-email', '', 'a@b', 'missing-tld@.'])(
		'[signup] rejects invalid email %s before anything else',
		async (badEmail) => {
			const result = await issueMagicLink(
				deps,
				'signup',
				{ email: badEmail, firstName: 'A', lastName: 'B' },
				passGate
			);

			expect(result).toEqual({ status: 'rejected', reason: 'invalid-email' });
			expect(sendEmail).not.toHaveBeenCalled();
			expect(createCode).not.toHaveBeenCalled();
		}
	);

	it.each([
		{ input: { email: 'new@user.com', lastName: 'User' } },
		{ input: { email: 'new@user.com', firstName: 'New' } },
		{ input: { email: 'new@user.com', firstName: '', lastName: '' } }
	])('[signup] rejects missing names with a distinct reason', async ({ input }) => {
		const result = await issueMagicLink(deps, 'signup', input, passGate);

		expect(result).toEqual({ status: 'rejected', reason: 'missing-name' });
		expect(sendEmail).not.toHaveBeenCalled();
	});

	it.each(['signup', 'login'] as const)(
		'[$kind] reports rate-limited and sends nothing when the gate blocks',
		async (kind) => {
			const result = await issueMagicLink(
				deps,
				kind,
				{ email: 'flood@user.com', firstName: 'F', lastName: 'L' },
				() => false
			);

			expect(result).toEqual({ status: 'rejected', reason: 'rate-limited' });
			expect(sendEmail).not.toHaveBeenCalled();
			expect(createCode).not.toHaveBeenCalled();
		}
	);

	it.each(['signup', 'login'] as const)(
		'[$kind] reports send-failed when the email fails',
		async () => {
			getUserByEmail.mockResolvedValue({ id: 'user-1', firstName: 'New', lastName: 'User' });
			sendEmail.mockResolvedValue({ success: false, error: 'smtp down', data: undefined });

			const result = await issueMagicLink(deps, 'login', { email: 'new@user.com' }, passGate);

			expect(result).toEqual({ status: 'rejected', reason: 'send-failed' });
			expect(createCode).not.toHaveBeenCalled();
		}
	);
});

describe('consumeMagicLink', () => {
	const payloads = {
		signup: { kind: 'signup', email: 'x@y.com', firstName: 'A', lastName: 'B', code: '12345678' },
		login: { kind: 'login', email: 'x@y.com', code: '12345678' }
	};

	it.each(['signup', 'login'] as const)(
		'[$kind] returns the payload for a valid, kind-matching token',
		async (kind) => {
			verifyJwt.mockResolvedValue({ payload: payloads[kind] });

			const result = await consumeMagicLink(deps, 'valid.jwt.token', kind);

			expect(verifyJwt).toHaveBeenCalledWith('HS256', deps.jwtSecret, 'valid.jwt.token');
			if (!result.ok) throw new Error(`expected ok, got ${result.reason}`);
			expect(result.payload).toEqual(payloads[kind]);
		}
	);

	it('returns expired for an expired token', async () => {
		verifyJwt.mockRejectedValue(Object.assign(new Error('expired'), { code: 'JWT_EXPIRED' }));

		const result = await consumeMagicLink(deps, 'expired.jwt.token', 'login');

		expect(result).toEqual({ ok: false, reason: 'expired' });
	});

	it('returns invalid for a garbage token', async () => {
		verifyJwt.mockRejectedValue(new Error('not a jwt'));

		const result = await consumeMagicLink(deps, 'garbage', 'login');

		expect(result).toEqual({ ok: false, reason: 'invalid' });
	});

	it('returns kind-mismatch when the token was minted for another kind', async () => {
		verifyJwt.mockResolvedValue({ payload: payloads.login });

		const result = await consumeMagicLink(deps, 'valid.jwt.token', 'signup');

		expect(result).toEqual({ ok: false, reason: 'kind-mismatch' });
	});

	it('returns kind-mismatch for legacy tokens without a kind tag', async () => {
		verifyJwt.mockResolvedValue({ payload: { email: 'x@y.com', code: '12345678' } });

		const result = await consumeMagicLink(deps, 'legacy.jwt.token', 'login');

		expect(result).toEqual({ ok: false, reason: 'kind-mismatch' });
	});

	it('returns invalid when the payload shape does not fit the kind', async () => {
		// Kind tag says signup but the payload lacks firstName/lastName.
		verifyJwt.mockResolvedValue({
			payload: { kind: 'signup', email: 'x@y.com', code: '12345678' }
		});

		const result = await consumeMagicLink(deps, 'valid.jwt.token', 'signup');

		expect(result).toEqual({ ok: false, reason: 'invalid' });
	});
});

describe('sessionCookieFor', () => {
	it('creates a session for the user and returns the session cookie', async () => {
		lucia.createSession.mockResolvedValue({ id: 'session-1' });
		const cookie = { serialize: () => 'auth_session=session-1; Path=/' };
		lucia.createSessionCookie.mockReturnValue(cookie);

		const result = await sessionCookieFor(deps, 'user-1');

		expect(lucia.createSession).toHaveBeenCalledWith('user-1', {});
		expect(lucia.createSessionCookie).toHaveBeenCalledWith('session-1');
		expect(result).toEqual({ sessionId: 'session-1', cookie });
	});
});

describe('sendClaimLinkEmail', () => {
	it.each([
		{
			alreadyRegistered: true,
			subject: 'Merge your calendar into your Family Planz account'
		},
		{
			alreadyRegistered: false,
			subject: 'Save your Family Planz calendar'
		}
	])(
		'sends the claim email from the canonical address (alreadyRegistered: $alreadyRegistered)',
		async ({ alreadyRegistered, subject }) => {
			const result = await sendClaimLinkEmail(deps, {
				email: 'claim@user.com',
				verifyUrl: 'http://test.com/claim/verify/tok-1',
				alreadyRegistered
			});

			expect(result).toEqual({ ok: true });
			expect(sendEmail).toHaveBeenCalledTimes(1);
			const emailArg = sendEmail.mock.calls[0][0];
			expect(emailArg.to).toBe('claim@user.com');
			expect(emailArg.from).toBe(deps.fromEmail);
			expect(emailArg.subject).toBe(subject);
			expect(emailArg.html).toContain('http://test.com/claim/verify/tok-1');
		}
	);

	it('reports send-failed when sending throws or fails', async () => {
		sendEmail.mockRejectedValue(new Error('smtp down'));

		const result = await sendClaimLinkEmail(deps, {
			email: 'claim@user.com',
			verifyUrl: 'http://test.com/claim/verify/tok-1',
			alreadyRegistered: false
		});

		expect(result).toEqual({ ok: false, reason: 'send-failed' });
	});
});
