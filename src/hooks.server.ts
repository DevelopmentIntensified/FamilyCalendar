import { lucia } from '$lib/server/auth';
import { redirect, type Handle } from '@sveltejs/kit';

const adminProtectedRoutes = ['admin'];
const protectedRoutes = ['calendar', ...adminProtectedRoutes];

export const handle: Handle = async ({ event, resolve }) => {
	const sessionId = event.cookies.get(lucia.sessionCookieName);
	if (!sessionId) {
		event.locals.user = null;
		event.locals.session = null;
		for (let i = 0; i < protectedRoutes.length; i++) {
			const route = protectedRoutes[i];
			if (event.url.pathname.includes(route)) {
				return redirect(302, '/login');
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
	event.locals.user = user;
	event.locals.session = session;
	console.log(user);
	for (let i = 0; i < adminProtectedRoutes.length; i++) {
		const route = adminProtectedRoutes[i];
		if (event.url.pathname.includes(route)) {
			return redirect(302, '/login');
		}
	}
	return resolve(event);
};
