import { describe, it, expect, vi, beforeEach } from 'vitest';
import { isRedirect } from '@sveltejs/kit';
import { createJWT } from 'oslo/jwt';
import { TimeSpan } from 'oslo';
import { EMAILSECRET } from '$env/static/private';
import { actions, type InviteEmailAcceptDeps } from './+page.server';

// Issue 152 — the email-invite consumer routes through acceptInvite so a
// replayed/revoked/over-cap link cannot join, and an existing account is
// never signed in from an invite link.

// The action takes the deps interface (plain function types), so the mocks keep
// their own identity for `mockResolvedValue`; the action receives the same object.
const mocks = {
	getAccount: vi.fn(),
	createNewUser: vi.fn(),
	acceptInvite: vi.fn(),
	verifyInviteCode: vi.fn(),
	setPasswordHash: vi.fn(),
	startSession: vi.fn(),
	hashPassword: vi.fn()
};
const deps = mocks as unknown as InviteEmailAcceptDeps;

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
	mocks.getAccount.mockResolvedValue(undefined);
	mocks.acceptInvite.mockResolvedValue({ accepted: true });
	mocks.verifyInviteCode.mockResolvedValue({
		family: { id: 'fam-1' },
		inviteCode: { code: 'code-1' }
	});
	mocks.createNewUser.mockResolvedValue({ id: 'new-1' });
	mocks.hashPassword.mockResolvedValue('hashed-pw');
});

describe('invite/email actions', () => {
	it('joins an existing account without starting a session', async () => {
		mocks.getAccount.mockResolvedValue({ userId: 'u1' });

		let thrown: unknown;
		try {
			await actions.default(event({ token: await mintToken(), _action: 'skip' }), deps);
		} catch (e) {
			thrown = e;
		}

		expect(isRedirect(thrown)).toBe(true);
		expect((thrown as { location: string }).location).toContain('/login');
		// #246: success travels as ?notice= (green), never ?error=.
		expect((thrown as { location: string }).location).toMatch(/^\/login\?notice=/);
		expect(mocks.acceptInvite).toHaveBeenCalledWith('u1', 'code-1');
		expect(mocks.startSession).not.toHaveBeenCalled();
	});

	it('refuses a replayed, revoked, or used-up invite without joining', async () => {
		mocks.getAccount.mockResolvedValue({ userId: 'u1' });
		mocks.acceptInvite.mockResolvedValue({ accepted: false });

		let thrown: unknown;
		try {
			await actions.default(event({ token: await mintToken(), _action: 'skip' }), deps);
		} catch (e) {
			thrown = e;
		}

		expect(isRedirect(thrown)).toBe(true);
		expect((thrown as { location: string }).location).toContain('/login');
		expect((thrown as { location: string }).location).toMatch(/^\/login\?error=/);
		expect(mocks.startSession).not.toHaveBeenCalled();
	});

	it('creates, joins, and signs in a brand-new account via skip', async () => {
		let thrown: unknown;
		try {
			await actions.default(event({ token: await mintToken(), _action: 'skip' }), deps);
		} catch (e) {
			thrown = e;
		}

		expect(isRedirect(thrown)).toBe(true);
		expect(mocks.createNewUser).toHaveBeenCalledWith('Guest', 'User', 'guest@x.com');
		expect(mocks.acceptInvite).toHaveBeenCalledWith('new-1', 'code-1');
		expect(mocks.startSession).toHaveBeenCalledWith(expect.anything(), 'new-1');
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
		expect(mocks.setPasswordHash).toHaveBeenCalledWith('new-1', 'hashed-pw');
		expect(mocks.startSession).toHaveBeenCalledWith(expect.anything(), 'new-1');
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
		expect(mocks.createNewUser).not.toHaveBeenCalled();
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
		expect(mocks.acceptInvite).not.toHaveBeenCalled();
		expect(mocks.createNewUser).not.toHaveBeenCalled();
	});

	it('refuses a dead invite row before creating the new account', async () => {
		mocks.verifyInviteCode.mockResolvedValue(null);

		let thrown: unknown;
		try {
			await actions.default(event({ token: await mintToken(), _action: 'skip' }), deps);
		} catch (e) {
			thrown = e;
		}

		expect(isRedirect(thrown)).toBe(true);
		expect((thrown as { location: string }).location).toContain('/login');
		expect(mocks.createNewUser).not.toHaveBeenCalled();
	});
});
