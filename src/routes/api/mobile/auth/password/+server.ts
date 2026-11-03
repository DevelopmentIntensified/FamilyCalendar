import type { RequestEvent } from '@sveltejs/kit';
import {
	guarded,
	mobilePassword,
	mobileAuthDeps,
	type MobileAuthDeps
} from '$lib/server/services/mobileAuth';

// #288: cookie-free JSON sign-in for the Android app (contract in
// docs/issues/288-android-native-login.md). Logic lives in mobileAuth.
export const POST = async (
	event: RequestEvent,
	deps: MobileAuthDeps = mobileAuthDeps
): Promise<Response> => guarded(() => mobilePassword(event.request, deps));
