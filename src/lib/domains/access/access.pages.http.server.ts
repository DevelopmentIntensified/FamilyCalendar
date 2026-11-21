/**
 * access pages http: the loads, form actions and email-link callbacks behind
 * the auth screens (`/login`, `/signup`, `/forgot-password`, `/claim`,
 * `/account/verify-email`, `/merge-guest`).
 *
 * Route files stay wiring-only (`export const load = loginPage`). Each handler
 * keeps the legacy route's exact answers: the load data the screens render,
 * the `fail(status, …)` bodies they read (`/account/verify-email` reads
 * `message`, the Claim form reads `error`), and the redirects — inline
 * (`302`/`303` with `Location`) or thrown, exactly where legacy threw.
 *
 * The guest stash is written here and nowhere else: `stashGuestFromCookies`
 * (the guest-merge service) remembers an arriving Anonymous Account's id in the
 * `guest_merge` cookie at the top of the flows legacy stashed, so
 * `/merge-guest` can offer the move once the person is signed in.
 *
 * `/family/invite/email` is here, not in family: it joins a membership (family's
 * `joinFamily`) but it also creates the person and its personal calendar, and
 * family ranks below calendar, so only access can compose both.
 *
 * Doc: ./README.md#public-interface
 */
import { fail, redirect, type ActionFailure, type RequestEvent } from '@sveltejs/kit';
import type { Ctx } from '$lib/kernel/ctx/ctx.server';
import { isAppError } from '$lib/kernel/errors/appError';
import { endpoint } from '$lib/kernel/http/endpoint.server';
import { pageLoad, formAction } from '$lib/kernel/http/pageHandlers.server';
import { clientKeyOf } from '$lib/kernel/ratelimit/rateLimiter';
import { getPerson, type SessionCookie } from '$lib/domains/identity/index.server';
import { CALENDAR_LANDING_PATH, authRedirectTarget, EMAIL_LINK_LANDING_PATH } from './access.redirect.rules';
import { isGuestPerson, isRegisteredPerson } from './access.person.rules';
import { claimEmail } from './access.claim.rules';
import { CLAIM_SEND_FAILED_MESSAGE, EMAIL_CHANGE_SEND_FAILED_MESSAGE } from './access.contract';
import { clientIpOf, sessionCookieHeader } from './access.http.server';
import { completeEmailLoginLink } from './access.login.service.server';
import { completeEmailSignupLink } from './access.signup.service.server';
import { confirmClaim, requestClaim } from './access.claim.service.server';
import {
	GUEST_MERGE_COOKIE,
	guestDataCounts,
	isClaimableGuest,
	mergeGuest,
	stashGuestFromCookies
} from './access.guestMerge.service.server';
import { requestEmailChange, verifyEmailChange } from './access.account.service.server';
import {
	INVITE_EMAIL_INVALID_TOKEN,
	INVITE_EMAIL_INVALID_TOKEN_MESSAGE,
	INVITE_EMAIL_JOINED_MESSAGE,
	INVITE_EMAIL_MISSING_TOKEN,
	INVITE_EMAIL_MISSING_TOKEN_MESSAGE,
	INVITE_EMAIL_SKIP_ACTION,
	INVITE_EMAIL_UNAVAILABLE_MESSAGE,
	InviteEmailForm,
	inviteEmailPasswordRefusal
} from './access.inviteEmail.rules';
import { acceptInviteEmail, readInviteEmailToken } from './access.inviteEmail.service.server';

// --- `/login` and `/signup` -------------------------------------------------

/** The `/login` page's data (`login/+page.server.ts:6-15`). */
export type LoginPageData = {
	readonly isLoggedIn: boolean;
	readonly mergeMode: boolean;
	readonly redirectTo: string;
};

/** `/login` — the signed-in state, the merge banner and the landing target. */
export const loginPage = pageLoad<'optional', LoginPageData>({
	auth: 'optional',
	handle: async ({ actor, event }) => ({
		isLoggedIn: isRegisteredPerson(actor),
		// `?merge=1` keeps the form up even though the guest has a session.
		mergeMode: event.url.searchParams.get('merge') === '1',
		redirectTo: authRedirectTarget(event.url.searchParams.get('redirect'), CALENDAR_LANDING_PATH)
	})
});

