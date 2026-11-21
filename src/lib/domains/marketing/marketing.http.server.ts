/**
 * The module's HTTP edge: the one `/api` route and the page loads/actions of
 * the `(marketing)` group. No SQL, no rules — the use case is
 * `sendContactMessage` and the view model is `androidRelease`.
 *
 * `/api/contact` is a form-action FILE (`src/routes/api/contact/+page.server.ts`)
 * with no page component: installed callers POST form-encoded data there and
 * read JSON back. It keeps that path and shape so the S2 golden imports the
 * same file and asks for `actions.default`. Since Q-068 (owner answer B) it is
 * also the page's only door — the `/contact` form posts here, so there is one
 * budget (3/15 min) and one 500 copy, and the separate page action is gone.
 *
 * A provider rejection is a FAULT (a plain error thrown by the mail port): the
 * endpoint leaves it to the kernel — logs it and files the report, as legacy
 * `apiError` did, with `failMessage` giving the copy.
 *
 * Doc: ./README.md#invariants
 */
import { redirect } from '@sveltejs/kit';
import published from '$lib/fdroid/published.json';
import { endpoint, ok } from '$lib/kernel/http/endpoint.server';
import { formAction, pageLoad } from '$lib/kernel/http/pageHandlers.server';
import { androidRelease } from './marketing.android.rules';
import { CONTACT_API_FAULT_MESSAGE } from './marketing.contract';
import { sendContactMessage } from './marketing.service.server';

/**
 * `POST /api/contact`: no sign-in, form-encoded, JSON answers.
 *
 * The service spends the budget before the form is read, refuses with the
 * contract's copy, and a provider failure is a fault that `failMessage` turns
 * into the legacy 500 body.
 */
export const contactEndpoint = endpoint({
	auth: 'public',
	failMessage: CONTACT_API_FAULT_MESSAGE,
	handle: async ({ ctx, actor, event }) => {
		await sendContactMessage(ctx, actor, event.request);
		return ok({ success: true });
	}
});

/**
 * The `(marketing)` layout load: the ORIGIN THE REQUEST ARRIVED ON (prod,
 * test.familyplanz.com and preview URLs all canonicalise to themselves — a
 * hardcoded domain would be worse than no canonical), plus the pathname, the
 * viewer the navbar needs, and the year the footer prints (from `ctx.clock`:
 * v2 code never reads the ambient clock, rule R5).
 */
export const marketingLayoutLoad = pageLoad({
	auth: 'public',
	handle: async ({ ctx, event }) => ({
		pathname: event.url.pathname,
		origin: event.url.origin,
		isLoggedIn: Boolean(event.locals.user),
		user: event.locals.user,
		year: ctx.clock.now().getUTCFullYear()
	})
});

/** `/android`: the committed publish record rendered through the android rules. */
export const androidPageLoad = pageLoad({
	auth: 'public',
	handle: async () => ({ release: androidRelease(published) })
});

/**
 * Issue 276: the landing page has nothing to do with a POST, but a stray one
 * used to meet SvelteKit's 405 "No form actions exist" error page (and an
 * auto-filed bug). No in-app form targets `/`, so answer Post/Redirect/Get and
 * log the sender hints — the warn line keeps the origin findable in the logs.
 */
export const strayRootPostAction = formAction({
	auth: 'public',
	handle: async ({ ctx, event }): Promise<never> => {
		ctx.log.warn('stray_root_post', {
			referer: event.request.headers.get('referer'),
			userAgent: event.request.headers.get('user-agent'),
			contentType: event.request.headers.get('content-type')
		});
		return redirect(303, '/');
	}
});
