/**
 * marketing contract: the zod schemas and types for `POST /api/contact` (the
 * module's one `/api` route) and for the `/contact` page's form, plus the
 * `/api` response bodies.
 *
 * The error copy is the wire: the golden tests pin it
 * (`marketing.http.db.test.ts`). Keep the legacy wording.
 *
 * Both forms are read the way the legacy actions read `FormData`: the first
 * value of a field, and a missing or non-string (file) value is `''`. Nothing is
 * trimmed. The checks run in the legacy order and the first failure is the
 * answer: honeypot, then "all fields", then the address shape. The two forms
 * differ in one place only — `/contact` counts a whitespace-only message as
 * empty (`message.trim()`), `/api/contact` does not — and neither trims what it
 * passes on.
 *
 * Doc: ./README.md#invariants
 */
import { z } from '$lib/kernel/validation/validators';
import { isContactEmail } from './marketing.mail.rules';

// --- Wire copy --------------------------------------------------------------

/** 429, both contact surfaces. */
export const CONTACT_THROTTLED_MESSAGE = 'Too many attempts. Try again shortly.';

/** 400 when the hidden `website` field is filled. */
export const CONTACT_HONEYPOT_MESSAGE = 'Invalid submission';

/** 400 when name, email or message is empty. */
export const CONTACT_REQUIRED_MESSAGE = 'All fields are required';

/** 400 when the address has no recognisable shape. */
export const CONTACT_EMAIL_MESSAGE = 'Please enter a valid email address';

/** The 500 body of `POST /api/contact` when the mail provider fails. */
export const CONTACT_API_FAULT_MESSAGE = 'Failed to send message. Please try again later.';

/** The 500 payload of the `/contact` action when the mail provider fails. */
export const CONTACT_FORM_FAULT_MESSAGE = 'Something went wrong. Please try again.';

// --- Request bodies ---------------------------------------------------------

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

/** Honeypot, then "all fields" (the message rule differs per surface), then the address shape. */
function contactBody(isMessageFilled: (message: string) => boolean) {
	return ContactFields.refine((fields) => fields.website === '', {
		error: CONTACT_HONEYPOT_MESSAGE,
		abort: true
	})
		.refine(
			(fields) => fields.name !== '' && fields.email !== '' && isMessageFilled(fields.message),
			{ error: CONTACT_REQUIRED_MESSAGE, abort: true }
		)
		.refine((fields) => isContactEmail(fields.email), { error: CONTACT_EMAIL_MESSAGE });
}

/**
 * `POST /api/contact`, form-encoded. A message is filled when it is non-empty:
 * a whitespace-only one is sent.
 */
export const ContactApiBody = contactBody((message) => message !== '');
export type ContactApiBody = z.infer<typeof ContactApiBody>;

/**
 * The `/contact` page action. A message is filled when it is non-blank after
 * trimming; the value that goes on to the mail is still the untrimmed one.
 */
export const ContactFormBody = contactBody((message) => message.trim() !== '');
export type ContactFormBody = z.infer<typeof ContactFormBody>;

// --- `/api/contact` responses ----------------------------------------------

/** `200 {success:true}`. */
export const ContactSentResponse = z.object({ success: z.literal(true) });
export type ContactSentResponse = z.infer<typeof ContactSentResponse>;

/** Every refusal and the fault: `400`/`429`/`500 {error}`. */
export const ContactErrorResponse = z.object({ error: z.string() });
export type ContactErrorResponse = z.infer<typeof ContactErrorResponse>;
