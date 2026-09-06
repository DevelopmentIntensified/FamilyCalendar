import { json } from '@sveltejs/kit';
import { apiError } from '$lib/server/utils/apiError';
import type { Actions } from './$types';
import { sendEmail } from '$lib/utils/sendEmail';
import { NOREPLYEMAIL } from '$env/static/private';

function escapeHtml(value: string): string {
	return value
		.replaceAll('&', '&amp;')
		.replaceAll('<', '&lt;')
		.replaceAll('>', '&gt;')
		.replaceAll('"', '&quot;')
		.replaceAll("'", '&#39;');
}

function isString(value: FormDataEntryValue | null): value is string {
	return typeof value === 'string';
}

function formString(formData: FormData, key: string): string {
	const value = formData.get(key);
	return isString(value) ? value : '';
}

export const actions: Actions = {
	default: async ({ request }) => {
		const formData = await request.formData();

		const website = formString(formData, 'website');
		if (website) {
			return json({ error: 'Invalid submission' }, { status: 400 });
		}

		const name = formString(formData, 'name');
		const email = formString(formData, 'email');
		const message = formString(formData, 'message');

		if (!name || !email || !message) {
			return json({ error: 'All fields are required' }, { status: 400 });
		}

		const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
		if (!emailRegex.test(email)) {
			return json({ error: 'Please enter a valid email address' }, { status: 400 });
		}

		const result = await sendEmail({
			to: 'hello@familyplanz.com',
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
			return apiError(
				new URL(request.url).pathname,
				500,
				'Failed to send message. Please try again later.'
			);
		}

		return json({ success: true });
	}
};