/** The `/signup` page's data (`signup/+page.server.ts`). */
export type SignupPageData = {
	readonly isLoggedIn: boolean;
	readonly redirectTo: string;
};

/** `/signup` — the signed-in state and the landing target. */
export const signupPage = pageLoad<'optional', SignupPageData>({
	auth: 'optional',
	handle: async ({ actor, event }) => ({
		isLoggedIn: isRegisteredPerson(actor),
		redirectTo: authRedirectTarget(event.url.searchParams.get('redirect'), CALENDAR_LANDING_PATH)
	})
});

// --- Email-link callbacks ---------------------------------------------------

/** A bare `302` with `Location` — the legacy callbacks' own answer shape. */
function redirectResponse(location: string): Response {
	return new Response(null, { status: 302, headers: { Location: location } });
}

/** A `302` that also carries the fresh session cookie. */
function redirectWithCookie(location: string, cookie: SessionCookie): Response {
	return new Response(null, {
		status: 302,
		headers: { Location: location, 'Set-Cookie': sessionCookieHeader(cookie) }
	});
}

/** `GET /login/email/callback?token` — 302 with the session cookie. */
export const loginCallback = endpoint({
	auth: 'public',
	handle: async ({ ctx, event }) => {
		await stashGuestFromCookies(ctx, event.cookies);
		const result = await completeEmailLoginLink(ctx, {
			token: event.url.searchParams.get('token'),
			actor: event.locals.actor ?? null,
			sessionId: event.locals.session?.id ?? null
		});
		if (result.outcome === 'signed-in') {
			return redirectWithCookie(result.redirectTo, result.cookie);
		}
		return redirectResponse(
			`/login?error=${encodeURIComponent('The token provided was not valid, please try again.')}`
		);
	}
});

/** `GET /signup/email/callback?token` — 302 with the session cookie. */
export const signupCallback = endpoint({
	auth: 'public',
	handle: async ({ ctx, event }) => {
		await stashGuestFromCookies(ctx, event.cookies);
		const result = await completeEmailSignupLink(ctx, {
			token: event.url.searchParams.get('token'),
			actor: event.locals.actor ?? null
		});
		if (result.outcome === 'signed-in') {
			return redirectWithCookie(result.redirectTo, result.cookie);
		}
		if (result.outcome === 'already-signed-in') return redirectResponse(EMAIL_LINK_LANDING_PATH);
		return redirectResponse(
			`/signup?error=${encodeURIComponent('The token provided was not valid, please try again.')}`
		);
	}
});

// --- `/claim` ---------------------------------------------------------------

/** `/claim` — signed in, and still an Anonymous Account. */
export const claimPage = pageLoad({
	auth: 'user',
	handle: async ({ actor }) => {
		if (isRegisteredPerson(actor)) throw redirect(302, CALENDAR_LANDING_PATH);
		return {};
	}
});

/** The Claim form's answer: the address it asked about, normalised. */
export type ClaimRequestActionData = { readonly success: true; readonly email: string };

/** `/claim?/request` — the guests-only claim link request. */
export const claimRequestAction = formAction({
	auth: 'optional',
	failMessage: CLAIM_SEND_FAILED_MESSAGE,
	handle: async ({
		ctx,
		actor,
		event
	}): Promise<ClaimRequestActionData | ActionFailure<{ success: false; error: string }>> => {
		if (!actor) {
			return fail<{ success: false; error: string }>(401, {
				success: false,
				error: 'Not signed in'
			});
		}
		const rawEmail = (await event.request.formData()).get('email');
		const result = await requestClaim(ctx, actor, {
			email: rawEmail,
			clientIp: clientIpOf(event.request),
			baseUrl: ctx.config.siteUrl
		});
		if (!result.sent) {
			return fail<{ success: false; error: string }>(500, {
				success: false,
				error: CLAIM_SEND_FAILED_MESSAGE
			});
		}
		return { success: true, email: claimEmail(rawEmail) };
	}
});

