import { lucia, setSessionCookie } from '$lib/server/auth';
import { redirect, type Handle } from '@sveltejs/kit';
import { sequence } from '@sveltejs/kit/hooks';
import { createAnonymousUser, touchLastActiveAt } from '$lib/server/db/actions/users';

const adminProtectedRoutes = ['admin'];
const protectedRoutes = ['calendar', 'account', 'claim', ...adminProtectedRoutes];

const LAST_ACTIVE_TOUCH_MS = 60 * 60 * 1000;

// Segment-based match: '/disclaimer' must not match 'claim', and any path
// containing 'calendar' as a substring must not match either.
function matchesRoute(pathname: string, routes: string[]): boolean {
	const segments = pathname.split('/');
	for (let i = 0; i < routes.length; i++) {
		if (segments.includes(routes[i])) return true;
	}
	return false;
}

function isAdminRoute(pathname: string): boolean {
	return matchesRoute(pathname, adminProtectedRoutes);
}

const sessionHandle: Handle = async ({ event, resolve }) => {
	const sessionId = event.cookies.get(lucia.sessionCookieName);
	if (!sessionId) {
		event.locals.user = null;
		event.locals.session = null;
		// Admin routes must never be served anonymously — gate BEFORE the
		// anonymous-account fallback below, otherwise POSTs would run ahead
		// of the (admin) layout's role check.
		if (isAdminRoute(event.url.pathname)) {
			return redirect(302, '/login');
		}
		// Only create the anonymous account for document navigations (GET +
		// text/html Accept). Prefetches, API calls and other non-HTML requests
		// skip creation — otherwise parallel first requests each create a
		// user+session while only one cookie survives, orphaning the data
		// created under the lost session. They get a 302/401 naturally or the
		// user retries after the document request sets the cookie.
		const isDocumentNavigation =
			event.request.method === 'GET' &&
			(event.request.headers.get('accept')?.includes('text/html') ?? false);
		if (isDocumentNavigation && matchesRoute(event.url.pathname, protectedRoutes)) {
			// Anonymous Account: silently create a server-side account
			// with no email so the app is usable immediately.
			const anonUser = await createAnonymousUser();
			const session = await lucia.createSession(anonUser.id, {});
			setSessionCookie(event.cookies, lucia.createSessionCookie(session.id));
			event.locals.user = anonUser;
			event.locals.session = session;
			return resolve(event);
		}
		return resolve(event);
	}

	const { session, user } = await lucia.validateSession(sessionId);
	if (session && session.fresh) {
		setSessionCookie(event.cookies, lucia.createSessionCookie(session.id));
	}
	if (!session) {
		setSessionCookie(event.cookies, lucia.createBlankSessionCookie());
	}
	if (session && user) {
		// Inactivity Window: any authenticated request counts as activity,
		// throttled to one write per hour.
		const lastActive = user.lastActiveAt ? new Date(user.lastActiveAt).getTime() : 0;
		if (Date.now() - lastActive > LAST_ACTIVE_TOUCH_MS) {
			await touchLastActiveAt(user.id);
		}
	}
	event.locals.user = user;
	event.locals.session = session;
	if (isAdminRoute(event.url.pathname) && !event.locals.user?.roles?.includes('admin')) {
		return redirect(302, '/login');
	}
	return resolve(event);
};

// Security headers on every response. No CSP here on purpose — inline scripts
// would break; that's a separate task.
const securityHeaders: Handle = async ({ event, resolve }) => {
	const res = await resolve(event);
	res.headers.set('X-Frame-Options', 'DENY');
	res.headers.set('Referrer-Policy', 'strict-origin-when-cross-origin');
	res.headers.set('X-Content-Type-Options', 'nosniff');
	res.headers.set('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
	return res;
};

const MUTATING_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

// CSRF defense-in-depth for the JSON API: SvelteKit's built-in check only
// rejects form-encoded cross-origin POSTs, so /api/* JSON mutations rely on
// SameSite=Lax alone. Browsers always send a parseable Origin on cross-site
// requests — if it's present and its host differs from the request's host,
// reject. Absent Origin (curl, server-to-server, same-origin fetches) passes.
const apiOriginCheck: Handle = async ({ event, resolve }) => {
	const isApiMutation =
		event.url.pathname.startsWith('/api/') &&
		event.request.method !== 'GET' &&
		(MUTATING_METHODS.has(event.request.method) ||
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

export const handle = sequence(securityHeaders, apiOriginCheck, sessionHandle);

// Expected 404s (bot probes like /xmlrpc.php, mistyped URLs) shouldn't
// spam the logs with stack traces — the styled error page still renders.
export const handleError = ({ status, error }: { status?: number; error: unknown }) => {
	if (status === 404) return;
	console.error(error);
};
