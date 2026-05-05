import { json } from '@sveltejs/kit';
import type { Actions } from './$types';
import { sendEmail } from '$lib/utils/sendEmail';
import { NOREPLYEMAIL } from '$env/static/private';

export const actions: Actions = {
	default: async ({ request }) => {
		const formData = await request.formData();
		
		const website = formData.get('website') as string;
		if (website) {
			return json({ error: 'Invalid submission' }, { status: 400 });
		}

		const name = formData.get('name') as string;
		const email = formData.get('email') as string;
		const message = formData.get('message') as string;

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
						<p><strong>Name:</strong> ${name}</p>
						<p><strong>Email:</strong> ${email}</p>
						<p><strong>Message:</strong></p>
						<p style="white-space: pre-wrap;">${message}</p>
					</div>
				</div>
			`
		});

		if (!result.success) {
			return json({ error: 'Failed to send message. Please try again later.' }, { status: 500 });
		}

		return json({ success: true });
	}
};
