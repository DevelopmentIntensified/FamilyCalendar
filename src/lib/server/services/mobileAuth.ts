import { json } from '@sveltejs/kit';
import {
	issueMagicLink,
	magicLinkDeps,
	type IssueMagicLinkInput,
	MAGIC_LINK_RATE_LIMIT,
	type MagicLinkDeps
} from '$lib/server/services/magicLink';
import {
	deleteDeadCodes,
	deleteHashedCode,
	getHashedCode,
	type HashedCodeFilter
} from '$lib/server/db/actions/codes';
import { getAccount } from '$lib/server/db/actions/accounts';
import { createAnonymousUser, getUser, getUserByEmail } from '$lib/server/db/actions/users';
import { createUserSettings, getUserSettings } from '$lib/server/db/actions/userSettings';
import {
	API_TOKEN_PREFIX,
	createApiToken,
	revokeTokenByPlaintext
} from '$lib/server/db/actions/apiTokens';
import { createNewUser } from '$lib/server/utils/createNewUser';
import { verifyPassword } from '$lib/server/utils/password';
import { clientKey, rateLimit } from '$lib/server/utils/rateLimit';
import { isRegisteredAccount } from '$lib/utils/anonymous';

/**
 * #288 Android native sign-in. Every endpoint is cookie-free JSON: success
 * mints a personal API token (the same `apiTokens` row /account mints, fp_
 * prefix, visible/revocable there) instead of a session. Code issuance and
 * redemption reuse the web's magic-link seam and hashed-code rows, so a code
 * emailed here is the same code the web flow would accept, and the rate-limit
 * buckets are the web's (IP + scope, with the email folded into the scope).
 * Contract: docs/issues/288-android-native-login.md.
 */

export type MobileIntent = 'login' | 'signup';

export type MobileAuthDeps = {
	magicLink: MagicLinkDeps;
	getHashedCode: typeof getHashedCode;
	deleteHashedCode: typeof deleteHashedCode;
	deleteDeadCodes: typeof deleteDeadCodes;
	getAccount: typeof getAccount;
	getUser: typeof getUser;
	getUserByEmail: typeof getUserByEmail;
	createNewUser: typeof createNewUser;
	createAnonymousUser: typeof createAnonymousUser;
	getUserSettings: typeof getUserSettings;
	createUserSettings: typeof createUserSettings;
	verifyPassword: typeof verifyPassword;
	createApiToken: typeof createApiToken;
	revokeTokenByPlaintext: typeof revokeTokenByPlaintext;
	rateLimit: typeof rateLimit;
};

export const mobileAuthDeps: MobileAuthDeps = {
	magicLink: magicLinkDeps,
	getHashedCode,
	deleteHashedCode,
	deleteDeadCodes,
	getAccount,
	getUser,
	getUserByEmail,
	createNewUser,
	createAnonymousUser,
	getUserSettings,
	createUserSettings,
	verifyPassword,
	createApiToken,
	revokeTokenByPlaintext,
	rateLimit
};

export const MOBILE_ERRORS = {
	invalidEmail: 'Enter a valid email',
	invalidIntent: 'intent must be "login" or "signup"',
	missingName: 'First and last name are required',
	rateLimited: 'Too many attempts — try again in a few minutes',
	wrongCode: 'That code is wrong or expired',
	wrongPassword: 'Email or password is incorrect',
	missingPassword: 'Email and password are required',
	accountExists: 'An account with this email already exists — sign in instead',
	sendFailed: "Couldn't send the email — try again",
	invalidJson: 'Request body must be JSON',
	unauthorized: 'Unauthorized',
	server: 'Something went wrong — try again'
} as const;

// Same limits as the web routes they mirror.
const VERIFY_LIMIT = { limit: 10, windowMs: 15 * 60 * 1000 } as const; // /login|signup/email/code
const PASSWORD_LIMIT = { limit: 10, windowMs: 5 * 60 * 1000 } as const; // /login/password
// The web creates guests on document navigation (no limiter there); an
// unauthenticated JSON endpoint that inserts user rows gets a modest one.
const GUEST_LIMIT = { limit: 10, windowMs: 60 * 60 * 1000 } as const;

// Constant dummy bcrypt hash (as /login/password): unknown emails still pay
// for a compare so timing doesn't reveal which emails exist.
const DUMMY_BCRYPT_HASH = '$2a$10$C6UzMDM.H6dfI/f/IKcEeO7ZBpEbF1nZ.PnI1fT4/eqSYQ0xJ0fSO';

const EMAIL_REGEX =
	/^(([^<>()[\]\\.,;:\s@"]+(\.[^<>()[\]\\.,;:\s@"]+)*)|(".+"))@((\[[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}])|(([a-zA-Z\-0-9]+\.)+[a-zA-Z]{2,}))$/;

export const DEVICE_NAME_MAX = 60;

/** "Android — <deviceName>", deviceName trimmed to 60 chars, default "Android". */
export function mobileTokenName(deviceName: string): string {
	const trimmed = deviceName.trim().slice(0, DEVICE_NAME_MAX).trim();
	return `Android — ${trimmed || 'Android'}`;
}

