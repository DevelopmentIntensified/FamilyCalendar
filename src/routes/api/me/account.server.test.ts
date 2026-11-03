import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * #292 G14 account endpoints, through the real accountData service (the
 * account page's own code) with the DB-backed seams scripted.
 */
const state = vi.hoisted(() => ({ sessions: [] as { id: string }[] }));

// oxlint-disable-next-line anti-slop/no-module-mocking -- scripted session-list read.
vi.mock('$lib/server/db', () => ({
	db: { select: () => ({ from: () => ({ where: async () => state.sessions }) }) }
}));
// oxlint-disable-next-line anti-slop/no-module-mocking -- session store writes.
vi.mock('$lib/server/auth', () => ({
	invalidateSession: vi.fn(),
	invalidateUserSessions: vi.fn()
}));
// oxlint-disable-next-line anti-slop/no-module-mocking -- DB-backed user writes.
vi.mock('$lib/server/db/actions/users', async (orig) => ({
	...(await orig<object>()),
	getUser: vi.fn(),
	updateUser: vi.fn(),
	deleteUser: vi.fn()
}));
// oxlint-disable-next-line anti-slop/no-module-mocking -- DB-backed settings.
vi.mock('$lib/server/db/actions/userSettings', () => ({
	getUserSettings: vi.fn(async () => ({ hiddenDashboardModules: [] })),
	updateUserSettings: vi.fn(),
	createUserSettings: vi.fn()
}));
// oxlint-disable-next-line anti-slop/no-module-mocking -- DB-backed tokens.
vi.mock('$lib/server/db/actions/apiTokens', () => ({
	listTokensForUser: vi.fn(async () => [{ id: 't1', name: 'Android — Pixel', createdAt: 'c', lastUsedAt: null }]),
	createApiToken: vi.fn(async (_u: string, name: string) => ({
		token: 'fp_plain',
		row: { id: 't2', name, createdAt: new Date('2026-11-03T00:00:00.000Z'), tokenHash: 'HASH' }
	})),
	revokeToken: vi.fn()
}));
// oxlint-disable-next-line anti-slop/no-module-mocking -- DB-backed switches.
vi.mock('$lib/server/db/actions/notificationMethods', () => ({
	getNotificationPreferences: vi.fn(async () => ({
		taskAssigned: true,
		taskCompleted: false,
		familyJoined: true,
		aiSuggestions: false
	})),
	setNotificationPreference: vi.fn()
}));
// oxlint-disable-next-line anti-slop/no-module-mocking -- DB-backed families (GET /api/me).
vi.mock('$lib/server/db/actions/families', () => ({ getUserFamilyId: vi.fn(async () => null) }));

import { DELETE as DELETE_ME } from './+server';
import { PATCH as PROFILE } from './profile/+server';
import { POST as REVOKE_OTHERS } from './sessions/revoke-others/+server';
import { GET as LIST_TOKENS, POST as MINT } from './api-tokens/+server';
import { DELETE as REVOKE_TOKEN } from './api-tokens/[id]/+server';
import { PUT as MODULES } from './dashboard-modules/+server';
import { GET as PREFS } from './notification-preferences/+server';
import { PUT as SET_PREF } from './notification-preferences/[id]/+server';
import { POST as EMAIL } from './email/+server';
import { updateUser, deleteUser } from '$lib/server/db/actions/users';
import { invalidateSession, invalidateUserSessions } from '$lib/server/auth';
import { revokeToken } from '$lib/server/db/actions/apiTokens';
import { updateUserSettings } from '$lib/server/db/actions/userSettings';
import { setNotificationPreference } from '$lib/server/db/actions/notificationMethods';
import { clearRateLimitState } from '$lib/server/utils/rateLimit';
import type { UpdateEmailDeps } from '$lib/server/services/accountData';

const ME = { id: 'u1', firstName: 'Ann', lastName: 'Lee', email: 'ann@x.com' };

function ev(body?: unknown, extra: Record<string, unknown> = {}) {
	// SAFETY: test double — handlers read locals, params and request.
	return {
		locals: { user: ME, session: null },
		params: {},
		request: new Request('http://x/api', {
			method: 'POST',
			headers: { 'x-forwarded-for': '4.4.4.4' },
			body: body === undefined ? undefined : JSON.stringify(body)
		}),
		...extra
	} as never;
}
const anon = { locals: { user: null }, params: {}, request: new Request('http://x', { method: 'POST' }) } as never;

beforeEach(() => {
	vi.clearAllMocks();
	clearRateLimitState();
	state.sessions = [];
});

describe('G14 auth', () => {
	it.each([
		['DELETE /api/me', DELETE_ME],
		['PATCH profile', PROFILE],
		['revoke-others', REVOKE_OTHERS],
		['GET tokens', LIST_TOKENS],
		['POST tokens', MINT],
		['DELETE token', REVOKE_TOKEN],
		['PUT modules', MODULES],
		['GET prefs', PREFS],
		['PUT pref', SET_PREF]
	])('%s → 401 without auth', async (_n, handler) => {
		expect((await (handler as (e: never) => Promise<Response>)(anon)).status).toBe(401);
	});
});

describe('PATCH /api/me/profile', () => {
	it('400 with the page message when a name is blank', async () => {
		const res = await PROFILE(ev({ firstName: 'Ann', lastName: ' ' }));
		expect(await res.json()).toEqual({ error: 'First name and last name are required' });
	});
	it('saves and returns the user', async () => {
		const body = await (await PROFILE(ev({ firstName: 'Anna', lastName: 'Lee' }))).json();
		expect(updateUser).toHaveBeenCalledWith('u1', { firstName: 'Anna', lastName: 'Lee' });
		expect(body).toEqual({
			success: true,
			user: { id: 'u1', firstName: 'Anna', lastName: 'Lee', email: 'ann@x.com' }
		});
	});
});

