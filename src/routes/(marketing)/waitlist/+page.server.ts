import { fail } from '@sveltejs/kit';
import type { Actions } from './$types';
import { db } from '$lib/server/db';
import { waitlist } from '$lib/server/db/schema';
import { generateId } from 'lucia';
import { sendWaitlistConfirmation } from '$lib/server/services/emailService';

export const actions: Actions = {
	join: async ({ request }) => {
		const formData = await request.formData();

		const email = (formData.get('email') as string | null)?.trim();
		const name = (formData.get('name') as string | null)?.trim();

		if (!email) {
			return fail(400, { error: 'Email is required', email: '', name: name ?? '' });
		}

		if (!name) {
			return fail(400, { error: 'Name is required', email, name: '' });
		}

		const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
		if (!emailRegex.test(email)) {
			return fail(400, { error: 'Please enter a valid email address', email, name });
		}

		const nameParts = name.split(' ');
		const firstName = nameParts[0];
		const lastName = nameParts.slice(1).join(' ') || null;

		try {
			const [entry] = await db
				.insert(waitlist)
				.values({
					id: generateId(15),
					email: email.toLowerCase(),
					firstName,
					lastName: lastName,
					consentedAt: new Date(),
					preferences: { marketing: false, updates: false },
					optedInAt: new Date(),
					status: 'pending'
				})
				.onConflictDoNothing()
				.returning();

			if (!entry) {
				return fail(400, { error: 'You are already on the waitlist!', email, name });
			}

			sendWaitlistConfirmation({ email, name }).catch((err) => {
				console.error('Failed to send waitlist confirmation email:', err);
			});

			return { success: true, email, name };
		} catch (err) {
			console.error('Waitlist error:', err);
			return fail(500, { error: 'Something went wrong. Please try again.', email, name });
		}
	}
};