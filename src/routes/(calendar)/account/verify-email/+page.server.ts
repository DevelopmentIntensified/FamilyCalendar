import { parseJWT, validateJWT } from 'oslo/jwt';
import type { PageServerLoad, Actions } from './$types';
import { redirect } from '@sveltejs/kit';
import { EMAILSECRET } from '$env/static/private';
import { getCode, deleteCode } from '$lib/server/db/actions/codes';
import { eq } from 'drizzle-orm';
import { db } from '$lib/server/db';
import { users } from '$lib/server/db/schema';
import { fail } from '@sveltejs/kit';

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
		const formData = await request.formData();
		const token = formString(formData, 'token');
		const code = formString(formData, 'code');

		if (!token && !code) {
			return fail(400, { success: false, message: 'Verification code is required' });
		}

		const secret = new TextEncoder().encode(EMAILSECRET);
		const userId = locals.user.id;

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
