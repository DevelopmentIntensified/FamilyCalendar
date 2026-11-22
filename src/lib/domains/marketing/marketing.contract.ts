/**
 * marketing contract: the zod schema and types for `POST /api/contact` (the
 * module's one contact surface) and its response bodies.
 *
 * One surface since Q-068 (owner answer B): the `/contact` page posts to the
 * `/api` action, so the second body and its 5/10-minute budget are gone. The
 * page and an installed client share this schema, this budget and this copy.
 *
 * The error copy is the wire: the golden tests pin it
 * (`marketing.http.db.test.ts`). Keep the legacy wording.
 *
 * The form is read the way the legacy action read `FormData`: the first value
 * of a field, and a missing or non-string (file) value is `''`. Nothing is
 * trimmed — a whitespace-only message is a message. The checks run in the
 * legacy order and the first failure is the answer: honeypot, then "all
 * fields", then the address shape.
 *
 * Doc: ./README.md#invariants
 */
import { z } from '$lib/kernel/validation/validators';
import { isContactEmail } from './marketing.mail.rules';

// --- Wire copy --------------------------------------------------------------

/** 429, `POST /api/contact`. */
export const CONTACT_THROTTLED_MESSAGE = 'Too many attempts. Try again shortly.';

/** 400 when the hidden `website` field is filled. */
export const CONTACT_HONEYPOT_MESSAGE = 'Invalid submission';

/** 400 when name, email or message is empty. */
export const CONTACT_REQUIRED_MESSAGE = 'All fields are required';

/** 400 when the address has no recognisable shape. */
export const CONTACT_EMAIL_MESSAGE = 'Please enter a valid email address';

/** The 500 body of `POST /api/contact` when the mail provider fails. */
export const CONTACT_API_FAULT_MESSAGE = 'Failed to send message. Please try again later.';

// --- Request body -----------------------------------------------------------

/** A form field as the legacy `formString` read it: first value; absent or non-string is `''`. */
const formText = z.preprocess((value) => {
	const first = Array.isArray(value) ? value[0] : value;
	return typeof first === 'string' ? first : '';
}, z.string());

const ContactFields = z.object({
	website: formText,
	name: formText,
	email: formText,
	message: formText
});

/**
 * `POST /api/contact`, form-encoded. Honeypot, then "all fields", then the
 * address shape; a message is filled when it is non-empty (a whitespace-only
 * one is sent).
 */
export const ContactApiBody = ContactFields.refine((fields) => fields.website === '', {
	error: CONTACT_HONEYPOT_MESSAGE,
	abort: true
})
	.refine((fields) => fields.name !== '' && fields.email !== '' && fields.message !== '', {
		error: CONTACT_REQUIRED_MESSAGE,
		abort: true
	})
	.refine((fields) => isContactEmail(fields.email), { error: CONTACT_EMAIL_MESSAGE });
export type ContactApiBody = z.infer<typeof ContactApiBody>;

// --- Responses --------------------------------------------------------------

/** `200 {success:true}`. */
export const ContactSentResponse = z.object({ success: z.literal(true) });
export type ContactSentResponse = z.infer<typeof ContactSentResponse>;

// --- Checkout purchase form -------------------------------------------------

/**
 * `POST /checkout?/purchase`: the stub reads two fields and never charges. Both
 * are text exactly as `formData.get` gave them; the action owns the 400 copy
 * (`planType` must be one of the three, `finalPrice` must be truthy) and the
 * `Number()` read, so a blank price is the same `Invalid purchase data` it was.
 */
export const CheckoutPurchaseForm = z.object({ planType: formText, finalPrice: formText });
export type CheckoutPurchaseForm = z.infer<typeof CheckoutPurchaseForm>;

/** Every refusal and the fault: `400`/`429`/`500 {error}`. */
export const ContactErrorResponse = z.object({ error: z.string() });
export type ContactErrorResponse = z.infer<typeof ContactErrorResponse>;

// --- Header -----------------------------------------------------------------

/**
 * The viewer the layout hands the marketing header: identity's session user,
 * narrowed to the fields the chrome renders. The layout load passes
 * `event.locals.user` straight through, so this stays structural on purpose —
 * marketing never imports identity's server session types.
 */
export type MarketingViewer = {
	firstName?: string | null;
	lastName?: string | null;
	email?: string | null;
	roles?: string[];
};