/** The standalone confirm page `GET /claim/verify/[token]` renders. */
function claimConfirmPage(token: string): Response {
	const action = `/claim/verify/${encodeURIComponent(token)}`;
	const body = `<!doctype html>
<html lang="en"><head><meta charset="utf-8" /><title>Save your calendar</title></head>
<body style="margin:0;font-family:system-ui,sans-serif;background:#f8fafc;color:#0f172a;">
<div style="max-width:28rem;margin:4rem auto;padding:0 1.5rem;">
<h1 style="font-size:1.5rem;margin:0 0 .75rem;">Save your calendar</h1>
<p style="font-size:.875rem;color:#475569;margin:0 0 1.5rem;">Confirming will add your email to this device's calendar and sync it across devices. This link can be used once and expires in 15 minutes.</p>
<form method="POST" action="${action}"><button type="submit" style="width:100%;padding:.75rem;border:0;border-radius:9999px;background:#2563eb;color:#fff;font-weight:600;cursor:pointer;">Confirm claim</button></form>
<p style="text-align:center;margin-top:1.5rem;"><a href="/claim" style="color:#64748b;font-size:.875rem;">Cancel</a></p>
</div></body></html>`;
	return new Response(body, {
		status: 200,
		headers: { 'content-type': 'text/html; charset=utf-8' }
	});
}

/** `GET /claim/verify/[token]` — renders the confirm page; it never burns. */
export const claimVerifyPage = endpoint({
	auth: 'optional',
	handle: async ({ actor, event }) => {
		if (!actor) throw redirect(302, '/login');
		return claimConfirmPage(event.params.token ?? '');
	}
});

/** `POST /claim/verify/[token]` — consumes the token and claims or merges. */
export const claimVerifyAction = endpoint({
	auth: 'optional',
	handle: async ({ ctx, actor, event }) => {
		if (!actor) throw redirect(302, '/login');
		const result = await confirmClaim(ctx, actor, { token: event.params.token ?? '' });
		if (result.outcome === 'invalid') throw redirect(302, '/claim?error=invalid');
		if (result.outcome === 'merged') {
			// The merge deleted the guest session; sign into the merged target.
			event.cookies.set(result.cookie.name, result.cookie.value, result.cookie.attributes);
		}
		throw redirect(302, '/calendar?claimed=1');
	}
});

// --- `/account` -------------------------------------------------------------

/** The action's legacy answer: `{success,message}` either way, plus the claim hint. */
export type ChangeEmailActionData = {
	readonly success: boolean;
	readonly message: string;
	readonly guestNeedsClaim?: boolean;
};

/**
 * `?/updateEmail` on `/account` — starts an email change: mails a 15-minute
 * code+link to the NEW address and binds the row to the current one. The page
 * reads `form.message` on success AND failure, so the failure body keeps that
 * field name (never the house `error`); the guest refusal also carries
 * `guestNeedsClaim` (legacy `accountData.requestEmailChange`).
 */
export const changeEmailAction = formAction({
	auth: 'user',
	handle: async ({
		ctx,
		actor,
		event
	}): Promise<ChangeEmailActionData | ActionFailure<ChangeEmailActionData>> => {
		try {
			// Legacy read its form inside the flow's own `try`, after the throttle.
			const form = await event.request.formData();
			const email = form.get('email');
			return await requestEmailChange(ctx, actor, {
				email: typeof email === 'string' ? email : '',
				clientKey: clientKeyOf(event.request, `email-change:${actor.id}`),
				siteUrl: ctx.config.siteUrl
			});
		} catch (cause) {
			if (isAppError(cause)) {
				return fail(cause.status, {
					success: false,
					message: cause.message,
					...(cause.extra.guestNeedsClaim === true ? { guestNeedsClaim: true } : {})
				});
			}
			// Legacy's own `try` answered the same 500 copy for any other fault.
			return fail(500, { success: false, message: EMAIL_CHANGE_SEND_FAILED_MESSAGE });
		}
	}
});

