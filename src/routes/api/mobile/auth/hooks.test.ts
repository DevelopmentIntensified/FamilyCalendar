import { describe, it, expect, vi, beforeEach } from 'vitest';

// hooks.server.ts pulls the real db module at import (lazy client, no
// connection) — dummy URL + migrations off keep the import side-effect free.
vi.hoisted(() => {
	process.env.DATABASE_URL ??= 'postgres://postgres:postgres@localhost:5433/familycalendar_test';
	process.env.DATABASE_DISABLE_MIGRATIONS = '1';
});

/**
 * #288 composition through the REAL hooks chain: the mobile sign-in
 * endpoints are reachable by a cookie-less, Origin-less JSON client (no
 * CSRF/origin block, no auto-created guest session, no Set-Cookie), and a
 * token minted for a guest authenticates GET /api/tasks like any fp_ token.
 */

// oxlint-disable-next-line anti-slop/no-module-mocking -- pins the Bearer seam (hash lookup is apiTokens' own unit concern).
vi.mock('$lib/server/db/actions/apiTokens', () => ({
	getUserForApiToken: vi.fn()
}));

// oxlint-disable-next-line anti-slop/no-module-mocking -- spies on the hooks' anonymous-account fallback; it must NOT fire for these requests.
vi.mock('$lib/server/db/actions/users', () => ({
	createAnonymousUser: vi.fn(),
	touchLastActiveAt: vi.fn()
}));

// oxlint-disable-next-line anti-slop/no-module-mocking -- task reads hit Postgres; this test pins auth composition, not the task query.
vi.mock('$lib/server/db/actions/tasks', async (importOriginal) => ({
	...(await importOriginal<object>()),
	getTasksForUser: vi.fn(async () => [])
}));

// oxlint-disable-next-line anti-slop/no-module-mocking -- scripted seam; the real module reads familyMembers from the DB.
vi.mock('$lib/server/db/actions/families', () => ({
	getUserFamilyId: vi.fn(async () => null)
}));

// oxlint-disable-next-line anti-slop/no-module-mocking -- scripted zone; the real module reads user settings from the DB.
vi.mock('$lib/server/utils/userTimezone', () => ({
	getUserZone: vi.fn(async () => 'UTC'),
	zonedNow: vi.fn()
}));

import { handle } from '../../../../hooks.server';
import { GET } from '../../tasks/+server';
import { getUserForApiToken } from '$lib/server/db/actions/apiTokens';
import { createAnonymousUser } from '$lib/server/db/actions/users';
import { getTasksForUser } from '$lib/server/db/actions/tasks';

const guest = {
	id: 'g1',
	firstName: 'Guest',
	lastName: '',
	email: 'g1@anonymous.placeholder.invalid'
};

function makeEvent(opts: { pathname: string; method?: string; auth?: string; origin?: string }) {
	const headers = new Headers({ 'content-type': 'application/json', accept: 'application/json' });
	if (opts.auth) headers.set('authorization', opts.auth);
	if (opts.origin) headers.set('origin', opts.origin);
	const setCalls: string[] = [];
	return {
		setCalls,
		event: {
			url: new URL(`https://familyplanz.com${opts.pathname}`),
			request: { method: opts.method ?? 'POST', headers },
			cookies: { get: () => undefined, set: (n: string) => setCalls.push(n) },
			locals: { user: null, session: null }
		}
	};
}

type HookEvent = ReturnType<typeof makeEvent>['event'];

/** Runs the REAL hooks chain. */
function runHandle(event: HookEvent, resolve: (e: HookEvent) => Promise<Response> | undefined) {
	// SAFETY: test double — the handle chain only reads url/request/cookies/locals.
	return handle({ event: event as never, resolve: resolve as never });
}

beforeEach(() => vi.clearAllMocks());

describe('hooks × /api/mobile/auth/*', () => {
	it.each(['email', 'verify', 'password', 'guest'])(
		'POST /api/mobile/auth/%s from a native client passes through: no guest session, no cookie',
		async (ep) => {
			const { event, setCalls } = makeEvent({ pathname: `/api/mobile/auth/${ep}` });
			const resolve = vi.fn(async () => new Response('reached'));

			const res = await runHandle(event, resolve);

			expect(await res.text()).toBe('reached');
			expect(resolve).toHaveBeenCalledTimes(1);
			expect(createAnonymousUser).not.toHaveBeenCalled();
			expect(setCalls).toEqual([]);
			expect(res.headers.get('set-cookie')).toBeNull();
		}
	);

	it('a cross-site browser Origin is still rejected (CSRF defence stays on)', async () => {
		const { event } = makeEvent({
			pathname: '/api/mobile/auth/guest',
			origin: 'https://evil.example'
		});
		const resolve = vi.fn();
		const res = await runHandle(event, resolve);
		expect(res.status).toBe(403);
		expect(resolve).not.toHaveBeenCalled();
	});

	it('a guest token authenticates GET /api/tasks (requireUserJson accepts the Anonymous Account)', async () => {
		vi.mocked(getUserForApiToken).mockResolvedValue(
			// SAFETY: the routes read id/email only; the full user row is a DB concern.
			guest as never
		);
		const { event } = makeEvent({
			pathname: '/api/tasks',
			method: 'GET',
			auth: 'Bearer fp_guest_device'
		});
		const resolve = vi.fn(async (e: HookEvent) =>
			// SAFETY: GET /api/tasks only reads locals + url.
			GET({ locals: e.locals, url: e.url } as never)
		);

		const res = await runHandle(event, resolve);

		expect(getUserForApiToken).toHaveBeenCalledWith('fp_guest_device');
		expect(res.status).toBe(200);
		expect(await res.json()).toEqual({ tasks: [] });
		expect(getTasksForUser).toHaveBeenCalledWith('g1', null, 'UTC');
	});

	it('logout reaches the route with the Bearer owner resolved (revoked token → 401 at the hook)', async () => {
		vi.mocked(getUserForApiToken).mockResolvedValue(null);
		const { event } = makeEvent({ pathname: '/api/mobile/auth/logout', auth: 'Bearer fp_gone' });
		const resolve = vi.fn();
		const res = await runHandle(event, resolve);
		expect(res.status).toBe(401);
		expect(resolve).not.toHaveBeenCalled();
	});
});
