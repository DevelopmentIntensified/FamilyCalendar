/**
 * The module's HTTP edge: the one `/api` route and the page loads/actions of
 * the `(marketing)` group. No SQL, no rules — the use case is
 * `sendContactMessage` and the view model is `androidRelease`.
 *
 * `/api/contact` is a form-action FILE (`src/routes/api/contact/+page.server.ts`)
 * with no page component: installed callers POST form-encoded data there and
 * read JSON back. It keeps that path and shape so the S2 golden imports the
 * same file and asks for `actions.default`.
 *
 * Each surface fixes its own budget and its own 500 copy:
 *   · `/api/contact` — 3/15 min, `Failed to send message. Please try again later.`
 *   · `/contact`     — 5/10 min, `Something went wrong. Please try again.`
 * A provider rejection is a FAULT on both (a plain error thrown by the mail
 * port). The endpoint leaves it to the kernel — logs it and files the report,
 * as legacy `apiError` did, with `failMessage` giving the copy. `/contact`'s
 * action catches it and answers its own `fail`, because legacy did not file a
 * report for a provider outage on this page.
 *
 * Doc: ./README.md#invariants
 */
import { fail, redirect } from '@sveltejs/kit';
import published from '$lib/fdroid/published.json';
import { isAppError } from '$lib/kernel/errors/appError';
import { endpoint, ok } from '$lib/kernel/http/endpoint.server';
import { formAction, pageLoad } from '$lib/kernel/http/pageHandlers.server';
import { androidRelease } from './marketing.android.rules';
import {
	CONTACT_API_FAULT_MESSAGE,
	CONTACT_FORM_FAULT_MESSAGE,
	ContactApiBody,
	ContactFormBody
} from './marketing.contract';
import { sendContactMessage, type ContactBudget } from './marketing.service.server';

/** 3 sends per 15 minutes per client IP (legacy `/api/contact`). */
const API_CONTACT_BUDGET: ContactBudget = { limit: 3, windowMs: 15 * 60 * 1000 };

/** 5 sends per 10 minutes per client IP (legacy `/contact`). */
const FORM_CONTACT_BUDGET: ContactBudget = { limit: 5, windowMs: 10 * 60 * 1000 };

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
		await sendContactMessage(ctx, actor, {
			request: event.request,
			body: ContactApiBody,
			budget: API_CONTACT_BUDGET
		});
		return ok({ success: true });
	}
});

/**
 * The `/contact` page's default action: the same use case, its own budget and
 * its own 500 copy. The 500 is a plain form failure — legacy did not file a
 * bug report for a provider outage on this page, and the copy is the page's
 * (`Something went wrong. Please try again.`), not the `/api` sentence.
 */
export const contactFormAction = formAction({
	auth: 'public',
	handle: async ({ ctx, actor, event }) => {
		try {
			await sendContactMessage(ctx, actor, {
				request: event.request,
				body: ContactFormBody,
				budget: FORM_CONTACT_BUDGET
			});
		} catch (error) {
			// A refusal keeps its 400/429 and goes to the kernel's handler; only a
			// provider fault becomes this page's 500, without a filed report.
			if (isAppError(error)) throw error;
			return fail(500, { success: false, error: CONTACT_FORM_FAULT_MESSAGE });
		}
		return { success: true };
	}
});

/**
 * The `(marketing)` layout load: the ORIGIN THE REQUEST ARRIVED ON (prod,
 * test.familyplanz.com and preview URLs all canonicalise to themselves — a
 * hardcoded domain would be worse than no canonical), plus the pathname and
 * the viewer the navbar needs.
 */
export const marketingLayoutLoad = pageLoad({
	auth: 'public',
	handle: async ({ event }) => ({
		pathname: event.url.pathname,
		origin: event.url.origin,
		isLoggedIn: Boolean(event.locals.user),
		user: event.locals.user
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
