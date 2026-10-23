import { describe, it, expect, vi, beforeEach } from 'vitest';

// hooks.server.ts pulls the real db module at import (lazy client, no
// connection) — dummy URL + migrations off keep the import side-effect free.
vi.hoisted(() => {
	process.env.DATABASE_URL ??= 'postgres://postgres:postgres@localhost:5433/familycalendar_test';
	process.env.DATABASE_DISABLE_MIGRATIONS = '1';
});

// oxlint-disable-next-line anti-slop/no-module-mocking -- pins the Bearer seam; cookie path stays real but unreached (no cookie in these events).
vi.mock('$lib/server/db/actions/apiTokens', () => ({
	getUserForApiToken: vi.fn()
}));

// oxlint-disable-next-line anti-slop/no-module-mocking -- the session module talks to Postgres; hooks tests use an in-memory stand-in with the SAME seam contract (cookie value = `token.sig`, cookie set on create, blank-cookie cascade on invalid).
vi.mock('$lib/server/auth', () => {
	const sessionCookieName = 'better-auth.session_token';
	// token → session row; the "signature" part is accepted verbatim here —
	// HMAC verification is the session module's own unit concern, hooks only
	// pin the composition (cookie set/blank-cascade/locals).
	const rows = new Map<string, { id: string; token: string; userId: string; fresh: boolean }>();
	let counter = 0;

	const setSessionCookie = vi.fn(
		(
			cookies: { set: (n: string, v: string, o?: object) => void },
			cookie: { name: string; value: string; attributes?: object }
		) => cookies.set(cookie.name, cookie.value, { path: '/', ...cookie.attributes })
	);

	const asCookie = (row: { token: string }) => ({
		name: sessionCookieName,
		value: `${row.token}.sig`,
		attributes: { path: '/', httpOnly: true, sameSite: 'lax' },
		serialize: () => `${sessionCookieName}=${row.token}.sig; Path=/`
	});

	return {
		sessionCookieName,
		session: {
			createSession: vi.fn(async (userId: string) => {
				counter += 1;
				const row = { id: `s${counter}`, token: `tok${counter}`, userId, fresh: true };
				rows.set(row.token, row);
				return row;
			}),
			createSessionCookie: vi.fn(asCookie),
			validateSession: vi.fn(async (value?: string) => {
				const token = value?.split('.').slice(0, -1).join('.');
				const row = token ? rows.get(token) : undefined;
				if (!row) return { session: null, user: null };
				return { session: { ...row, fresh: false }, user: { id: row.userId } };
			}),
			invalidateSession: vi.fn(),
			invalidateUserSessions: vi.fn()
		},
		createBlankSessionCookie: vi.fn(() => ({
			name: sessionCookieName,
			value: '',
			attributes: { path: '/', httpOnly: true, sameSite: 'lax', maxAge: 0 },
			serialize: () => `${sessionCookieName}=; Path=/; Max-Age=0`
		})),
		createSessionCookie: vi.fn(asCookie),
		invalidateStaleAnonymousSession: vi.fn(),
		setSessionCookie
	};
});

// oxlint-disable-next-line anti-slop/no-module-mocking -- anonymous-account creation writes Postgres; hooks tests only need a fake row.
vi.mock('$lib/server/db/actions/users', () => ({
	createAnonymousUser: vi.fn(async () => ({
		id: 'guest-1',
		email: 'guest-1@anonymous.placeholder.invalid'
	})),
	touchLastActiveAt: vi.fn()
}));

// oxlint-disable-next-line anti-slop/no-module-mocking -- bug-report filing writes Postgres; these tests only pin whether handleError decides to file.
vi.mock('$lib/server/db/actions/bugReports', () => ({
	createBugReport: vi.fn(async () => undefined)
}));

import { handle, handleError } from './hooks.server';
import { __resetAutoReportThrottle } from '$lib/server/services/autoBugReport';
import { getUserForApiToken } from '$lib/server/db/actions/apiTokens';
import { createAnonymousUser } from '$lib/server/db/actions/users';
import { sessionCookieName } from '$lib/server/auth';
import { createBugReport } from '$lib/server/db/actions/bugReports';

const mockedLookup = vi.mocked(getUserForApiToken);
const mockedCreateAnonymousUser = vi.mocked(createAnonymousUser);

