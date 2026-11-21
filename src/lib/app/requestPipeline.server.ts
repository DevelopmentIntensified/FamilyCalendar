/**
 * The request pipeline: what `src/hooks.server.ts` used to hold, moved here by
 * APP-03. `src/hooks.server.ts` is wiring only now —
 *
 *   export const handle = appHandle;
 *   export const handleError = appHandleError;
 *
 * Composition is hand-written, not kit's `sequence()`: 2.70's helper resolves
 * hooks through an ALS request store that only exists inside a real server,
 * which breaks direct invocation (this file's test) and any non-server harness.
 * Nesting the resolves keeps the identical order: security headers → API
 * origin check → session. `locals.ctx` (the dependency bag) and
 * `locals.actor = null` are set first so every handler sees them.
 *
 * Every decision is a module rule or service, so this file only composes:
 * `resolveBearer` + `resolveSessionCookie` + `shouldCreateAnonymousAccount`
 * (identity), and `isAdminRoute` + `isProtectedRoute` (access).
 *
 * Doc: ./README.md#invariants
 */
import { redirect, type Cookies, type Handle } from '@sveltejs/kit';
import { isAdminRoute, isProtectedRoute } from '$lib/domains/access/index.server';
import { fileAutoBugReport } from '$lib/domains/feedback/index.server';
import {
	SESSION_COOKIE_NAME,
	createAnonymousAccount,
	resolveBearer,
	resolveSessionCookie,
	shouldCreateAnonymousAccount,
	startSession,
	type SessionCookie
} from '$lib/domains/identity/index.server';
import { actorFromUser } from '$lib/kernel/ctx/actor';
import type { Ctx } from '$lib/kernel/ctx/ctx.server';
import { runMigrations } from '$lib/kernel/db/migrations/migrationRunner.server';
import { appCtx } from './appCtx.server';

// Apply pending SQL migrations once per cold start, in the background, on
// whichever environment this code deploys (test or prod). Idempotent + locked.
// It ran at the top of `src/hooks.server.ts` before APP-03; the server imports
// this module through those two exports, so the timing is unchanged.
if (!process.env.DATABASE_DISABLE_MIGRATIONS) {
	void runMigrations(appCtx.db);
}

