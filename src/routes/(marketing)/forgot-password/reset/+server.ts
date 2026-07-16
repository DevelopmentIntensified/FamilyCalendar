import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getUserByEmail, updateUser } from '$lib/server/db/actions/users';
import { hashPassword } from '$lib/server/utils/password';
import { EMAILSECRET } from '$env/static/private';
import { parseJWT, validateJWT } from 'oslo/jwt';

export const POST: RequestHandler = async ({ request }) => {
	try {
		const { token, password } = await request.json();

		if (!token || !password) {
			return json({ error: 'Token and password are required' }, { status: 400 });
		}

		if (password.length < 8) {
			return json({ error: 'Password must be at least 8 characters' }, { status: 400 });
		}

		const secret = new TextEncoder().encode(EMAILSECRET);

		try {
			await validateJWT('HS256', secret, token);
		} catch {
			return json({ error: 'Invalid or expired reset token. Please request a new one.' }, { status: 400 });
		}

		const parsed = parseJWT(token);
		if (!parsed) {
			return json({ error: 'Invalid reset token' }, { status: 400 });
		}

		const payload = parsed.payload as { email: string };
		if (!payload?.email) {
			return json({ error: 'Invalid reset token' }, { status: 400 });
		}

		const user = await getUserByEmail(payload.email);
		if (!user) {
			return json({ error: 'Account not found' }, { status: 400 });
		}

		const passwordHash = await hashPassword(password);
		await updateUser(user.id, { passwordHash });

		return json({ success: true });
	} catch (error) {
		console.error('Reset password error:', error);
		return json({ error: 'Failed to reset password' }, { status: 500 });
	}
};
