import { parseJWT, validateJWT } from 'oslo/jwt';
import type { PageServerLoad, Actions } from './$types';
import { fail, redirect } from '@sveltejs/kit';
import { EMAILSECRET } from '$env/static/private';
import { getCode, deleteCode } from '$lib/server/db/actions/codes';
import { getUser } from '$lib/server/db/actions/users';
import { eq } from 'drizzle-orm';
import { db } from '$lib/server/db';
import { users } from '$lib/server/db/schema';
import { clientKey, rateLimit } from '$lib/server/utils/rateLimit';
import { requireUser } from '$lib/server/utils/requireUser';

type EmailChangePayload = {
	code: string;
	pendingEmail: string;
};

export const load: PageServerLoad = async (event) => {
	if (!event.locals.user) {
		return redirect(302, '/login');
	}
	return {};
};

function isEmailChangePayload(value: unknown): value is EmailChangePayload {
	return (
		typeof value === 'object' &&
		value !== null &&
		'pendingEmail' in value &&
		typeof value.pendingEmail === 'string'
	);
}

function isString(value: FormDataEntryValue | null): value is string {
	return typeof value === 'string';
}

function formString(formData: FormData, key: string): string {
	const value = formData.get(key);
	return isString(value) ? value : '';
}

export const actions: Actions = {
	verify: async ({ request, locals }) => {
		// Throttle code guessing: 10 attempts per 15min per IP (login-code pattern).
		if (!rateLimit(clientKey(request, 'verify-email-change'), 10, 15 * 60 * 1000)) {
			return fail(429, { success: false, message: 'Too many attempts. Try again shortly.' });
		}
		const formData = await request.formData();
		const token = formString(formData, 'token');
		const code = formString(formData, 'code');

		if (!token && !code) {
			return fail(400, { success: false, message: 'Verification code is required' });
		}

		const secret = new TextEncoder().encode(EMAILSECRET);
		const userId = requireUser(locals).id;

		try {
			let pendingEmail: string | null;

			if (token) {
				try {
					await validateJWT('HS256', secret, token);
				} catch {
					return fail(400, { success: false, message: 'Invalid or expired token' });
				}

				const parsedToken = parseJWT(token);
				if (!parsedToken) {
					return fail(400, { success: false, message: 'Invalid token' });
				}

				const payload: unknown = parsedToken.payload;
				if (!isEmailChangePayload(payload)) {
					return fail(400, { success: false, message: 'Invalid token' });
				}
				pendingEmail = payload.pendingEmail;

				await db
					.update(users)
					.set({ email: pendingEmail, emailVerified: true })
					.where(eq(users.id, userId));

				return { success: true, message: 'Email verified successfully!' };
			} else if (code) {
				const existingCode = await getCode(code);
				if (!existingCode) {
					return fail(400, { success: false, message: 'Invalid verification code' });
				}

				if (existingCode.expiresAt < new Date()) {
					return fail(400, { success: false, message: 'Verification code has expired' });
				}

				if (existingCode.type !== 'email_change') {
					return fail(400, { success: false, message: 'Invalid code type' });
				}

				// Identity binding: the code belongs to the address that requested it.
				// A sniffed code cannot rewrite a different user's row.
				const consumer = await getUser(userId);
				if (!consumer?.email || existingCode.email !== consumer.email) {
					return fail(400, { success: false, message: 'Invalid verification code' });
				}
				pendingEmail = existingCode.pendingEmail ?? null;
				if (!pendingEmail) {
					return fail(400, { success: false, message: 'No pending email found' });
				}

				await db
					.update(users)
					.set({ email: pendingEmail, emailVerified: true })
					.where(eq(users.id, userId));
				await deleteCode(code);

				return { success: true, message: 'Email verified successfully!' };
			}

			return fail(400, { success: false, message: 'Invalid request' });
		} catch (error) {
			console.error('Verification error:', error);
			return fail(500, { success: false, message: 'Failed to verify email' });
		}
	}
};
