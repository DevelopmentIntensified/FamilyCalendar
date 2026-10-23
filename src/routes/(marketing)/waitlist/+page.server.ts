import { fail } from '@sveltejs/kit';
import type { Actions } from './$types';
import { db } from '$lib/server/db';
import { waitlist } from '$lib/server/db/schema';
import { generateId } from '$lib/server/utils/generateId';
import { sendWaitlistConfirmation } from '$lib/server/services/emailService';
import { clientKey, rateLimit } from '$lib/server/utils/rateLimit';

const RATE_LIMIT = { limit: 5, windowMs: 10 * 60 * 1000 } as const;

export type WaitlistDeps = {
	sendConfirmation?: typeof sendWaitlistConfirmation;
	gate?: (key: string) => boolean;
};

const defaultDeps: Required<WaitlistDeps> = {
	sendConfirmation: sendWaitlistConfirmation,
	gate: (key) => rateLimit(key, RATE_LIMIT.limit, RATE_LIMIT.windowMs)
};

function isString(value: FormDataEntryValue | null): value is string {
	return typeof value === 'string';
}

function formString(formData: FormData, key: string): string | null {
	const value = formData.get(key);
	return isString(value) ? value : null;
}

export const actions: Actions = {
	join: async ({ request }, deps: WaitlistDeps = defaultDeps) => {
		const send = deps.sendConfirmation ?? defaultDeps.sendConfirmation;
		const gate = deps.gate ?? defaultDeps.gate;

		if (!gate(clientKey(request, 'waitlist-join'))) {
			return fail(429, { error: 'Too many attempts. Try again shortly.', email: '', name: '' });
		}

		const formData = await request.formData();

		const email = formString(formData, 'email')?.trim();
		const name = formString(formData, 'name')?.trim();

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
		const consent = (formString(formData, 'consent') ?? '').trim().toLowerCase();
		const consented = consent === 'on' || consent === 'true' || consent === 'yes';

		try {
			const [entry] = await db
				.insert(waitlist)
				.values({
					id: generateId(15),
					email: email.toLowerCase(),
					firstName,
					lastName: lastName,
					...(consented ? { consentedAt: new Date(), optedInAt: new Date() } : {}),
					preferences: { marketing: false, updates: false },
					status: 'pending'
				})
				.onConflictDoNothing({ target: waitlist.email })
				.returning();

			if (!entry) {
				return fail(400, { error: 'You are already on the waitlist!', email, name });
			}

			const sendResult = await send({ email, name });
			if (!sendResult.success) {
				return fail(500, {
					error:
						'We saved your spot, but the confirmation email failed to send. Please try again or contact support.',
					email,
					name
				});
			}

			return { success: true, email, name };
		} catch (err) {
			console.error('Waitlist error:', err);
			return fail(500, { error: 'Something went wrong. Please try again.', email, name });
		}
	}
};
