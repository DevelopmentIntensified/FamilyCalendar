import { json } from '@sveltejs/kit';
import type { RequestEvent } from './$types';
import { getUserByEmail, updateUser } from '$lib/server/db/actions/users';
import { getCode, createCode } from '$lib/server/db/actions/codes';
import { hashPassword } from '$lib/server/utils/password';
import { lucia } from '$lib/server/auth';
import { EMAILSECRET } from '$env/static/private';
import { parseJWT, validateJWT } from 'oslo/jwt';
import { createHash } from 'node:crypto';

/**
 * Collaborators POST needs, injectable so tests can pass fakes through a real
 * seam instead of mocking modules. Defaults wire the production services.
 */
export type ResetPasswordDeps = {
	getUserByEmail: typeof getUserByEmail;
	updateUser: typeof updateUser;
	getCode: typeof getCode;
	createCode: typeof createCode;
	hashPassword: typeof hashPassword;
	invalidateUserSessions: typeof lucia.invalidateUserSessions;
	jwtSecret: Uint8Array;
	verifyJwt: typeof validateJWT;
	parseJwt: typeof parseJWT;
};

function isResetPayload(value: unknown): value is { email: string; exp?: number } {
	return (
		typeof value === 'object' &&
		value !== null &&
		'email' in value &&
		typeof value.email === 'string'
	);
}

const defaultDeps: ResetPasswordDeps = {
	getUserByEmail,
	updateUser,
	getCode,
	createCode,
	hashPassword,
	invalidateUserSessions: (userId: string) => lucia.invalidateUserSessions(userId),
	jwtSecret: new TextEncoder().encode(EMAILSECRET),
	verifyJwt: validateJWT,
	parseJwt: parseJWT
};

export const POST = async (
	event: RequestEvent,
	deps: ResetPasswordDeps = defaultDeps
): Promise<Response> => {
	const {
		getUserByEmail: lookupUser,
		updateUser,
		getCode,
		createCode,
		hashPassword,
		invalidateUserSessions,
		jwtSecret,
		verifyJwt,
		parseJwt
	} = deps;

	try {
		const { token, password } = await event.request.json();

		if (!token || !password) {
			return json({ error: 'Token and password are required' }, { status: 400 });
		}

		if (password.length < 8) {
			return json({ error: 'Password must be at least 8 characters' }, { status: 400 });
		}

		try {
			await verifyJwt('HS256', jwtSecret, token);
		} catch {
			return json(
				{ error: 'Invalid or expired reset token. Please request a new one.' },
				{ status: 400 }
			);
		}

		const parsed = parseJwt(token);
		if (!parsed) {
			return json({ error: 'Invalid reset token' }, { status: 400 });
		}

		const payload: unknown = parsed.payload;
		if (!isResetPayload(payload)) {
			return json({ error: 'Invalid reset token' }, { status: 400 });
		}

		// The reset token is a stateless JWT with no stored counterpart, so
		// single-use is enforced with a durable marker row in the codes table:
		// one row per token hash, expiring when the token itself expires.
		const usedMarker = `used:${createHash('sha256').update(token).digest('hex')}`;
		if (await getCode(usedMarker)) {
			return json(
				{ error: 'This reset link has already been used. Please request a new one.' },
				{ status: 400 }
			);
		}

		const user = await lookupUser(payload.email);
		if (!user) {
			return json({ error: 'Account not found' }, { status: 400 });
		}

		await createCode({
			code: usedMarker,
			expiresAt: payload.exp ? new Date(payload.exp * 1000) : new Date(Date.now() + 60 * 60 * 1000),
			email: payload.email,
			type: 'reset_used'
		});

		const passwordHash = await hashPassword(password);
		await updateUser(user.id, { passwordHash });

		// A password reset means existing credentials were compromised;
		// kill every live session so a hijacker cannot keep access.
		await invalidateUserSessions(user.id);

		return json({ success: true });
	} catch (error) {
		console.error('Reset password error:', error);
		return json({ error: 'Failed to reset password' }, { status: 500 });
	}
};
