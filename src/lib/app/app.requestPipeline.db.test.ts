/**
 * The request pipeline against real Postgres and real identity services: the
 * legacy `src/hooks.server.test.ts` rules, now pinned where the composition
 * lives. Every case comes from `src/hooks.server.ts` at the S2 sha
 * (`66a11131`): Bearer only on `/api/*`, an Anonymous Account only on a
 * document navigation to a protected route, the blank-cookie cascade, the
 * admin gate before the fallback, the hourly Inactivity Window touch, the
 * header/origin order, and `handleError`'s #153 filing decision.
 *
 * `rollbackTest` + a fixed clock keep every expiry and touch exact; sessions are
 * minted by identity's own `startSession`, so the cookie is genuinely signed
 * and validated (no module mocking — R9).
 *
 * Doc: ./README.md#how-to-test
 */
import { isRedirect, type Handle, type RequestEvent } from '@sveltejs/kit';
import { describe, expect, it } from 'vitest';
import { isAdminRoute, isProtectedRoute } from '$lib/domains/access/index.server';
import { SESSION_COOKIE_NAME, mintApiToken, startSession } from '$lib/domains/identity/index.server';
import { actorFromUser, type Actor } from '$lib/kernel/ctx/actor';
import type { Ctx } from '$lib/kernel/ctx/ctx.server';
import type { Db } from '$lib/kernel/db/database.server';
import {
	apiTokens,
	authSession,
	bugReports,
	users,
	type NewUserRow,
	type UserRow
} from '$lib/kernel/db/tables.server';
import { seedUser } from '$lib/kernel/testing/seedRows.server';
import { rollbackTest } from '$lib/kernel/testing/testDb.server';
import { testCtx, type TestCtx } from '$lib/kernel/testing/testCtx.server';
import { createAppHandle, createAppHandleError } from './requestPipeline.server';

const NOW = '2026-04-01T12:00:00.000Z';
const HOUR_MS = 60 * 60 * 1000;

type CookieSet = { name: string; value: string; options?: object };

type CookieJar = {
	readonly setCalls: CookieSet[];
	set(name: string, value: string, options?: object): void;
	get(name: string): string | undefined;
};

function makeCookieJar(value: Record<string, string> = {}): CookieJar {
	const setCalls: CookieSet[] = [];
	return {
		setCalls,
		set: (name, cookieValue, options) => setCalls.push({ name, value: cookieValue, options }),
		get: (name) => value[name]
	};
}

/** The four event members the pipeline reads; a full RequestEvent needs a server. */
type PipelineEvent = {
	url: { pathname: string; host: string };
	request: Request;
	cookies: CookieJar;
	locals: {
		user: { id: string; email: string | null; roles: string[] } | null;
		session: { id: string; token: string; userId: string; fresh?: boolean } | null;
		ctx?: Ctx;
		actor?: Actor | null;
	};
};

function asRequestEvent(event: PipelineEvent): RequestEvent {
	// SAFETY: the composition touches only url.pathname/url.host, request, cookies and locals; params, route, fetch, platform and setHeaders are never read by the hooks.
	return event as never;
}

type EventInput = {
	readonly pathname: string;
	readonly auth?: string;
	readonly origin?: string;
	readonly method?: string;
	readonly accept?: string;
	readonly contentType?: string;
	readonly cookies?: CookieJar;
};

const HOST = 'familyplanz.com';

function makeEvent(input: EventInput): PipelineEvent {
	const headers = new Headers();
	if (input.auth) headers.set('authorization', input.auth);
	if (input.accept) headers.set('accept', input.accept);
	if (input.origin) headers.set('origin', input.origin);
	if (input.contentType) headers.set('content-type', input.contentType);
	return {
		url: { pathname: input.pathname, host: HOST },
		request: new Request(`http://${HOST}${input.pathname}`, {
			method: input.method ?? 'GET',
			headers
		}),
		cookies: input.cookies ?? makeCookieJar(),
		locals: { user: null, session: null }
	};
}

/** The inner response a resolved request answers, so a test can see which person it saw. */
function resolveFor(event: PipelineEvent): () => Response {
	return () => new Response(`ok:${event.locals.user?.id ?? 'anon'}`);
}

async function run(
	handle: Handle,
	event: PipelineEvent,
	resolve: () => Response = resolveFor(event)
): Promise<Response> {
	return await handle({ event: asRequestEvent(event), resolve });
}

async function redirectOf(outcome: Promise<Response>): Promise<{ status: number; location: string }> {
	try {
		const response = await outcome;
		throw new Error(`expected a redirect, got ${response.status}`);
	} catch (cause) {
		if (isRedirect(cause)) return { status: cause.status, location: cause.location };
		throw cause;
	}
}