// --- `/account/verify-email` ------------------------------------------------

/** `/account/verify-email` — signed in; the page reads `?token` client-side. */
export const verifyEmailPage = pageLoad({
	auth: 'user',
	handle: async () => ({})
});

/** The action's legacy answer: `{success,message}` either way. */
export type VerifyEmailActionData = {
	readonly success: boolean;
	readonly message: string;
};

/**
 * `?/verify` — the token or code path (identity-bound, single use). The page
 * reads `form.message` on success AND failure, so the failure body keeps that
 * field name (never the house `error`). Legacy's own `try` also swallowed the
 * unauthenticated `requireUser` throw into the 500 copy, which this keeps.
 */
export const verifyEmailAction = formAction({
	auth: 'optional',
	failMessage: 'Failed to verify email',
	handle: async ({
		ctx,
		actor,
		event
	}): Promise<VerifyEmailActionData | ActionFailure<VerifyEmailActionData>> => {
		const form = await event.request.formData();
		const token = form.get('token');
		const code = form.get('code');
		// Legacy's own `try` swallowed the unauthenticated `requireUser` throw
		// into the 500 copy, which this keeps.
		if (!actor) return fail(500, { success: false, message: 'Failed to verify email' });
		try {
			return await verifyEmailChange(ctx, actor, {
				token: typeof token === 'string' ? token : '',
				code: typeof code === 'string' ? code : '',
				clientKey: clientKeyOf(event.request, 'verify-email-change')
			});
		} catch (cause) {
			if (isAppError(cause)) {
				return fail(cause.status, { success: false, message: cause.message });
			}
			// Legacy's own `try` answered the same 500 copy for any other fault.
			return fail(500, { success: false, message: 'Failed to verify email' });
		}
	}
});

// --- `/merge-guest` ---------------------------------------------------------

/** The merge prompt's data (`merge-guest/+page.server.ts:24-40`). */
export type MergeGuestPageData = {
	readonly guestEvents: number;
	readonly guestTasks: number;
	readonly accountFirstName: string;
};

/** The stashed guest id, only while it still names a claimable Anonymous Account. */
async function readGuestStash(ctx: Ctx, event: RequestEvent): Promise<string | null> {
	const guestId = event.cookies.get(GUEST_MERGE_COOKIE);
	if (!guestId) return null;
	return (await isClaimableGuest(ctx, guestId)) ? guestId : null;
}

/** `/merge-guest` — signed in, not a guest, with a stash that has data. */
export const mergeGuestPage = pageLoad({
	auth: 'user',
	handle: async ({ ctx, actor, event }): Promise<MergeGuestPageData> => {
		if (isGuestPerson(actor)) throw redirect(302, '/claim');
		const guestId = await readGuestStash(ctx, event);
		if (!guestId || guestId === actor.id) throw redirect(302, CALENDAR_LANDING_PATH);
		const counts = await guestDataCounts(ctx, guestId);
		if (counts.events + counts.tasks === 0) {
			// Nothing worth merging — clear the stash and move on.
			event.cookies.delete(GUEST_MERGE_COOKIE, { path: '/' });
			throw redirect(302, CALENDAR_LANDING_PATH);
		}
		// The greeting's first name: the session actor carries id/email only.
		const person = await getPerson(ctx, actor);
		return {
			guestEvents: counts.events,
			guestTasks: counts.tasks,
			accountFirstName: person.firstName ?? ''
		};
	}
});

/** `?/merge` — moves the stash's Events and Tasks, then lands on the calendar. */
export const mergeGuestAction = formAction({
	auth: 'optional',
	handle: async ({ ctx, actor, event }): Promise<never> => {
		if (!actor) throw redirect(302, '/login');
		const guestId = await readGuestStash(ctx, event);
		if (guestId && guestId !== actor.id) {
			const result = await mergeGuest(ctx, actor, { guestId, keep: true });
			if (result.events + result.tasks > 0) {
				throw redirect(302, `/calendar?merged=${result.events}&tasks=${result.tasks}`);
			}
		}
		event.cookies.delete(GUEST_MERGE_COOKIE, { path: '/' });
		throw redirect(302, CALENDAR_LANDING_PATH);
	}
});

