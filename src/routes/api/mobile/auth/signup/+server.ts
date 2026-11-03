import { json, type RequestEvent } from '@sveltejs/kit';
import { getUserByEmail, createUser } from '$lib/server/db/actions/users';
import { ensurePersonalCalendar } from '$lib/server/db/actions/calendar';
import { createCode } from '$lib/server/db/actions/codes';
import { createApiToken } from '$lib/server/db/actions/apiTokens';
import { hashPassword } from '$lib/server/utils/password';
import { sendEmail } from '$lib/utils/sendEmail';
import { createJWT } from 'oslo/jwt';
import { NOREPLYEMAIL, EMAILSECRET } from '$env/static/private';
import { getUrl } from '$lib/utils/getUrl';
import { guarded, mobileTokenName, toMobileUser } from '$lib/server/services/mobileAuth';
import { readJsonObject } from '$lib/server/utils/jsonBody';
import {
	createPasswordAccount,
	sendSignupVerification,
	type PasswordAccountDeps
} from '$lib/server/services/passwordSignup';

export type MobileSignupDeps = PasswordAccountDeps & { createApiToken: typeof createApiToken };

const defaultDeps: MobileSignupDeps = {
	getUserByEmail,
	createUser,
	ensurePersonalCalendar,
	hashPassword,
	createCode,
	sendEmail,
	createJwt: createJWT,
	fromEmail: NOREPLYEMAIL,
	jwtSecret: new TextEncoder().encode(EMAILSECRET),
	baseSiteUrl: getUrl(),
	createApiToken
};

function str(v: unknown): string {
	return typeof v === 'string' ? v : '';
}

/**
 * POST /api/mobile/auth/signup `{firstName,lastName,email,password,deviceName?}`
 * (#292 G12) — the web's password sign-up (createPasswordAccount: same
 * checks, throttles and messages), signed in with an fp_ token instead of a
 * cookie. The account starts unverified; the code goes out as on the web.
 */
export const POST = async (
	event: RequestEvent,
	deps: MobileSignupDeps = defaultDeps
): Promise<Response> =>
	guarded(async () => {
		const body = await readJsonObject(event.request);
		if (!body.ok) return body.response;
		const input = {
			email: str(body.value.email).trim(),
			password: str(body.value.password),
			firstName: str(body.value.firstName).trim(),
			lastName: str(body.value.lastName).trim()
		};
		const created = await createPasswordAccount(event.request, input, deps);
		if (!created.ok) return created.response;
		const { user } = created;
		const { token } = await deps.createApiToken(
			user.id,
			mobileTokenName(str(body.value.deviceName))
		);
		await sendSignupVerification(event.request, deps, input);
		return json({
			token,
			user: { ...toMobileUser(user), emailVerified: false },
			emailVerification: 'pending'
		});
	});
