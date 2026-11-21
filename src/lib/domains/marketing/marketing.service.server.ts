/**
 * The contact use case: one visitor submit, from the per-client budget through
 * the mail that leaves the building.
 *
 * `sendContactMessage` is the reference shape for a PUBLIC ANONYMOUS surface —
 * `(ctx, actor | null, request)` — so identity's and access's anonymous entry
 * points reuse it instead of growing a second anonymous writer. The actor is
 * null for every marketing caller; the parameter exists to keep the shape.
 *
 * Order matters and it is the legacy order:
 *   budget → read the form → check it through the contract → send.
 * The budget is spent BEFORE the form is read (a bot that never fills a form
 * still burns its quota; the legacy gate ran first too), and a refusal
 * (honeypot, missing field, address shape) is an `AppError` with the wire copy.
 *
 * One surface (Q-068: the page posts to the `/api` action): the 3-per-15-min
 * budget and `ContactApiBody` are the service's own, and the scope (`contact`)
 * stays what the legacy `clientKey(request, 'contact')` was, so the buckets are
 * the same process-wide ones.
 *
 * A mail-provider rejection is NOT a refusal: it is thrown as a plain error, so
 * the boundary logs and files it as a fault and answers with its own fixed 500
 * copy (`contactEndpoint`'s `failMessage`).
 *
 * Doc: ./README.md#invariants
 */
import type { Actor } from '$lib/kernel/ctx/actor';
import type { Ctx } from '$lib/kernel/ctx/ctx.server';
import { invalid, tooMany } from '$lib/kernel/errors/appError';
import { formFields } from '$lib/kernel/http/pageHandlers.server';
import { clientKeyOf } from '$lib/kernel/ratelimit/rateLimiter';
import { firstIssueMessage } from '$lib/kernel/validation/validators';
import { CONTACT_THROTTLED_MESSAGE, ContactApiBody } from './marketing.contract';
import { CONTACT_RECIPIENT, contactMessageHtml, contactSubject } from './marketing.mail.rules';

/** 3 sends per 15 minutes per client IP (the legacy `/api/contact` gate). */
const CONTACT_LIMIT = 3;
const CONTACT_WINDOW_MS = 15 * 60 * 1000;

/** The legacy client-key scope: one mailbox, one bucket. */
const CONTACT_SCOPE = 'contact';

/**
 * One submit: spend a hit from the client's budget, read and check the form,
 * and mail it to the support inbox. Resolves when the provider accepted it.
 *
 * Throws `tooMany` when the budget is empty and `invalid` for a refused form,
 * so the boundary answers with the legacy 400/429 copy; a provider failure
 * rejects as-is (a fault at the boundary).
 */
export async function sendContactMessage(ctx: Ctx, _actor: Actor | null, request: Request): Promise<void> {
	const key = clientKeyOf(request, CONTACT_SCOPE);
	if (!ctx.limiter.allow(key, CONTACT_LIMIT, CONTACT_WINDOW_MS)) {
		throw tooMany(CONTACT_THROTTLED_MESSAGE);
	}

	const fields = formFields(await request.formData());
	const parsed = ContactApiBody.safeParse(fields);
	if (!parsed.success) throw invalid(firstIssueMessage(parsed.error));

	const { name, email, message } = parsed.data;
	await ctx.mail.send({
		to: CONTACT_RECIPIENT,
		from: ctx.config.mailFrom,
		subject: contactSubject(name),
		html: contactMessageHtml({ name, email, message })
	});
}