/** Security headers on every response. No CSP here on purpose — inline scripts would break; that's a separate task. */
const securityHeaders: Handle = async ({ event, resolve }) => {
	const res = await resolve(event);
	res.headers.set('X-Frame-Options', 'DENY');
	res.headers.set('Referrer-Policy', 'strict-origin-when-cross-origin');
	res.headers.set('X-Content-Type-Options', 'nosniff');
	res.headers.set('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
	return res;
};

/** Methods the origin check treats as mutations even without a JSON content type. */
const MUTATING_METHODS: Record<string, true> = {
	POST: true,
	PUT: true,
	PATCH: true,
	DELETE: true
};

// CSRF defense-in-depth for the JSON API: SvelteKit's built-in check only
// rejects form-encoded cross-origin POSTs, so /api/* JSON mutations rely on
// SameSite=Lax alone. Browsers always send a parseable Origin on cross-site
// requests — if it's present and its host differs from the request's host,
// reject. Absent Origin (curl, server-to-server, same-origin fetches) passes.
const apiOriginCheck: Handle = async ({ event, resolve }) => {
	const isApiMutation =
		event.url.pathname.startsWith('/api/') &&
		event.request.method !== 'GET' &&
		(MUTATING_METHODS[event.request.method] === true ||
			(event.request.headers.get('content-type')?.includes('application/json') ?? false));

	if (isApiMutation) {
		const origin = event.request.headers.get('origin');
		if (origin) {
			let originHost: string | null = null;
			try {
				originHost = new URL(origin).host;
			} catch {
				originHost = null;
			}
			if (!originHost || originHost !== event.url.host) {
				return new Response('Forbidden', { status: 403 });
			}
		}
	}
	return resolve(event);
};

/** Writes the one cookie identity's seams answer: name, value and its attributes. */
function writeCookie(cookies: Cookies, cookie: SessionCookie): void {
	cookies.set(cookie.name, cookie.value, cookie.attributes);
}

/**
 * The session hook: a personal API token on `/api/*` first, then the browser
 * session cookie, with the admin gate before the Anonymous Account fallback.
 */
function sessionPipeline(ctx: Ctx): Handle {
	return async ({ event, resolve }) => {
		const { pathname } = event.url;

		// Personal API tokens (TaskFocus): `Authorization: Bearer` on /api/*
		// authenticates as the token owner with no session. Invalid token →
		// 401 JSON (never a redirect). No Bearer header → cookie path below,
		// untouched. A Bearer header off /api/* is ignored: page routes stay
		// cookie-only.
		if (pathname.startsWith('/api/')) {
			const bearer = await resolveBearer(ctx, event.request.headers.get('authorization'));
			if (bearer.kind === 'invalid') {
				return new Response(JSON.stringify({ error: 'Unauthorized' }), {
					status: 401,
					headers: { 'content-type': 'application/json' }
				});
			}
			if (bearer.kind === 'person') {
				event.locals.user = bearer.person;
				event.locals.session = null;
				event.locals.actor = actorFromUser(bearer.person, 'token');
				return resolve(event);
			}
		}

		const cookieValue = event.cookies.get(SESSION_COOKIE_NAME);
		if (!cookieValue) {
			event.locals.user = null;
			event.locals.session = null;
			event.locals.actor = null;
			// Admin routes must never be served anonymously — gate BEFORE the
			// anonymous-account fallback below, otherwise POSTs would run ahead
			// of the (admin) layout's role check.
			if (isAdminRoute(pathname)) {
				return redirect(302, '/login');
			}
			// Only a document navigation on a protected route creates an
			// Anonymous Account (`shouldCreateAnonymousAccount`): a prefetch, an
			// API call or another non-HTML request would race the document
			// request and orphan the data created under the lost session.
			const anonymous = shouldCreateAnonymousAccount({
				method: event.request.method,
				accept: event.request.headers.get('accept'),
				isProtectedRoute: isProtectedRoute(pathname)
			});
			if (anonymous) {
				const person = await createAnonymousAccount(ctx);
				const started = await startSession(ctx, person.id);
				writeCookie(event.cookies, started.cookie);
				event.locals.user = person;
				// Legacy `createSession` returned the new row with `fresh: true`.
				event.locals.session = { ...started.session, fresh: true };
				event.locals.actor = actorFromUser(person, 'session');
			}
			return resolve(event);
		}

		const resolved = await resolveSessionCookie(ctx, cookieValue);
		if (resolved.cookie) writeCookie(event.cookies, resolved.cookie);
		event.locals.user = resolved.person;
		event.locals.session = resolved.session;
		event.locals.actor = resolved.person ? actorFromUser(resolved.person, 'session') : null;
		if (isAdminRoute(pathname) && !event.locals.actor?.isAdmin) {
			return redirect(302, '/login');
		}
		return resolve(event);
	};
}

/** Builds the `handle` hook over a ctx (production passes `appCtx`). */
export function createAppHandle(ctx: Ctx): Handle {
	const session = sessionPipeline(ctx);
	return async ({ event, resolve }) => {
		event.locals.ctx = ctx;
		event.locals.actor = null;
		return securityHeaders({
			event,
			resolve: (event) =>
				apiOriginCheck({
					event,
					resolve: (event) => session({ event, resolve })
				})
		});
	};
}

/** The fields of SvelteKit's error input this handler reads. */
export type AppHandleErrorInput = {
	readonly status?: number;
	readonly error: Error | string;
	readonly event?: {
		readonly url?: URL;
		readonly locals?: { readonly user?: { readonly id?: string } | null };
	};
};

/**
 * `handleError`: unexpected failures file a bug report so a 500 never vanishes
 * silently. Expected 404s (bot probes, mistyped URLs) skip the log — the
 * styled error page still renders — and unauthenticated callers are never
 * filed (#153: a crash reachable without a session is attacker noise).
 *
 * Filing goes to feedback's `fileAutoBugReport` — the same service
 * `ctx.faults.report` wires for `endpoint()`'s 5xx, so one throttle covers
 * both — and is awaited, as legacy awaited `createBugReport`: the report must
 * land before the error response ends, or a serverless freeze drops it. The
 * call sits in legacy's own try/catch fence, so a throw BEFORE that service's
 * internal catch (a hostile `message` getter, a broken event) can never escape
 * `handleError` and break the error response.
 */
export function createAppHandleError(
	ctx: Ctx
): (input: AppHandleErrorInput) => Promise<void> {
	return async ({ status, error, event }) => {
		if (status === 404) return;
		console.error(error);
		const userId = event?.locals?.user?.id ?? null;
		if (!userId) return;
		// Auto-filing is best-effort by design.
		try {
			await fileAutoBugReport(ctx, {
				status: status ?? 500,
				message: error instanceof Error ? error.message : String(error),
				path: event?.url?.pathname ?? '',
				userId
			});
		} catch {
			// The response is already an error; a failed report must not become one.
		}
	};
}

/** The production hooks: `src/hooks.server.ts` exports these two as-is. */
export const appHandle = createAppHandle(appCtx);
export const appHandleError = createAppHandleError(appCtx);
