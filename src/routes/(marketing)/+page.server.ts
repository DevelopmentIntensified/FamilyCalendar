import { redirect } from '@sveltejs/kit';
import type { Actions } from './$types';

/**
 * Issue 276: the landing page has nothing to do with a POST, but a signed-in
 * browser posting to `/` used to get SvelteKit's 405 "No form actions exist
 * for this page" error page (and an auto-filed bug). No in-app form targets
 * `/` (#023/#059 sweeps, re-checked for #276), so answer with
 * Post/Redirect/Get back home and log the sender hints — the warn line keeps
 * the origin findable in the Vercel logs instead of masking it.
 */
export const actions: Actions = {
	default: async ({ request }) => {
		console.warn('[#276] stray POST /', {
			referer: request.headers.get('referer'),
			userAgent: request.headers.get('user-agent'),
			contentType: request.headers.get('content-type')
		});
		redirect(303, '/');
	}
};