function pipeline(db: Db): { ctx: TestCtx; handle: Handle } {
	const ctx = testCtx({ db, now: NOW });
	return { ctx, handle: createAppHandle(ctx) };
}

/** A signed-in browser: a real person row plus identity's signed session cookie. */
async function signedIn(
	db: Db,
	ctx: TestCtx,
	overrides: Partial<NewUserRow> = {}
): Promise<{ person: UserRow; cookie: CookieJar }> {
	const person = await seedUser(db, overrides);
	const started = await startSession(ctx, person.id);
	return {
		person,
		cookie: makeCookieJar({ [SESSION_COOKIE_NAME]: started.cookie.value })
	};
}

const SET_COOKIE_HEADERS = {
	'x-frame-options': 'DENY',
	'referrer-policy': 'strict-origin-when-cross-origin',
	'x-content-type-options': 'nosniff',
	'permissions-policy': 'camera=(), microphone=(), geolocation=()'
};

describe('hook order and the API origin check', () => {
	rollbackTest('puts the four security headers on a resolved response', async (db) => {
		const { handle } = pipeline(db);
		const response = await run(handle, makeEvent({ pathname: '/' }));

		for (const [name, value] of Object.entries(SET_COOKIE_HEADERS)) {
			expect(response.headers.get(name)).toBe(value);
		}
	});

	rollbackTest('rejects a /api mutation whose Origin host differs, as plain text 403', async (db) => {
		const { handle } = pipeline(db);
		const event = makeEvent({
			pathname: '/api/tasks',
			method: 'POST',
			origin: 'https://evil.test'
		});

		const response = await run(handle, event);

		expect(response.status).toBe(403);
		expect(await response.text()).toBe('Forbidden');
		// Headers are added outermost, so even a refused request carries them.
		expect(response.headers.get('x-frame-options')).toBe('DENY');
	});

	rollbackTest('rejects an Origin that does not parse', async (db) => {
		const { handle } = pipeline(db);
		const response = await run(
			handle,
			makeEvent({ pathname: '/api/tasks', method: 'POST', origin: 'not a url' })
		);

		expect(response.status).toBe(403);
	});

	rollbackTest('passes a same-host Origin, an absent Origin, a GET and a page POST', async (db) => {
		const { handle } = pipeline(db);
		const cases: EventInput[] = [
			{ pathname: '/api/tasks', method: 'POST', origin: `http://${HOST}` },
			{ pathname: '/api/tasks', method: 'POST' },
			{ pathname: '/api/tasks', origin: 'https://evil.test' },
			{ pathname: '/calendar', method: 'POST', origin: 'https://evil.test' }
		];

		for (const input of cases) {
			const response = await run(handle, makeEvent(input));
			expect(response.status).toBe(200);
		}
	});

	rollbackTest('checks a JSON body on a non-mutating method too', async (db) => {
		const { handle } = pipeline(db);
		const response = await run(
			handle,
			makeEvent({
				pathname: '/api/tasks',
				method: 'OPTIONS',
				contentType: 'application/json; charset=utf-8',
				origin: 'https://evil.test'
			})
		);

		expect(response.status).toBe(403);
	});
});

describe('Bearer tokens (only on /api/*)', () => {
	rollbackTest('authenticates a valid token with no session and touches lastUsedAt', async (db) => {
		const { ctx, handle } = pipeline(db);
		const person = await seedUser(db);
		const minted = await mintApiToken(ctx, actorFromUser(person, 'session'), { name: 'Phone' });
		const event = makeEvent({ pathname: '/api/tasks', auth: `Bearer ${minted.token}` });

		const response = await run(handle, event);

		expect(await response.text()).toBe(`ok:${person.id}`);
		expect(event.locals.user?.id).toBe(person.id);
		expect(event.locals.session).toBeNull();
		expect(event.locals.actor).toMatchObject({ id: person.id, via: 'token' });
		const [stored] = await db.select().from(apiTokens);
		expect(stored.lastUsedAt).toEqual(new Date(NOW));
	});

	rollbackTest('answers 401 JSON for an unknown token and never resolves', async (db) => {
		const { handle } = pipeline(db);
		const event = makeEvent({ pathname: '/api/tasks', auth: 'Bearer fp_not_a_real_token' });
		let resolved = false;

		const response = await run(handle, event, () => {
			resolved = true;
			return new Response('ok');
		});

		expect(response.status).toBe(401);
		expect(await response.json()).toEqual({ error: 'Unauthorized' });
		expect(response.headers.get('x-content-type-options')).toBe('nosniff');
		expect(resolved).toBe(false);
	});

	rollbackTest('ignores a Bearer header off /api/* — page routes stay cookie-only', async (db) => {
		const { ctx, handle } = pipeline(db);
		const person = await seedUser(db);
		const minted = await mintApiToken(ctx, actorFromUser(person, 'session'), { name: 'Phone' });
		const event = makeEvent({ pathname: '/calendar', auth: `Bearer ${minted.token}` });

		await run(handle, event);

		expect(event.locals.user).toBeNull();
		const [stored] = await db.select().from(apiTokens);
		expect(stored.lastUsedAt).toBeNull();
	});

	rollbackTest('leaves the cookie path untouched when there is no Bearer header', async (db) => {
		const { handle } = pipeline(db);
		const event = makeEvent({ pathname: '/api/tasks' });

		const response = await run(handle, event);

		expect(event.locals.user).toBeNull();
		expect(await response.text()).toBe('ok:anon');
	});
});