/** `?/skip` — forgets the stash; the guest's rows stay where they are. */
export const mergeGuestSkipAction = formAction({
	auth: 'public',
	handle: async ({ event }): Promise<never> => {
		event.cookies.delete(GUEST_MERGE_COOKIE, { path: '/' });
		throw redirect(302, CALENDAR_LANDING_PATH);
	}
});

// --- `/family/invite/email` -------------------------------------------------

/** The invite page's data: the token plus the claims the heading prints. */
export type InviteEmailPageData = {
	readonly token: string;
	readonly email: string;
	readonly firstName: string;
	readonly lastName: string;
	readonly familyId: string;
};

/**
 * `GET /family/invite/email?token=…` — the emailed invite's password step. A
 * missing or undecodable token is a redirect to `/login` with the legacy
 * `error=` code, never a 404; the page itself needs no session.
 */
export const inviteEmailPageLoad = pageLoad<'public', InviteEmailPageData>({
	auth: 'public',
	handle: async ({ ctx, event }): Promise<InviteEmailPageData> => {
		const token = event.url.searchParams.get('token');
		if (!token) throw redirect(302, `/login?error=${INVITE_EMAIL_MISSING_TOKEN}`);
		const payload = await readInviteEmailToken(ctx, token);
		if (!payload) throw redirect(302, `/login?error=${INVITE_EMAIL_INVALID_TOKEN}`);
		return {
			token,
			email: payload.email,
			firstName: payload.firstName,
			lastName: payload.lastName,
			familyId: payload.familyId
		};
	}
});

/** The action's own refusal body: the legacy `{ error }`, read by the form's banner. */
type InviteEmailFailure = { readonly error: string };

/**
 * `POST /family/invite/email` — join through the token. The checks keep the
 * legacy order: missing token, then (password path) the length and the
 * confirmation, then the token itself, then the join. Success is a 303 —
 * `/family/<id>` for a newly created and signed-in person, `/login?notice=` for
 * an existing account (which is never signed in from the link), and
 * `/login?error=` for the one invite refusal.
 */
export const inviteEmailAcceptAction = formAction({
	auth: 'public',
	form: InviteEmailForm,
	handle: async ({
		ctx,
		form,
		event
	}): Promise<InviteEmailFailure | ActionFailure<InviteEmailFailure> | never> => {
		if (!form.token) return fail<InviteEmailFailure>(400, { error: INVITE_EMAIL_MISSING_TOKEN_MESSAGE });

		let password: string | undefined;
		if (form._action !== INVITE_EMAIL_SKIP_ACTION) {
			const refusal = inviteEmailPasswordRefusal(form.password, form.passwordConfirm);
			if (refusal) return fail<InviteEmailFailure>(400, { error: refusal });
			password = form.password;
		}

		const payload = await readInviteEmailToken(ctx, form.token);
		if (!payload) return fail<InviteEmailFailure>(400, { error: INVITE_EMAIL_INVALID_TOKEN_MESSAGE });

		const result = await acceptInviteEmail(ctx, { payload, ...(password ? { password } : {}) });
		if (result.outcome === 'unavailable') {
			throw redirect(303, `/login?error=${encodeURIComponent(INVITE_EMAIL_UNAVAILABLE_MESSAGE)}`);
		}
		if (result.outcome === 'joined-existing') {
			throw redirect(303, `/login?notice=${encodeURIComponent(INVITE_EMAIL_JOINED_MESSAGE)}`);
		}
		event.cookies.set(result.cookie.name, result.cookie.value, result.cookie.attributes);
		throw redirect(303, `/family/${encodeURIComponent(result.familyId)}`);
	}
});
