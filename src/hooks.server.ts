import { lucia, setSessionCookie } from '$lib/server/auth';
import { redirect, type Handle } from '@sveltejs/kit';
import { createAnonymousUser, touchLastActiveAt } from '$lib/server/db/actions/users';

const adminProtectedRoutes = ['admin'];
const protectedRoutes = ['calendar', 'account', 'claim', ...adminProtectedRoutes];

const LAST_ACTIVE_TOUCH_MS = 60 * 60 * 1000;

export const handle: Handle = async ({ event, resolve }) => {
	const sessionId = event.cookies.get(lucia.sessionCookieName);
	if (!sessionId) {
		event.locals.user = null;
		event.locals.session = null;
		for (let i = 0; i < protectedRoutes.length; i++) {
			const route = protectedRoutes[i];
			if (event.url.pathname.includes(route)) {
				// Anonymous Account: silently create a server-side account
				// with no email so the app is usable immediately.
				const anonUser = await createAnonymousUser();
				const session = await lucia.createSession(anonUser.id, {});
				setSessionCookie(event.cookies, lucia.createSessionCookie(session.id));
				event.locals.user = anonUser;
				event.locals.session = session;
				return resolve(event);
			}
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
	for (let i = 0; i < adminProtectedRoutes.length; i++) {
		const route = adminProtectedRoutes[i];
		if (event.url.pathname.includes(route)) {
			return redirect(302, '/login');
		}
	}
	return resolve(event);
};

// Expected 404s (bot probes like /xmlrpc.php, mistyped URLs) shouldn't
// spam the logs with stack traces — the styled error page still renders.
export const handleError = ({ status, error }: { status?: number; error: unknown }) => {
	if (status === 404) return;
	console.error(error);
};