describe('Anonymous Account fallback', () => {
	rollbackTest('creates an account + session for a document navigation on a protected route', async (db) => {
		const { handle } = pipeline(db);
		const event = makeEvent({ pathname: '/calendar', accept: 'text/html' });

		const response = await run(handle, event);

		expect(response.status).toBe(200);
		const [person] = await db.select().from(users);
		expect(event.locals.user?.id).toBe(person.id);
		expect(event.locals.user?.email).toContain('@anonymous.placeholder.invalid');
		expect(event.locals.session?.userId).toBe(person.id);
		expect(event.locals.actor).toMatchObject({ id: person.id, via: 'session' });

		const setCookie = event.cookies.setCalls.find((call) => call.name === SESSION_COOKIE_NAME);
		const [token, signature] = (setCookie?.value ?? '').split('.');
		expect(token).toBe(event.locals.session?.token);
		expect(signature).toHaveLength(44);
		expect(event.cookies.setCalls).toHaveLength(1);
		const sessions = await db.select().from(authSession);
		expect(sessions).toHaveLength(1);
	});

	rollbackTest('creates nothing for a non-document request (prefetch, API, non-HTML)', async (db) => {
		const { handle } = pipeline(db);
		const cases: EventInput[] = [
			{ pathname: '/calendar', method: 'POST', accept: 'text/html' },
			{ pathname: '/calendar' },
			{ pathname: '/api/events', accept: 'text/html' },
			{ pathname: '/login', accept: 'text/html' }
		];

		for (const input of cases) {
			const event = makeEvent(input);
			await run(handle, event);
			expect(event.locals.user).toBeNull();
			expect(event.cookies.setCalls).toHaveLength(0);
		}
		expect(await db.select().from(users)).toHaveLength(0);
	});
});

describe('cookie path', () => {
	rollbackTest('populates locals from a live cookie without re-issuing it', async (db) => {
		const { ctx, handle } = pipeline(db);
		const { person, cookie } = await signedIn(db, ctx, { lastActiveAt: new Date(NOW) });
		const event = makeEvent({ pathname: '/account', accept: 'text/html', cookies: cookie });

		const response = await run(handle, event);

		expect(await response.text()).toBe(`ok:${person.id}`);
		expect(event.locals.user?.id).toBe(person.id);
		expect(event.locals.session?.userId).toBe(person.id);
		expect(event.locals.actor).toMatchObject({ id: person.id, via: 'session' });
		expect(cookie.setCalls).toHaveLength(0);
	});

	rollbackTest('re-issues the cookie when the session row is fresh (past the 24h roll)', async (db) => {
		const { ctx, handle } = pipeline(db);
		const { cookie } = await signedIn(db, ctx, { lastActiveAt: new Date(NOW) });
		const presented = cookie.get(SESSION_COOKIE_NAME);
		ctx.clock.advanceMs(25 * HOUR_MS);
		const event = makeEvent({ pathname: '/account', cookies: cookie });

		await run(handle, event);

		expect(event.locals.session?.fresh).toBe(true);
		expect(cookie.setCalls).toHaveLength(1);
		expect(cookie.setCalls[0]).toMatchObject({
			name: SESSION_COOKIE_NAME,
			value: presented
		});
	});

	rollbackTest('cascades a blank cookie and nulls locals when the value is invalid', async (db) => {
		const { handle } = pipeline(db);
		const cookie = makeCookieJar({ [SESSION_COOKIE_NAME]: 'ghost.sig' });
		const event = makeEvent({ pathname: '/api/anything', cookies: cookie });

		await run(handle, event);

		expect(event.locals.user).toBeNull();
		expect(event.locals.session).toBeNull();
		expect(event.locals.actor).toBeNull();
		expect(cookie.setCalls).toEqual([
			{
				name: SESSION_COOKIE_NAME,
				value: '',
				options: expect.objectContaining({ maxAge: 0 })
			}
		]);
		expect(await db.select().from(users)).toHaveLength(0);
	});

	rollbackTest('touches lastActiveAt at most once per hour', async (db) => {
		const { ctx, handle } = pipeline(db);
		const { person, cookie } = await signedIn(db, ctx, {
			lastActiveAt: new Date('2026-04-01T10:00:00.000Z')
		});

		await run(handle, makeEvent({ pathname: '/account', cookies: cookie }));
		const [touched] = await db.select().from(users);
		expect(touched.lastActiveAt).toEqual(new Date(NOW));

		ctx.clock.advanceMs(HOUR_MS / 2);
		await run(handle, makeEvent({ pathname: '/account', cookies: cookie }));
		const [stillTouched] = await db.select().from(users);
		expect(stillTouched.lastActiveAt).toEqual(new Date(NOW));
		expect(stillTouched.id).toBe(person.id);
	});
});

