import { fail } from '@sveltejs/kit';
import type { RequestEvent } from '@sveltejs/kit';
import type { Actions } from './$types';
import { sendEmail } from '$lib/utils/sendEmail';
import { NOREPLYEMAIL } from '$env/static/private';
import { clientKey, rateLimit } from '$lib/server/utils/rateLimit';

/** User-facing support inbox; same recipient as the /api/contact action. */
const CONTACT_TO = 'hello@familyplanz.com';

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const CONTACT_RATE_LIMIT = { limit: 5, windowMs: 10 * 60 * 1000 } as const;

export type ContactDeps = {
	sendEmail?: typeof sendEmail;
	/** Route-supplied per-request rate limiter: receives the scope+client key. */
	gate?: (key: string) => boolean;
};

const defaultDeps: Required<ContactDeps> = {
	sendEmail,
	gate: (key) => rateLimit(key, CONTACT_RATE_LIMIT.limit, CONTACT_RATE_LIMIT.windowMs)
};

function isString(value: FormDataEntryValue | null): value is string {
	return typeof value === 'string';
}

function formString(formData: FormData, key: string): string {
	const value = formData.get(key);
	return isString(value) ? value : '';
}

function escapeHtml(value: string): string {
	return value
		.replaceAll('&', '&amp;')
		.replaceAll('<', '&lt;')
		.replaceAll('>', '&gt;')
		.replaceAll('"', '&quot;')
		.replaceAll("'", '&#39;');
}

export const actions: Actions = {
	default: async ({ request }: RequestEvent, deps: ContactDeps = defaultDeps) => {
		const sendEmailFn = deps.sendEmail ?? defaultDeps.sendEmail;
		const gate = deps.gate ?? defaultDeps.gate;

		if (!gate(clientKey(request, 'contact'))) {
			return fail(429, { failure: true, error: 'Too many attempts. Try again shortly.' });
		}

		const formData = await request.formData();

		// Honeypot field for spam protection.
		if (formString(formData, 'website')) {
			return fail(400, { failure: true, error: 'Invalid submission' });
		}

		const name = formString(formData, 'name');
		const email = formString(formData, 'email');
		const message = formString(formData, 'message');

		if (!name || !email || !message.trim()) {
			return fail(400, { failure: true, error: 'All fields are required' });
		}

		if (!EMAIL_REGEX.test(email)) {
			return fail(400, { failure: true, error: 'Please enter a valid email address' });
		}

		const result = await sendEmailFn({
			to: CONTACT_TO,
			from: NOREPLYEMAIL,
			subject: `New Contact Form Submission from ${name}`,
			html: `
				<div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
					<h2 style="color: #333;">New Contact Form Submission</h2>
					<div style="background: #f9f9f9; padding: 20px; border-radius: 8px;">
						<p><strong>Name:</strong> ${escapeHtml(name)}</p>
						<p><strong>Email:</strong> ${escapeHtml(email)}</p>
						<p><strong>Message:</strong></p>
						<p style="white-space: pre-wrap;">${escapeHtml(message)}</p>
					</div>
				</div>
			`
		});

		if (!result.success) {
			return fail(500, { failure: true, error: 'Something went wrong. Please try again.' });
		}

		return { success: true };
	}
};
