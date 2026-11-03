import type { RequestEvent } from '@sveltejs/kit';
import {
	guarded,
	mobileLogout,
	mobileAuthDeps,
	type MobileAuthDeps
} from '$lib/server/services/mobileAuth';

// #288: revokes the presented Bearer fp_ token only (hooks.server.ts has
// already resolved it to locals.user). Never touches sessions or cookies.
export const POST = async (
	event: RequestEvent,
	deps: MobileAuthDeps = mobileAuthDeps
): Promise<Response> => guarded(() => mobileLogout(event.request, event.locals.user, deps));