describe('POST /api/me/sessions/revoke-others', () => {
	it('a Bearer caller (no session) signs out every web session', async () => {
		state.sessions = [{ id: 's1' }, { id: 's2' }];
		expect(await (await REVOKE_OTHERS(ev())).json()).toEqual({ success: true, revoked: 2 });
	});
	it("a cookie caller keeps its own session", async () => {
		state.sessions = [{ id: 's1' }, { id: 's2' }];
		const res = await REVOKE_OTHERS(ev(undefined, { locals: { user: ME, session: { id: 's1' } } }));
		expect(await res.json()).toEqual({ success: true, revoked: 1 });
		expect(invalidateSession).toHaveBeenCalledWith('s2');
		expect(invalidateSession).not.toHaveBeenCalledWith('s1');
	});
});

describe('/api/me/api-tokens', () => {
	it('lists without hashes', async () => {
		const body = await (await LIST_TOKENS(ev())).json();
		expect(body.tokens[0]).not.toHaveProperty('tokenHash');
	});
	it('400 for a blank name', async () => {
		expect(await (await MINT(ev({ name: '  ' }))).json()).toEqual({ error: 'Token name is required' });
	});
	it('201 with the plaintext once + a hash-free record', async () => {
		const res = await MINT(ev({ name: 'Laptop' }));
		expect(res.status).toBe(201);
		expect(await res.json()).toEqual({
			token: 'fp_plain',
			record: { id: 't2', name: 'Laptop', createdAt: '2026-11-03T00:00:00.000Z' }
		});
	});
	it('DELETE is owner-scoped', async () => {
		await REVOKE_TOKEN(ev(undefined, { params: { id: 't9' } }));
		expect(revokeToken).toHaveBeenCalledWith('u1', 't9');
	});
});

describe('DELETE /api/me', () => {
	it('400 when the confirmation is not your id; nothing deleted', async () => {
		const res = await DELETE_ME(ev({ confirmation: 'someone-else' }));
		expect(res.status).toBe(400);
		expect(await res.json()).toEqual({ error: 'Confirmation does not match' });
		expect(deleteUser).not.toHaveBeenCalled();
	});
	it('deletes after the typed confirmation', async () => {
		const res = await DELETE_ME(ev({ confirmation: 'u1' }));
		expect(await res.json()).toEqual({ success: true });
		expect(invalidateUserSessions).toHaveBeenCalledWith('u1');
		expect(deleteUser).toHaveBeenCalledWith('u1');
	});
});

describe('PUT /api/me/dashboard-modules', () => {
	it('400 when hidden is not a string array', async () => {
		expect((await MODULES(ev({ hidden: 'board' }))).status).toBe(400);
	});
	it('keeps canonical ids only', async () => {
		const body = await (await MODULES(ev({ hidden: ['verse', 'retired-module'] }))).json();
		expect(body.hidden).toEqual(['verse']);
		expect(updateUserSettings).toHaveBeenCalledWith('u1', { hiddenDashboardModules: ['verse'] });
	});
});

describe('notification preferences', () => {
	it('GET: the four switches + labels', async () => {
		const body = await (await PREFS(ev())).json();
		expect(body.preferences.taskAssigned).toBe(true);
		expect(body.options.map((o: { id: string }) => o.id)).toEqual([
			'taskAssigned',
			'taskCompleted',
			'familyJoined',
			'aiSuggestions'
		]);
	});
	it('PUT: 400 for an unknown switch', async () => {
		const res = await SET_PREF(ev({ value: true }, { params: { id: 'spam' } }));
		expect(await res.json()).toEqual({ error: 'Unknown notification preference' });
	});
	it('PUT: 400 for a non-boolean', async () => {
		expect((await SET_PREF(ev({ value: 'yes' }, { params: { id: 'taskAssigned' } }))).status).toBe(400);
	});
	it('PUT: saves one switch', async () => {
		const res = await SET_PREF(ev({ value: false }, { params: { id: 'taskAssigned' } }));
		expect(res.status).toBe(200);
		expect(setNotificationPreference).toHaveBeenCalledWith('u1', 'taskAssigned', false);
	});
});

describe('POST /api/me/email', () => {
	const deps = (): UpdateEmailDeps =>
		({
			getUser: vi.fn(async () => ME),
			sendEmail: vi.fn(),
			createJwt: vi.fn(async () => 'jwt'),
			baseUrl: 'https://fp.test',
			fromEmail: 'noreply@x.com',
			emailSecret: new Uint8Array([1]),
			deleteCodesByEmail: vi.fn(),
			createCode: vi.fn()
		}) as unknown as UpdateEmailDeps;

	it('400 for the same address (page message)', async () => {
		const res = await EMAIL(ev({ email: 'ann@x.com' }), deps());
		expect(await res.json()).toEqual({ error: 'New email must be different from current email' });
	});
	it('a guest is told to claim', async () => {
		const d = deps();
		vi.mocked(d.getUser).mockResolvedValue({ ...ME, email: 'g@anonymous.placeholder.invalid' } as never);
		const body = await (await EMAIL(ev({ email: 'new@x.com' }), d)).json();
		expect(body.guestNeedsClaim).toBe(true);
	});
	it('mails the new address', async () => {
		const d = deps();
		const res = await EMAIL(ev({ email: 'new@x.com' }), d);
		expect(await res.json()).toEqual({
			success: true,
			message: 'Verification email sent. Please check your inbox.'
		});
		expect(d.sendEmail).toHaveBeenCalledWith(expect.objectContaining({ to: 'new@x.com' }));
	});
});
