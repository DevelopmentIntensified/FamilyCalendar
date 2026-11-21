/**
 * The contact use case: one visitor submit, from the per-client budget through
 * the mail that leaves the building.
 *
 * `sendContactMessage` is the reference shape for a PUBLIC ANONYMOUS surface —
 * `(ctx, actor | null, input)` — so identity's and access's anonymous entry
 * points reuse it instead of growing a second anonymous writer. The actor is
 * null for every marketing caller; the parameter exists to keep the shape.
 *
 * Order matters and it is the legacy order:
 *   budget → read the form → check it through the surface's contract → send.
 * The budget is spent BEFORE the form is read (a bot that never fills a form
 * still burns its quota; the legacy gate ran first too), and a refusal
 * (honeypot, missing field, address shape) is an `AppError` with the wire copy.
 *
 * The two surfaces differ only in what their caller hands in: their budget
 * (`/api/contact` 3/15 min, `/contact` 5/10 min) and their contract
 * (`ContactApiBody` does not trim, `ContactFormBody` trims only for the
 * required check). The scope is shared (`contact`), exactly like the legacy
 * `clientKey(request, 'contact')`, so the buckets are the same process-wide.
 *
 * A mail-provider rejection is NOT a refusal: it is thrown as a plain error, so
 * the boundary logs and files it as a fault and answers with its own fixed 500
 * copy (`contactEndpoint`'s `failMessage` / `contactFormAction`'s).
 *
 * Doc: ./README.md#invariants
 */
import type { Actor } from '$lib/kernel/ctx/actor';
import type { Ctx } from '$lib/kernel/ctx/ctx.server';
import { invalid, tooMany } from '$lib/kernel/errors/appError';
import { formFields } from '$lib/kernel/http/pageHandlers.server';
import { clientKeyOf } from '$lib/kernel/ratelimit/rateLimiter';
import { firstIssueMessage } from '$lib/kernel/validation/validators';
import {
	CONTACT_THROTTLED_MESSAGE,
	ContactApiBody,
	ContactFormBody
} from './marketing.contract';
import {
	CONTACT_RECIPIENT,
	contactMessageHtml,
	contactSubject
} from './marketing.mail.rules';

/**
 * One contact surface's per-client budget. The scope is the service's
 * (`contact`, both surfaces); only the numbers differ.
 */
export type ContactBudget = {
	readonly limit: number;
	readonly windowMs: number;
};

/** The legacy client-key scope both contact surfaces share. */
const CONTACT_SCOPE = 'contact';

/** Everything the two surfaces hand the service: the request, its contract and its budget. */
export type ContactSendInput = {
	/** Read for the client IP and, after the budget allows, for the form. */
	readonly request: Request;
	/** The surface's contract: the checks, in the legacy order, with the wire copy. */
	readonly body: typeof ContactApiBody | typeof ContactFormBody;
	/** The surface's budget. */
	readonly budget: ContactBudget;
};

/**
 * One submit: spend a hit from the client's budget, read and check the form,
 * and mail it to the support inbox. Resolves when the provider accepted it.
 *
 * Throws `tooMany` when the budget is empty and `invalid` for a refused form,
 * so both surfaces answer with the legacy 400/429 copy; a provider failure
 * rejects as-is (a fault at the boundary).
 */
export async function sendContactMessage(
	ctx: Ctx,
	_actor: Actor | null,
	input: ContactSendInput
): Promise<void> {
	const key = clientKeyOf(input.request, CONTACT_SCOPE);
	if (!ctx.limiter.allow(key, input.budget.limit, input.budget.windowMs)) {
		throw tooMany(CONTACT_THROTTLED_MESSAGE);
	}

	const fields = formFields(await input.request.formData());
	const parsed = input.body.safeParse(fields);
	if (!parsed.success) throw invalid(firstIssueMessage(parsed.error));

	const { name, email, message } = parsed.data;
	await ctx.mail.send({
		to: CONTACT_RECIPIENT,
		from: ctx.config.mailFrom,
		subject: contactSubject(name),
		html: contactMessageHtml({ name, email, message })
	});
}
