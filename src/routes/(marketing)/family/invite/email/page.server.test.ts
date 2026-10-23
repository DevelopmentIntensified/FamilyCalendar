import { describe, it, expect, vi, beforeEach } from 'vitest';
import { isRedirect } from '@sveltejs/kit';
import { createJWT } from 'oslo/jwt';
import { TimeSpan } from 'oslo';
import { EMAILSECRET } from '$env/static/private';
import { actions, type InviteEmailAcceptDeps } from './+page.server';

// Issue 152 — the email-invite consumer routes through acceptInvite so a
// replayed/revoked/over-cap link cannot join, and an existing account is
// never signed in from an invite link.

const deps = {
	getAccount: vi.fn(),
	createNewUser: vi.fn(),
	acceptInvite: vi.fn(),
	verifyInviteCode: vi.fn(),
	setPasswordHash: vi.fn(),
	startSession: vi.fn(),
	hashPassword: vi.fn()
} as unknown as InviteEmailAcceptDeps;

const payload = {
	email: 'guest@x.com',
	firstName: 'Guest',
	lastName: 'User',
	familyId: 'fam-1',
	inviteCode: 'code-1'
};

const secret = new TextEncoder().encode(EMAILSECRET);

async function mintToken(extra: Record<string, unknown> = {}) {
	return createJWT('HS256', secret, { ...payload, ...extra }, {
		headers: { alg: 'HS256', typ: 'JWT' },
		expiresIn: new TimeSpan(1, 'd')
	});
}

function event(form: Record<string, string>) {
	const fd = new FormData();
	for (const [key, value] of Object.entries(form)) fd.append(key, value);
	return {
		request: { formData: () => Promise.resolve(fd) },
		cookies: { get: () => undefined, set: () => {} }
	} as never;
}

beforeEach(() => {
	vi.clearAllMocks();
	deps.getAccount.mockResolvedValue(undefined);
	deps.acceptInvite.mockResolvedValue({ accepted: true });
	deps.verifyInviteCode.mockResolvedValue({
		family: { id: 'fam-1' },
		inviteCode: { code: 'code-1' }
	});
	deps.createNewUser.mockResolvedValue({ id: 'new-1' });
	deps.hashPassword.mockResolvedValue('hashed-pw');
});

describe('invite/email actions', () => {
	it('joins an existing account without starting a session', async () => {
		deps.getAccount.mockResolvedValue({ userId: 'u1' });

		let thrown: unknown;
		try {
			await actions.default(event({ token: await mintToken(), _action: 'skip' }), deps);
		} catch (e) {
			thrown = e;
		}

		expect(isRedirect(thrown)).toBe(true);
		expect((thrown as { location: string }).location).toContain('/login');
		expect(deps.acceptInvite).toHaveBeenCalledWith('u1', 'code-1');
		expect(deps.startSession).not.toHaveBeenCalled();
	});

	it('refuses a replayed, revoked, or used-up invite without joining', async () => {
		deps.getAccount.mockResolvedValue({ userId: 'u1' });
		deps.acceptInvite.mockResolvedValue({ accepted: false });

		let thrown: unknown;
		try {
			await actions.default(event({ token: await mintToken(), _action: 'skip' }), deps);
		} catch (e) {
			thrown = e;
		}

		expect(isRedirect(thrown)).toBe(true);
		expect((thrown as { location: string }).location).toContain('/login');
		expect(deps.startSession).not.toHaveBeenCalled();
	});

	it('creates, joins, and signs in a brand-new account via skip', async () => {
		let thrown: unknown;
		try {
			await actions.default(event({ token: await mintToken(), _action: 'skip' }), deps);
		} catch (e) {
			thrown = e;
		}

		expect(isRedirect(thrown)).toBe(true);
		expect(deps.createNewUser).toHaveBeenCalledWith('Guest', 'User', 'guest@x.com');
		expect(deps.acceptInvite).toHaveBeenCalledWith('new-1', 'code-1');
		expect(deps.startSession).toHaveBeenCalledWith(expect.anything(), 'new-1');
		expect((thrown as { location: string }).location).toBe('/family/fam-1');
	});

	it('sets the password and signs in a brand-new account via the password path', async () => {
		let thrown: unknown;
		try {
			await actions.default(
				event({
					token: await mintToken(),
					_action: 'setPassword',
					password: 'correct horse 8',
					passwordConfirm: 'correct horse 8'
				}),
				deps
			);
		} catch (e) {
			thrown = e;
		}

		expect(isRedirect(thrown)).toBe(true);
		expect(deps.setPasswordHash).toHaveBeenCalledWith('new-1', 'hashed-pw');
		expect(deps.startSession).toHaveBeenCalledWith(expect.anything(), 'new-1');
	});

	it('keeps the signup password floor at 8 characters', async () => {
		const res = await actions.default(
			event({
				token: await mintToken(),
				_action: 'setPassword',
				password: 'only7xx',
				passwordConfirm: 'only7xx'
			}),
			deps
		);

		const body = (res?.data ?? {}) as { error?: string };

		expect(res?.status).toBe(400);
		expect(body.error).toContain('8 characters');
		expect(deps.createNewUser).not.toHaveBeenCalled();
	});

	it('rejects legacy tokens without an embedded invite row', async () => {
		const token = await mintToken({ inviteCode: undefined });

		let thrown: unknown;
		try {
			await actions.default(event({ token, _action: 'skip' }), deps);
		} catch (e) {
			thrown = e;
		}

		expect(isRedirect(thrown)).toBe(true);
		expect((thrown as { location: string }).location).toContain('/login');
		expect(deps.acceptInvite).not.toHaveBeenCalled();
		expect(deps.createNewUser).not.toHaveBeenCalled();
	});

	it('refuses a dead invite row before creating the new account', async () => {
		deps.verifyInviteCode.mockResolvedValue(null);

		let thrown: unknown;
		try {
			await actions.default(event({ token: await mintToken(), _action: 'skip' }), deps);
		} catch (e) {
			thrown = e;
		}

		expect(isRedirect(thrown)).toBe(true);
		expect((thrown as { location: string }).location).toContain('/login');
		expect(deps.createNewUser).not.toHaveBeenCalled();
	});
});