describe('admin gate', () => {
	rollbackTest('redirects an anonymous admin request before creating an Anonymous Account', async (db) => {
		const { handle } = pipeline(db);
		const event = makeEvent({ pathname: '/admin/settings', accept: 'text/html' });

		const redirect = await redirectOf(run(handle, event));

		expect(redirect).toEqual({ status: 302, location: '/login' });
		expect(event.cookies.setCalls).toHaveLength(0);
		expect(await db.select().from(users)).toHaveLength(0);
	});

	rollbackTest('redirects a signed-in person without the admin role', async (db) => {
		const { ctx, handle } = pipeline(db);
		const { cookie } = await signedIn(db, ctx, { lastActiveAt: new Date(NOW), roles: [] });

		const redirect = await redirectOf(
			run(handle, makeEvent({ pathname: '/admin/bugs', accept: 'text/html', cookies: cookie }))
		);

		expect(redirect).toEqual({ status: 302, location: '/login' });
	});

	rollbackTest('serves an admin the admin page', async (db) => {
		const { ctx, handle } = pipeline(db);
		const { person, cookie } = await signedIn(db, ctx, {
			lastActiveAt: new Date(NOW),
			roles: ['admin']
		});

		const response = await run(
			handle,
			makeEvent({ pathname: '/admin/bugs', accept: 'text/html', cookies: cookie })
		);

		expect(await response.text()).toBe(`ok:${person.id}`);
	});

	// The route gate itself, on the same paths the pipeline passes it.
	it('matches by segment: /disclaimer is not /claim, and every admin path is protected', () => {
		expect(isProtectedRoute('/disclaimer')).toBe(false);
		expect(isProtectedRoute('/claim')).toBe(true);
		expect(isAdminRoute('/api/admin/bugs')).toBe(true);
		expect(isAdminRoute('/calendar')).toBe(false);
	});
});

describe('handleError auto-filing (issue 153)', () => {
	/** The production wiring: `handleError` files through feedback's service on this transaction. */
	function errorHandler(db: Db) {
		const handleError = createAppHandleError(pipeline(db).ctx);
		return async (
			status: number,
			message: string,
			user: { id: string } | null,
			pathname = '/account'
		): Promise<void> => {
			await handleError({
				status,
				error: new Error(message),
				event: { url: new URL(`http://localhost${pathname}`), locals: { user } }
			});
		};
	}

	rollbackTest('never files for an unauthenticated caller (attacker-generated noise)', async (db) => {
		const call = errorHandler(db);

		await call(500, 'Cannot read properties of null (reading id)', null);

		expect(await db.select().from(bugReports)).toHaveLength(0);
	});

	rollbackTest('never files for a 404', async (db) => {
		const call = errorHandler(db);
		const person = await seedUser(db);

		await call(404, 'Not found', { id: person.id });

		expect(await db.select().from(bugReports)).toHaveLength(0);
	});

	rollbackTest('files an authenticated 500, keyed to the user and the path area', async (db) => {
		const call = errorHandler(db);
		const person = await seedUser(db);

		await call(500, 'genuine app failure', { id: person.id }, '/calendar');

		const rows = await db.select().from(bugReports);
		expect(rows).toHaveLength(1);
		expect(rows[0]).toMatchObject({
			userId: person.id,
			area: 'calendar',
			description: '[auto-filed 500] genuine app failure',
			url: '/calendar'
		});
	});

	rollbackTest('throttles repeated identical authenticated failures', async (db) => {
		const call = errorHandler(db);
		const person = await seedUser(db);

		await call(500, 'same failure', { id: person.id }, '/calendar');
		await call(500, 'same failure', { id: person.id }, '/calendar');

		expect(await db.select().from(bugReports)).toHaveLength(1);
	});
});