type CookieJar = {
	setCalls: { name: string; value: string; options?: object }[];
	set: (n: string, v: string, o?: object) => void;
	get: (n: string) => string | undefined;
};

function makeCookieJar(value: Record<string, string> = {}): CookieJar {
	const setCalls: { name: string; value: string; options?: object }[] = [];
	return {
		setCalls,
		set: (n, v, o) => setCalls.push({ name: n, value: v, options: o }),
		get: (n: string) => value[n]
	};
}

type EventInput = {
	pathname: string;
	auth?: string;
	method?: string;
	accept?: string;
	cookies?: CookieJar;
};

function makeEvent(opts: EventInput) {
	const headers = new Headers();
	if (opts.auth) headers.set('authorization', opts.auth);
	if (opts.accept) headers.set('accept', opts.accept);
	const cookies = opts.cookies ?? makeCookieJar();
	return {
		url: { pathname: opts.pathname, host: 'familyplanz.com' },
		request: { method: opts.method ?? 'GET', headers },
		cookies,
		locals: {
			user: null as { id: string; email?: string | null } | null,
			session: null as { id: string; userId: string } | null
		}
	};
}

function handleEvent(event: ReturnType<typeof makeEvent>): Promise<Response> {
	const out = handle({ event: event as never, resolve: resolveFn as never });
	return out instanceof Promise ? out : Promise.resolve(out);
}

/** SvelteKit signals `redirect(...)` by throwing a Redirect; turning one into
 *  a Response keeps assertions on the wire shape instead of the throw. */
function redirectAsResponse(thrown: unknown): Response {
	if (thrown && typeof thrown === 'object' && 'location' in thrown) {
		const redirect = thrown as { status?: number; location: string };
		return new Response(null, {
			status: redirect.status ?? 307,
			headers: { location: redirect.location }
		});
	}
	throw thrown;
}

const resolveFn = vi.fn(async (e: { locals: { user: { id: string } | null } }) => {
	return new Response('ok:' + (e.locals.user?.id ?? 'anon'));
});

beforeEach(() => {
	vi.clearAllMocks();
	__resetAutoReportThrottle();
});

describe('hooks Bearer auth (TaskFocus API tokens)', () => {
	it('authenticates a valid Bearer token on /api/* with no session', async () => {
		mockedLookup.mockResolvedValue({ id: 'user-1' } as never);
		const event = makeEvent({ pathname: '/api/tasks', auth: 'Bearer fp_good' });

		const res = await handleEvent(event);

		expect(mockedLookup).toHaveBeenCalledWith('fp_good');
		expect(event.locals.user).toEqual({ id: 'user-1' });
		expect(event.locals.session).toBeNull();
		expect(await res.text()).toBe('ok:user-1');
	});

	it('returns 401 JSON for an invalid Bearer token without resolving', async () => {
		mockedLookup.mockResolvedValue(null);
		const event = makeEvent({ pathname: '/api/tasks', auth: 'Bearer fp_bad' });

		const res = await handleEvent(event);

		expect(res.status).toBe(401);
		expect(await res.json()).toEqual({ error: 'Unauthorized' });
		expect(resolveFn).not.toHaveBeenCalled();
	});

	it('leaves the cookie path untouched when no Bearer header is present', async () => {
		const event = makeEvent({ pathname: '/api/tasks' });

		const res = await handleEvent(event);

		expect(mockedLookup).not.toHaveBeenCalled();
		expect(event.locals.user).toBeNull();
		expect(await res.text()).toBe('ok:anon');
	});

	it('ignores Bearer headers off /api/* (page routes stay cookie-only)', async () => {
		const event = makeEvent({ pathname: '/calendar', auth: 'Bearer fp_good' });

		await handleEvent(event);

		expect(mockedLookup).not.toHaveBeenCalled();
		expect(event.locals.user).toBeNull();
	});
});

