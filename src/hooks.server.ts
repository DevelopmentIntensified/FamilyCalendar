import { lucia } from '$lib/server/auth';
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
				const sessionCookie = lucia.createSessionCookie(session.id);
				event.cookies.set(sessionCookie.name, sessionCookie.value, {
					path: '/',
					...sessionCookie.attributes
				});
				event.locals.user = anonUser;
				event.locals.session = session;
				return resolve(event);
			}
		}
		return resolve(event);
	}

	const { session, user } = await lucia.validateSession(sessionId);
	if (session && session.fresh) {
		const sessionCookie = lucia.createSessionCookie(session.id);
		// sveltekit types deviates from the de-facto standard
		// you can use 'as any' too
		event.cookies.set(sessionCookie.name, sessionCookie.value, {
			path: '.',
			...sessionCookie.attributes
		});
	}
	if (!session) {
		const sessionCookie = lucia.createBlankSessionCookie();
		event.cookies.set(sessionCookie.name, sessionCookie.value, {
			path: '.',
			...sessionCookie.attributes
		});
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
