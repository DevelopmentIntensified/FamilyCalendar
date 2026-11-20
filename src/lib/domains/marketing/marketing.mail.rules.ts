/**
 * Pure rules for the contact message, the module's only mail: who it goes to,
 * its subject, the address shape a visitor may give, and the HTML body with
 * every user-supplied value escaped. Sending it is the service's job (the mail
 * port arrives at S5); nothing here reads the environment or the clock.
 *
 * The address rule is the legacy contact regex, kept apart from kernel's
 * `emailAddress`: that one trims and is stricter (a TLD of two letters, no
 * comma), and the golden pins that a padded address is refused, not trimmed.
 *
 * Doc: ./README.md#invariants
 */

/** The support inbox every contact message goes to. */
export const CONTACT_RECIPIENT = 'hello@familyplanz.com';

/** Something, an `@`, something, a dot, something; no whitespace anywhere (legacy `EMAIL_REGEX`). */
const CONTACT_EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** What a visitor sends; the honeypot is consumed at the boundary and never gets here. */
export type ContactMessage = {
	readonly name: string;
	readonly email: string;
	readonly message: string;
};

/** The legacy address shape check, on the raw value: no trimming. */
export function isContactEmail(address: string): boolean {
	return CONTACT_EMAIL_PATTERN.test(address);
}

/** The mail subject. The name goes in as typed: a subject is not HTML. */
export function contactSubject(name: string): string {
	return `New Contact Form Submission from ${name}`;
}

/** The five HTML-significant characters. `&` goes first so the entities it writes are not re-escaped. */
function escapeHtml(value: string): string {
	return value
		.replaceAll('&', '&amp;')
		.replaceAll('<', '&lt;')
		.replaceAll('>', '&gt;')
		.replaceAll('"', '&quot;')
		.replaceAll("'", '&#39;');
}

/** The mail body: name, address and message, each escaped; the message keeps its line breaks. */
export function contactMessageHtml({ name, email, message }: ContactMessage): string {
	return [
		'<div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">',
		'<h2 style="color: #333;">New Contact Form Submission</h2>',
		'<div style="background: #f9f9f9; padding: 20px; border-radius: 8px;">',
		`<p><strong>Name:</strong> ${escapeHtml(name)}</p>`,
		`<p><strong>Email:</strong> ${escapeHtml(email)}</p>`,
		'<p><strong>Message:</strong></p>',
		`<p style="white-space: pre-wrap;">${escapeHtml(message)}</p>`,
		'</div>',
		'</div>'
	].join('\n');
}