describe('hooks cookie path (session seam)', () => {
	it('creates an Anonymous Account + session for a document navigation on a protected route and sets the session cookie', async () => {
		const cookies = makeCookieJar();
		const event = makeEvent({ pathname: '/calendar', accept: 'text/html', cookies });

		const res = await handleEvent(event);

		expect(mockedCreateAnonymousUser).toHaveBeenCalledTimes(1);
		expect(event.locals.user).toMatchObject({ id: 'guest-1' });
		expect(event.locals.session).toMatchObject({ userId: 'guest-1', fresh: true });
		const setCookie = cookies.setCalls.find((c) => c.name === sessionCookieName);
		expect(setCookie?.value).toMatch(/^tok[0-9]+\.sig$/);
		expect(res.status).toBe(200);
	});

	it('does NOT create an anonymous account for non-document requests (prefetch/API)', async () => {
		const postEvent = makeEvent({ pathname: '/calendar', method: 'POST' });
		await handleEvent(postEvent);
		expect(mockedCreateAnonymousUser).not.toHaveBeenCalled();

		const prefetchEvent = makeEvent({ pathname: '/calendar' });
		await handleEvent(prefetchEvent);
		expect(mockedCreateAnonymousUser).not.toHaveBeenCalled();
		expect(prefetchEvent.locals.user).toBeNull();
	});

	it('populates locals from a valid session cookie without re-issuing the cookie when not fresh', async () => {
		// Create via the anon path, then re-request with the issued cookie.
		const cookies = makeCookieJar();
		const first = makeEvent({ pathname: '/calendar', accept: 'text/html', cookies });
		await handleEvent(first);
		const issued = cookies.setCalls.find((c) => c.name === sessionCookieName)?.value;

		const cookies2 = makeCookieJar({ [sessionCookieName]: issued! });
		const event = makeEvent({ pathname: '/calendar', accept: 'text/html', cookies: cookies2 });
		const res = await handleEvent(event);

		expect(event.locals.session).toMatchObject({ userId: 'guest-1' });
		expect(event.locals.user).toMatchObject({ id: 'guest-1' });
		expect(cookies2.setCalls.filter((c) => c.name === sessionCookieName)).toHaveLength(0);
		expect(res.status).toBe(200);
	});

	it('cascades a blank cookie and nulls locals when the cookie is invalid', async () => {
		const cookies = makeCookieJar({ [sessionCookieName]: 'ghost.sig' });
		const event = makeEvent({ pathname: '/api/anything', cookies });

		await handleEvent(event);

		expect(event.locals.user).toBeNull();
		expect(event.locals.session).toBeNull();
		const blank = cookies.setCalls.find((c) => c.name === sessionCookieName);
		expect(blank?.value).toBe('');
		expect(blank?.options).toMatchObject({ maxAge: 0 });
		expect(mockedCreateAnonymousUser).not.toHaveBeenCalled();
	});

	it('redirects admin routes to /login before any anonymous-account fallback', async () => {
		const event = makeEvent({ pathname: '/admin/settings', accept: 'text/html' });

		const res = await handleEvent(event).catch(redirectAsResponse);

		expect(mockedCreateAnonymousUser).not.toHaveBeenCalled();
		expect(res.status).toBe(302);
		expect(res.headers.get('location')).toBe('/login');
	});
});

describe('handleError auto-filing (issue 153)', () => {
	const call = (
		status: number,
		message: string,
		user: { id: string } | null,
		pathname = '/account'
	) =>
		handleError({
			status,
			error: new Error(message),
			event: { url: new URL(`http://localhost${pathname}`), locals: { user } } as never
		});

	it('does NOT file a bug report for an unauthenticated caller (attacker-generated, not an app signal)', async () => {
		await call(500, 'Cannot read properties of null (reading id)', null);

		expect(createBugReport).not.toHaveBeenCalled();
	});

	it('still files for an authenticated 500, keyed to the user', async () => {
		await call(500, 'genuine app failure', { id: 'user-1' }, '/calendar');

		expect(createBugReport).toHaveBeenCalledTimes(1);
		expect(vi.mocked(createBugReport).mock.calls[0]?.[0]).toMatchObject({
			userId: 'user-1',
			area: 'calendar'
		});
	});

	it('throttles repeated identical authenticated failures within the window', async () => {
		await call(500, 'same failure', { id: 'user-1' }, '/calendar');
		await call(500, 'same failure', { id: 'user-1' }, '/calendar');

		expect(createBugReport).toHaveBeenCalledTimes(1);
	});
});
