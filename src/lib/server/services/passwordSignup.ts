/**
 * Email + password sign-up (#292 G12): the account-creation half of the
 * web's POST /signup/password, shared with POST /api/mobile/auth/signup.
 * The caller then signs the new user in its own way (web: session cookie;
 * app: an fp_ API token) and calls sendSignupVerification.
 */
import { json } from '@sveltejs/kit';
import type { getUserByEmail, createUser } from '$lib/server/db/actions/users';
import type { ensurePersonalCalendar } from '$lib/server/db/actions/calendar';
import type { createCode } from '$lib/server/db/actions/codes';
import type { hashPassword } from '$lib/server/utils/password';
import { clientKey, rateLimit } from '$lib/server/utils/rateLimit';
import {
	issueVerificationCode,
	MAGIC_LINK_RATE_LIMIT,
	type MagicLinkGate
} from '$lib/server/services/magicLink';
import type { sendEmail } from '$lib/utils/sendEmail';
import type { createJWT } from 'oslo/jwt';

/** The callback the emailed code+link lands on (the web's verify page). */
export const PASSWORD_VERIFY_CALLBACK_PATH = '/signup/password/verify';

export type PasswordAccountDeps = {
	getUserByEmail: typeof getUserByEmail;
	createUser: typeof createUser;
	ensurePersonalCalendar: typeof ensurePersonalCalendar;
	hashPassword: typeof hashPassword;
	createCode: typeof createCode;
	sendEmail: typeof sendEmail;
	createJwt: typeof createJWT;
	fromEmail: string;
	jwtSecret: Uint8Array;
	baseSiteUrl: string;
	gate?: MagicLinkGate;
};

export type PasswordSignupInput = {
	email: string;
	password: string;
	firstName: string;
	lastName: string;
};

type CreatedUser = Awaited<ReturnType<typeof createUser>>;

/**
 * Validates, rate-limits and creates the (unverified) account + its
 * personal calendar. A refusal comes back as the JSON Response to send.
 */
export async function createPasswordAccount(
	request: Request,
	input: Partial<PasswordSignupInput>,
	deps: PasswordAccountDeps
): Promise<{ ok: true; user: CreatedUser } | { ok: false; response: Response }> {
	const { email, password, firstName, lastName } = input;
	const refuse = (status: number, error: string) => ({
		ok: false as const,
		response: json({ error }, { status })
	});
	if (!email || !password || !firstName || !lastName) {
		return refuse(400, 'All fields are required');
	}
	if (password.length < 8) {
		return refuse(400, 'Password must be at least 8 characters');
	}
	if (!rateLimit(clientKey(request, 'pw-signup-ip'), 30, 5 * 60 * 1000)) {
		return refuse(429, 'Too many attempts. Try again shortly.');
	}
	if (!rateLimit(clientKey(request, `pw-signup:${email.toLowerCase()}`), 10, 5 * 60 * 1000)) {
		return refuse(429, 'Too many attempts. Try again shortly.');
	}
	const existingUser = await deps.getUserByEmail(email);
	if (existingUser) {
		return refuse(400, 'An account with this email already exists');
	}
	const passwordHash = await deps.hashPassword(password);
	const user = await deps.createUser({
		email,
		passwordHash,
		firstName,
		lastName,
		emailVerified: false,
		roles: []
	});
	await deps.ensurePersonalCalendar(user.id);
	return { ok: true, user };
}

/**
 * Emails the verification code. The account already exists and is signed
 * in by now, so a failure must not fail the sign-up: logged, never thrown.
 */
export async function sendSignupVerification(
	request: Request,
	deps: PasswordAccountDeps,
	who: { email: string; firstName: string; lastName: string }
): Promise<void> {
	const gate: MagicLinkGate =
		deps.gate ??
		((key) =>
			rateLimit(clientKey(request, key), MAGIC_LINK_RATE_LIMIT.limit, MAGIC_LINK_RATE_LIMIT.windowMs));
	try {
		const issued = await issueVerificationCode(deps, who, gate, {
			callbackPath: PASSWORD_VERIFY_CALLBACK_PATH,
			gateKey: `pw-signup-code:${who.email.toLowerCase()}`,
			emailVariant: 'code-only'
		});
		if (issued.status === 'rejected') {
			console.error(`Verification email not sent for ${who.email}: ${issued.reason}`);
		}
	} catch (emailError) {
		console.error(`Verification email not sent for ${who.email}:`, emailError);
	}
}
