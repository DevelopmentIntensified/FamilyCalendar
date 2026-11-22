/**
 * The module's HTTP edge: the one `/api` route and the page loads/actions of
 * the `(marketing)` group. No SQL, no rules — the use case is
 * `sendContactMessage`, the view model is `androidRelease`, and the pricing
 * and checkout pages read billing's public services and family's list service.
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
import { FREE_PLAN_LIMITS, isPlanType, planTypeOrDefault } from '$lib/domains/billing/index';
import { listFamilies } from '$lib/domains/family/index.server';
import {
	getCheckoutQuote,
	listEligibleDiscounts,
	recordPlanView
} from '$lib/domains/billing/index.server';
import { endpoint, ok } from '$lib/kernel/http/endpoint.server';
import { formAction, pageLoad } from '$lib/kernel/http/pageHandlers.server';
import { androidRelease } from './marketing.android.rules';
import { CheckoutPurchaseForm, CONTACT_API_FAULT_MESSAGE } from './marketing.contract';
import {
	CHECKOUT_INVALID_MESSAGE,
	CHECKOUT_LOGIN_REDIRECT,
	CHECKOUT_NOT_AUTHENTICATED_MESSAGE,
	CHECKOUT_STUB_MESSAGE,
	checkoutPlanName,
	fullestFamilyMemberCount,
	type CheckoutPlanView
} from './marketing.pricing.rules';
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
		// SAFETY: form-encoded, and the budget is spent BEFORE the form is read
		// (legacy order), so neither a spec `body` (JSON) nor one parsed ahead of
		// `handle` fits. The service reads the form and parses it with
		// `ContactApiBody`, whose refusals are the 400 copy the golden pins.
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
 * `/pricing`: a signed-in visit records the `pricing_view` event (legacy
 * `trackPricingView(user.id, 'view')`), and the page gets the free card's
 * member number from billing's policy. The legacy load also read the viewer's
 * eligible discounts and quoted every plan; the page never rendered either, so
 * the port keeps only what the screen shows (see the sheet's Notes).
 */
export const pricingPageLoad = pageLoad({
	auth: 'optional',
	handle: async ({ ctx, actor }) => {
		if (actor) recordPlanView(ctx, actor, 'view');
		return { memberLimit: FREE_PLAN_LIMITS.memberLimit };
	}
});

/**
 * `/checkout`: signed-in only, with the legacy `?redirect=` way back (a kernel
 * `auth: 'user'` load would drop the query string). The quote and the
 * discount list are billing's; the family count it needs is the fullest
 * family's member count (Q-017 B), read through family's list service because
 * billing may not read the family tables.
 */
export const checkoutPageLoad = pageLoad({
	auth: 'optional',
	handle: async ({ ctx, actor, event }) => {
		if (!actor) redirect(302, CHECKOUT_LOGIN_REDIRECT);

		const plan = planTypeOrDefault(event.url.searchParams.get('plan'));
		const families = await listFamilies(ctx, actor);
		const familyMemberCount = fullestFamilyMemberCount(families.families);

		// Sequential: the ctx db may be one transaction session (family's rule).
		const checkoutResult = await getCheckoutQuote(ctx, actor, { plan, familyMemberCount });
		const userDiscounts = await listEligibleDiscounts(ctx, actor, { familyMemberCount });
		const selectedPlan: CheckoutPlanView = {
			type: plan,
			name: checkoutPlanName(plan),
			price: checkoutResult.finalPrice
		};

		return { isLoggedIn: true, selectedPlan, checkoutResult, userDiscounts };
	}
});

/**
 * `POST /checkout?/purchase`: the stub. It refuses the two malformed posts with
 * the legacy sentences and never charges anyone; the provider call the legacy
 * action never made stays unwritten. Auth is `optional` because the legacy
 * action checked the person itself and answered a success body, not a 401.
 */
export const checkoutPurchaseAction = formAction({
	auth: 'optional',
	form: CheckoutPurchaseForm,
	handle: async ({ actor, form }) => {
		if (!actor) return { success: false, error: CHECKOUT_NOT_AUTHENTICATED_MESSAGE };

		const planType = isPlanType(form.planType) ? form.planType : null;
		const finalPrice = Number(form.finalPrice || 0);
		if (!planType || !finalPrice) return { success: false, error: CHECKOUT_INVALID_MESSAGE };

		return { success: false, message: CHECKOUT_STUB_MESSAGE };
	}
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