export type MobileUser = {
	id: string;
	firstName: string | null;
	lastName: string | null;
	email: string | null;
};

/** Public user shape: the Anonymous Account placeholder email never leaves. */
export function toMobileUser(user: {
	id: string;
	firstName?: string | null;
	lastName?: string | null;
	email?: string | null;
}): MobileUser {
	return {
		id: user.id,
		firstName: user.firstName ?? null,
		lastName: user.lastName ?? null,
		email: isRegisteredAccount(user) ? user.email : null
	};
}

function error(status: number, message: string): Response {
	return json({ error: message }, { status });
}

/** Every field the mobile endpoints read, parsed once at the boundary.
 *  Absent / non-string fields read as '' (password is not trimmed). */
type MobileBody = {
	email: string;
	intent: MobileIntent | null;
	code: string;
	password: string;
	firstName: string;
	lastName: string;
	deviceName: string;
};

/** Boundary read of one string field from the untrusted JSON object —
 *  this IS the parser, so the dynamic read + typeof live here only. */
// oxlint-disable-next-line anti-slop/no-object-parameters -- untrusted parsed JSON; narrowed field-by-field below.
function field(bag: object, key: string): string {
	// oxlint-disable-next-line anti-slop/no-reflect-get -- boundary parser (see above).
	const value: unknown = Reflect.get(bag, key);
	// oxlint-disable-next-line anti-slop/no-runtime-typeof -- boundary parser (see above).
	return typeof value === 'string' ? value : '';
}

/** Parses the JSON body; null on malformed/non-object JSON. `allowEmpty`
 *  treats a missing body as `{}` (guest takes optional fields only). */
async function readBody(request: Request, allowEmpty = false): Promise<MobileBody | null> {
	let parsed: unknown;
	try {
		const text = await request.text();
		parsed = text.trim() === '' && allowEmpty ? {} : JSON.parse(text);
	} catch {
		return null;
	}
	// oxlint-disable-next-line anti-slop/no-runtime-typeof -- boundary parser: JSON must be an object.
	if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) return null;
	const intent = field(parsed, 'intent');
	return {
		email: field(parsed, 'email').trim(),
		intent: intent === 'login' || intent === 'signup' ? intent : null,
		code: field(parsed, 'code').trim(),
		password: field(parsed, 'password'),
		firstName: field(parsed, 'firstName').trim(),
		lastName: field(parsed, 'lastName').trim(),
		deviceName: field(parsed, 'deviceName')
	};
}

function isEmail(email: string): boolean {
	return EMAIL_REGEX.test(email);
}

async function issueToken(
	deps: MobileAuthDeps,
	user: Parameters<typeof toMobileUser>[0],
	deviceName: string
): Promise<Response> {
	const { token } = await deps.createApiToken(user.id, mobileTokenName(deviceName));
	return json({ token, user: toMobileUser(user) }, { status: 200 });
}

/**
 * POST /api/mobile/auth/email — `{ email, intent, firstName?, lastName? }`.
 * Always `{sent:true}` for a well-formed address (unknown login emails and
 * already-registered signup emails send nothing, same as the web).
 */
export async function mobileEmail(request: Request, deps: MobileAuthDeps): Promise<Response> {
	const body = await readBody(request);
	if (!body) return error(400, MOBILE_ERRORS.invalidJson);
	const { email, intent } = body;
	if (!isEmail(email)) return error(400, MOBILE_ERRORS.invalidEmail);
	if (!intent) return error(400, MOBILE_ERRORS.invalidIntent);

	// Login names come from the account row (issueMagicLink ignores input
	// names for login); signup requires them, as the web does.
	const input: IssueMagicLinkInput = { email };
	if (intent === 'signup') {
		input.firstName = body.firstName;
		input.lastName = body.lastName;
	}

	const result = await issueMagicLink(
		deps.magicLink,
		intent,
		input,
		// issueMagicLink hands us `login-code:<email>` / `signup-code:<email>`;
		// clientKey adds the IP → the exact bucket the web route uses.
		(key) =>
			deps.rateLimit(
				clientKey(request, key),
				MAGIC_LINK_RATE_LIMIT.limit,
				MAGIC_LINK_RATE_LIMIT.windowMs
			)
	);

	switch (result.status) {
		case 'sent':
		case 'suppressed':
			return json({ sent: true }, { status: 200 });
		case 'rejected':
			switch (result.reason) {
				case 'invalid-email':
					return error(400, MOBILE_ERRORS.invalidEmail);
				case 'missing-name':
					return error(400, MOBILE_ERRORS.missingName);
				case 'rate-limited':
					return error(429, MOBILE_ERRORS.rateLimited);
				case 'send-failed':
					return error(500, MOBILE_ERRORS.sendFailed);
			}
	}
}

/**
 * POST /api/mobile/auth/verify — `{ email, code, intent, deviceName }`.
 * Redeems the emailed code (same hashed, type-stamped row the web redeems)
 * and mints a token. Signup creates the account like /signup/email/code.
 */
export async function mobileVerify(request: Request, deps: MobileAuthDeps): Promise<Response> {
	const body = await readBody(request);
	if (!body) return error(400, MOBILE_ERRORS.invalidJson);
	const { email, intent, code } = body;
	if (!isEmail(email)) return error(400, MOBILE_ERRORS.invalidEmail);
	if (!intent) return error(400, MOBILE_ERRORS.invalidIntent);
	if (!code) return error(400, MOBILE_ERRORS.wrongCode);

	if (
		!deps.rateLimit(
			clientKey(request, `verify-${intent}-code:${email.toLowerCase()}`),
			VERIFY_LIMIT.limit,
			VERIFY_LIMIT.windowMs
		)
	) {
		return error(429, MOBILE_ERRORS.rateLimited);
	}

	await deps.deleteDeadCodes();
	const filter: HashedCodeFilter = { code, email, type: intent };
	const row = await deps.getHashedCode(filter);
	if (!row) return error(400, MOBILE_ERRORS.wrongCode);

	if (intent === 'signup') {
		const { firstName, lastName } = row;
		if (!firstName || !lastName) return error(400, MOBILE_ERRORS.wrongCode);
		const existing = (await deps.getAccount(email)) ?? (await deps.getUserByEmail(email));
		if (existing) {
			await deps.deleteHashedCode(filter);
			return error(409, MOBILE_ERRORS.accountExists);
		}
		const user = await deps.createNewUser(firstName, lastName, email);
		await deps.deleteHashedCode(filter);
		return issueToken(deps, user, body.deviceName);
	}

	const account = await deps.getAccount(email);
	const user = account ? await deps.getUser(account.userId) : await deps.getUserByEmail(email);
	if (!user) return error(400, MOBILE_ERRORS.wrongCode);
	await deps.deleteHashedCode(filter);
	return issueToken(deps, user, body.deviceName);
}

/** POST /api/mobile/auth/password — `{ email, password, deviceName }`. */
export async function mobilePassword(request: Request, deps: MobileAuthDeps): Promise<Response> {
	const body = await readBody(request);
	if (!body) return error(400, MOBILE_ERRORS.invalidJson);
	const { email: rawEmail, password } = body;
	if (!rawEmail || !password) return error(400, MOBILE_ERRORS.missingPassword);

	if (
		!deps.rateLimit(
			clientKey(request, `pw-login:${rawEmail.toLowerCase()}`),
			PASSWORD_LIMIT.limit,
			PASSWORD_LIMIT.windowMs
		)
	) {
		return error(429, MOBILE_ERRORS.rateLimited);
	}

	const user = await deps.getUserByEmail(rawEmail);
	// Unknown email, guest placeholder, or code-only account: one generic 401.
	if (!user || !user.passwordHash || !isRegisteredAccount(user)) {
		await deps.verifyPassword(password, DUMMY_BCRYPT_HASH);
		return error(401, MOBILE_ERRORS.wrongPassword);
	}
	if (!(await deps.verifyPassword(password, user.passwordHash))) {
		return error(401, MOBILE_ERRORS.wrongPassword);
	}

	// As /login/password: settings follow the account.
	if (!(await deps.getUserSettings(user.id))) {
		await deps.createUserSettings({ userId: user.id, timeZone: 'UTC' });
	}
	return issueToken(deps, user, body.deviceName);
}

/** POST /api/mobile/auth/guest — `{ deviceName? }` → Anonymous Account + token. */
export async function mobileGuest(request: Request, deps: MobileAuthDeps): Promise<Response> {
	const body = await readBody(request, true);
	if (!body) return error(400, MOBILE_ERRORS.invalidJson);
	if (
		!deps.rateLimit(clientKey(request, 'mobile-guest'), GUEST_LIMIT.limit, GUEST_LIMIT.windowMs)
	) {
		return error(429, MOBILE_ERRORS.rateLimited);
	}
	const user = await deps.createAnonymousUser();
	return issueToken(deps, user, body.deviceName);
}

/**
 * POST /api/mobile/auth/logout — Bearer fp_. hooks.server.ts has already
 * resolved the token to `user` (or 401'd); this revokes exactly the
 * presented token, scoped to its owner. Sessions and other tokens survive.
 */
export async function mobileLogout(
	request: Request,
	user: { id: string } | null,
	deps: MobileAuthDeps
): Promise<Response> {
	const auth = request.headers.get('authorization') ?? '';
	const token = auth.startsWith('Bearer ') ? auth.slice('Bearer '.length).trim() : '';
	if (!user || !token.startsWith(API_TOKEN_PREFIX)) {
		return error(401, MOBILE_ERRORS.unauthorized);
	}
	await deps.revokeTokenByPlaintext(user.id, token);
	return json({ success: true }, { status: 200 });
}

/** Wraps a handler so an unexpected throw is a JSON 500, never an HTML page. */
export async function guarded(fn: () => Promise<Response>): Promise<Response> {
	try {
		return await fn();
	} catch (e) {
		console.error('mobile auth error:', e);
		return error(500, MOBILE_ERRORS.server);
	}
}
