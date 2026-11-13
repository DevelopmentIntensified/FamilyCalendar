/**
 * Golden contract tests for access's `/api` surface (S2): the wire the web app,
 * the Android app and TaskFocus already speak — magic links and emailed codes,
 * password sign-in, Anonymous Account Claiming, email change/verify, mobile token
 * sign-in, and sign-out.
 *
 * They drive the LEGACY route modules exactly as clients hit them, so every
 * assertion here must stay green after the port rewires those routes onto
 * `access.http.server.ts` (docs/rewrite/playbooks/characterize-endpoints.md).
 * Committed mode (`truncateAll`): the legacy handlers write through the `db`
 * singleton, outside any test transaction.
 *
 * Two rules keep this file green through the port:
 * - one ctx per test (`const c = ctx()`), passed to every request the test
 *   makes, the refusal and the control requests included. `testCtx()` builds a
 *   fresh limiter per call, so a budget test that built one per request would
 *   stop reaching its limit once the legacy module-scope limiter moves into
 *   `ctx.limiter` — and a golden may only change by losing a `.skip` after S2.
 * - a refusal is pinned whole, `expect({ status, body })`, so an extra key the
 *   kernel `errorBody` may spread later cannot slip through.
 *
 * Every budget test also pins its key shape after the 429: a control request
 * from a new IP and one from a new address / person, so "per IP", "per address"
 * and "per person + IP" stay what they are (`rateLimit.ts:28-33`).
 *
 * The success paths that really send an email are spec-goldens at the bottom
 * (skipped today, activated in S6); the reason and the exact shape are in
 * docs/rewrite/modules/access.md#notes. Owner accidents are pinned where they
 * live and name their question: Q-102 (a sign-in link resets a password),
 * Q-103 (an email-change request revives a used reset link), Q-104 (reset
 * leaves `auth_account.password` stale), Q-105 (logout sends no `Set-Cookie`).
 * The owner answered all four (B, B, C, B) after this file froze, so each fix
 * lands after S6 as its own `fix(access)` commit that changes the golden
 * first — until then these tests pin today's behaviour on purpose.
 *
 * Doc: ./README.md#how-to-test
 */
import { createHash } from 'node:crypto';
import { eq } from 'drizzle-orm';
import { TimeSpan } from 'oslo';
import { createJWT, parseJWT } from 'oslo/jwt';
import { beforeEach, describe, expect, it } from 'vitest';
import {
	accounts,
	apiTokens,
	authAccount,
	authSession,
	calendars,
	claimTokens,
	codes,
	userSettings,
	users
} from '$lib/kernel/db/tables.server';
import {
	invoke,
	type AnyRouteHandler,
	type InvokeOptions
} from '$lib/kernel/testing/invokeHandlers.server';
import { seedUser } from '$lib/kernel/testing/seedRows.server';
import { testCtx } from '$lib/kernel/testing/testCtx.server';
import { testDb, truncateAll } from '$lib/kernel/testing/testDb.server';
import type { JsonValue } from '$lib/kernel/validation/validators';
// The ROUTE modules, not the legacy services: after the port these files
// re-export the new handlers, so this import never changes.
import { POST as postLogout } from '../../../routes/api/logout/+server';
import { POST as postClaim } from '../../../routes/api/me/claim/+server';
import { POST as postChangeEmail } from '../../../routes/api/me/email/+server';
import { POST as postVerifyEmail } from '../../../routes/api/me/verify-email/+server';
import { POST as postResendVerification } from '../../../routes/api/me/verify-email/resend/+server';
import { POST as postMobileEmail } from '../../../routes/api/mobile/auth/email/+server';
import { POST as postMobileForgot } from '../../../routes/api/mobile/auth/forgot/+server';
import { POST as postMobileGuest } from '../../../routes/api/mobile/auth/guest/+server';
import { POST as postMobileLogout } from '../../../routes/api/mobile/auth/logout/+server';
import { POST as postMobilePassword } from '../../../routes/api/mobile/auth/password/+server';
import { POST as postMobileReset } from '../../../routes/api/mobile/auth/reset/+server';
import { POST as postMobileSignup } from '../../../routes/api/mobile/auth/signup/+server';
import { POST as postMobileVerify } from '../../../routes/api/mobile/auth/verify/+server';
// The two page-group JSON endpoints the auth pages POST to (Q-064). They are
// not page loads or form actions: the client fetches them and reads JSON.
import { POST as postLoginEmailCode } from '../../../routes/(marketing)/login/email/code/+server';
import { POST as postSignupEmailCode } from '../../../routes/(marketing)/signup/email/code/+server';
import {
	ACCESS_ANON_DOMAIN,
	ACCESS_PASSWORD_HASH,
	seedAccessApiToken,
	seedAccessAuthAccount,
	seedAccessEmailCode,
	seedAccessGuest,
	seedAccessPasswordUser,
	seedAccessProviderAccount,
	seedAccessSession
} from './access.fixtures.server';

const db = () => testDb();
const ctx = () => testCtx({ db: testDb() });

/**
 * The secret SvelteKit bakes into `$env/static/private` for this project: the
 * shell value wins over `.env.test` (Vite gives process.env priority), so read
 * it first and fall back to the committed test value. A v2 file may not import
 * `$env` (R6), but a test may read the environment (R5/R6 skip tests).
 */
const EMAIL_SECRET = process.env.EMAILSECRET ?? 'test-email-secret-key-for-testing-only-32chars';

/** A minted personal API token: `fp_` + 43 base64url characters. */
const FP_TOKEN = /^fp_[A-Za-z0-9_-]{43}$/;

/** The plaintext of {@link ACCESS_PASSWORD_HASH}: a real bcrypt compare, no hashing here. */
const PASSWORD = 'correct-horse-battery';

/** sha256 hex — the only form of a code, token or Claim link that reaches a row. */
const sha256 = (value: string) => createHash('sha256').update(value).digest('hex');

function first<T>(rows: readonly T[]): T {
	const [row] = rows;
	if (row === undefined) throw new Error('expected at least one row');
	return row;
}

async function rowsOfEmail(email: string) {
	return db().select().from(codes).where(eq(codes.email, email));
}

async function tokensFor(userId: string) {
	return db().select().from(apiTokens).where(eq(apiTokens.userId, userId));
}

/** Mints a JWT with the e-mail secret, the way a flow mints its link. */
async function mintEmailJwt(payload: Record<string, string>, minutes = 60): Promise<string> {
	return createJWT('HS256', new TextEncoder().encode(EMAIL_SECRET), payload, {
		headers: { alg: 'HS256', typ: 'JWT' },
		expiresIn: new TimeSpan(minutes, 'm')
	});
}

/** The 60-minute reset JWT the forgot-password email carries (`reset` reads it back). */
async function mintResetToken(email: string): Promise<string> {
	return mintEmailJwt({ email });
}

type RedirectTarget = {
	readonly status: number;
	readonly location: string | null;
	/** `Set-Cookie` when the route answers a Response; null when it throws Kit's `redirect`. */
	readonly setCookie: string | null;
};

/**
 * `@sveltejs/kit` `redirect()` throws, so `invoke` rejects for this route. The
 * ported endpoint may instead answer a plain 302; accept both shapes.
 */
async function invokeRedirect(
	handler: AnyRouteHandler<Response>,
	options: InvokeOptions
): Promise<RedirectTarget> {
	try {
		const res = await invoke(handler, options);
		return {
			status: res.status,
			location: res.headers.get('location'),
			setCookie: res.headers.get('set-cookie')
		};
	} catch (error) {
		if (typeof error === 'object' && error !== null && 'status' in error && 'location' in error) {
			const status: unknown = error.status;
			const location: unknown = error.location;
			if (typeof status === 'number' && typeof location === 'string') {
				return { status, location, setCookie: null };
			}
		}
		throw error;
	}
}

/** One `it.each` row: a body to POST and the IP that request comes from. */
type BodyCase = {
	readonly label: string;
	readonly ip: string;
	readonly options: { readonly body?: JsonValue; readonly rawBody?: string };
};

beforeEach(truncateAll);

describe('POST /api/logout', () => {
	it('answers 302 / when signed out (Q-105: no Set-Cookie)', async () => {
		const c = ctx();
		const res = await invokeRedirect(postLogout, {
			ctx: c,
			method: 'POST',
			path: '/api/logout'
		});
		// Q-105: today the handler throws Kit's `redirect(302, '/')`, which carries
		// status + location and no header channel at all, so the session cookie is
		// never cleared; the dead row-less cookie expires on its own. A ported
		// endpoint answering a plain 302 must send no `Set-Cookie` either. The owner
		// chose B (clear it with an expired `Set-Cookie`): that lands after S6 as a
		// `fix(access)` commit which changes this expectation first.
		expect(res).toEqual({ status: 302, location: '/', setCookie: null });
	});

	// `invoke` cannot inject `locals.session` (the harness pins it to null), so
	// the delete-the-session-row half is pinned by the S5 service test.
});

describe('POST /api/me/claim', () => {
	it('answers 401 {"error":"Unauthorized"} when signed out', async () => {
		const c = ctx();
		const res = await invoke(postClaim, {
			ctx: c,
			path: '/api/me/claim',
			headers: { 'x-real-ip': '10.1.0.1' },
			body: { email: 'a@example.test' }
		});
		expect({ status: res.status, body: res.body }).toEqual({
			status: 401,
			body: { error: 'Unauthorized' }
		});
	});

	it('answers 400 {"error":"Invalid JSON"} for a malformed body', async () => {
		const c = ctx();
		const guest = await seedAccessGuest();
		const res = await invoke(postClaim, {
			ctx: c,
			user: guest,
			path: '/api/me/claim',
			headers: { 'x-real-ip': '10.1.0.2' },
			rawBody: '{not json'
		});
		expect({ status: res.status, body: res.body }).toEqual({
			status: 400,
			body: { error: 'Invalid JSON' }
		});
	});

	it('refuses a non-guest with Account already has an email', async () => {
		const c = ctx();
		const user = await seedUser(db(), { email: 'claim-registered@example.test' });
		const res = await invoke(postClaim, {
			ctx: c,
			user,
			path: '/api/me/claim',
			headers: { 'x-real-ip': '10.1.0.3' },
			body: { email: 'other@example.test' }
		});
		expect({ status: res.status, body: res.body }).toEqual({
			status: 400,
			body: { error: 'Account already has an email' }
		});
	});

	const badAddressCases = [
		{
			label: 'an absent email',
			ip: '10.1.1.1',
			options: { body: {} }
		},
		{ label: 'a null email', ip: '10.1.1.2', options: { body: { email: null } } },
		{ label: 'a number', ip: '10.1.1.3', options: { body: { email: 42 } } },
		// `claimRequest.ts:57` alone requires a dot in the domain (forgot-password
		// does not, `forgot-password/+server.ts:50`): pin the stricter one here.
		{ label: 'an address without a dot', ip: '10.1.1.4', options: { body: { email: 'nope' } } }
	] as const satisfies readonly BodyCase[];

	it.each(badAddressCases)('reads $label as "" and asks for a valid address', async (testCase) => {
		const c = ctx();
		const guest = await seedAccessGuest();
		const res = await invoke(postClaim, {
			ctx: c,
			user: guest,
			path: '/api/me/claim',
			headers: { 'x-real-ip': testCase.ip },
			...testCase.options
		});
		expect({ status: res.status, body: res.body }).toEqual({
			status: 400,
			body: { error: 'Please enter a valid email address' }
		});
	});
});

describe('POST /api/me/email', () => {
	it('answers 401 {"error":"Unauthorized"} when signed out', async () => {
		const c = ctx();
		const res = await invoke(postChangeEmail, {
			ctx: c,
			path: '/api/me/email',
			headers: { 'x-real-ip': '10.2.0.1' },
			body: { email: 'new@example.test' }
		});
		expect({ status: res.status, body: res.body }).toEqual({
			status: 401,
			body: { error: 'Unauthorized' }
		});
	});

	it('answers 400 {"error":"Invalid JSON"} for a malformed body', async () => {
		const c = ctx();
		const user = await seedUser(db(), { email: 'change-json@example.test' });
		const res = await invoke(postChangeEmail, {
			ctx: c,
			user,
			path: '/api/me/email',
			headers: { 'x-real-ip': '10.2.0.2' },
			rawBody: '[]'
		});
		expect({ status: res.status, body: res.body }).toEqual({
			status: 400,
			body: { error: 'Invalid JSON' }
		});
	});

	it('refuses a guest with guestNeedsClaim', async () => {
		const c = ctx();
		const guest = await seedAccessGuest();
		const res = await invoke(postChangeEmail, {
			ctx: c,
			user: guest,
			path: '/api/me/email',
			headers: { 'x-real-ip': '10.2.0.3' },
			body: { email: 'new@example.test' }
		});
		expect({ status: res.status, body: res.body }).toEqual({
			status: 400,
			body: {
				error:
					"You're using a guest calendar — add your first email from the Save-your-calendar banner instead.",
				guestNeedsClaim: true
			}
		});
	});

	it('requires an address with an @, and one that differs from the current one', async () => {
		const c = ctx();
		const user = await seedUser(db(), { email: 'change-same@example.test' });
		// `accountData.ts:338` is `!email || !email.includes('@')` — the one check
		// this route keeps (Decision 2): no dot rule, no case folding.
		const invalid = await invoke(postChangeEmail, {
			ctx: c,
			user,
			path: '/api/me/email',
			headers: { 'x-real-ip': '10.2.0.4' },
			body: { email: 'nope' }
		});
		expect({ status: invalid.status, body: invalid.body }).toEqual({
			status: 400,
			body: { error: 'Valid email is required' }
		});

		const same = await invoke(postChangeEmail, {
			ctx: c,
			user,
			path: '/api/me/email',
			headers: { 'x-real-ip': '10.2.0.5' },
			body: { email: 'change-same@example.test' }
		});
		expect({ status: same.status, body: same.body }).toEqual({
			status: 400,
			body: { error: 'New email must be different from current email' }
		});
	});

	it('throttles at 3 attempts per 15 minutes per person and IP', async () => {
		const c = ctx();
		const user = await seedUser(db(), { email: 'change-429@example.test' });
		const other = await seedUser(db(), { email: 'change-429-other@example.test' });
		// `email === null` reads as '' after the guest and throttle checks, so every
		// allowed attempt is a mail-free 400 (`accountData.ts:320-340`).
		const send = (ip: string, who = user) =>
			invoke(postChangeEmail, {
				ctx: c,
				user: who,
				path: '/api/me/email',
				headers: { 'x-real-ip': ip },
				body: { email: null }
			});
		for (let attempt = 0; attempt < 3; attempt += 1) {
			const allowed = await send('10.2.1.1');
			expect({ status: allowed.status, body: allowed.body }).toEqual({
				status: 400,
				body: { error: 'Valid email is required' }
			});
		}
		const refused = await send('10.2.1.1');
		expect({ status: refused.status, body: refused.body }).toEqual({
			status: 429,
			body: { error: 'Too many attempts. Try again shortly.' }
		});

		// The key is `email-change:<userId>:<ip>`: a new IP is a new bucket, and so
		// is the same IP for another person.
		const newIp = await send('10.2.1.2');
		expect({ status: newIp.status, body: newIp.body }).toEqual({
			status: 400,
			body: { error: 'Valid email is required' }
		});
		const newPerson = await send('10.2.1.1', other);
		expect({ status: newPerson.status, body: newPerson.body }).toEqual({
			status: 400,
			body: { error: 'Valid email is required' }
		});
	});
});

describe('POST /api/me/verify-email', () => {
	it('answers 401 {"error":"Unauthorized"} when signed out', async () => {
		const c = ctx();
		const res = await invoke(postVerifyEmail, {
			ctx: c,
			path: '/api/me/verify-email',
			headers: { 'x-real-ip': '10.3.0.1' },
			body: { code: '12345678' }
		});
		expect({ status: res.status, body: res.body }).toEqual({
			status: 401,
			body: { error: 'Unauthorized' }
		});
	});

	it('answers 401 for a person row with no email at all', async () => {
		const c = ctx();
		const user = await seedUser(db(), { email: null });
		const res = await invoke(postVerifyEmail, {
			ctx: c,
			user,
			path: '/api/me/verify-email',
			headers: { 'x-real-ip': '10.3.0.2' },
			body: { code: '12345678' }
		});
		expect({ status: res.status, body: res.body }).toEqual({
			status: 401,
			body: { error: 'Unauthorized' }
		});
	});

	it('answers 400 {"error":"Invalid JSON"} for a malformed body', async () => {
		const c = ctx();
		const user = await seedUser(db(), { email: 'verify-json@example.test' });
		const res = await invoke(postVerifyEmail, {
			ctx: c,
			user,
			path: '/api/me/verify-email',
			headers: { 'x-real-ip': '10.3.0.3' },
			rawBody: 'nope'
		});
		expect({ status: res.status, body: res.body }).toEqual({
			status: 400,
			body: { error: 'Invalid JSON' }
		});
	});

	it('verifies the caller’s own address and burns the code', async () => {
		const c = ctx();
		const user = await seedUser(db(), {
			email: 'verify-ok@example.test',
			emailVerified: false
		});
		await seedAccessEmailCode({
			code: '24681357',
			email: 'verify-ok@example.test',
			type: 'password-signup'
		});
		const res = await invoke(postVerifyEmail, {
			ctx: c,
			user,
			path: '/api/me/verify-email',
			headers: { 'x-real-ip': '10.3.0.4' },
			body: { code: ' 24681357 ' }
		});
		expect({ status: res.status, body: res.body }).toEqual({
			status: 200,
			body: { success: true }
		});
		const [row] = await db().select().from(users).where(eq(users.id, user.id));
		expect(row.emailVerified).toBe(true);
		expect(await rowsOfEmail('verify-ok@example.test')).toEqual([]);
	});

	it('ignores an email in the body: the caller’s own address is the only one it reads', async () => {
		const c = ctx();
		const caller = await seedUser(db(), {
			email: 'verify-owner@example.test',
			emailVerified: false
		});
		const other = await seedUser(db(), {
			email: 'verify-victim@example.test',
			emailVerified: false
		});
		await seedAccessEmailCode({
			code: '10293847',
			email: 'verify-victim@example.test',
			type: 'password-signup'
		});
		const res = await invoke(postVerifyEmail, {
			ctx: c,
			user: caller,
			path: '/api/me/verify-email',
			headers: { 'x-real-ip': '10.3.0.5' },
			body: { code: '10293847', email: 'verify-victim@example.test' }
		});
		// `/api/me/verify-email:17-24` forwards `{code, email: auth.user.email}`,
		// overwriting whatever the body carried.
		expect({ status: res.status, body: res.body }).toEqual({
			status: 400,
			body: { success: false, error: 'Unexpected error, please try again' }
		});
		expect(await rowsOfEmail('verify-victim@example.test')).toHaveLength(1);
		const [victim] = await db().select().from(users).where(eq(users.id, other.id));
		expect(victim.emailVerified).toBe(false);
	});

	it('rejects a code of another type with the one generic 400', async () => {
		const c = ctx();
		const user = await seedUser(db(), {
			email: 'verify-type@example.test',
			emailVerified: false
		});
		await seedAccessEmailCode({
			code: '33445566',
			email: 'verify-type@example.test',
			type: 'login'
		});
		const res = await invoke(postVerifyEmail, {
			ctx: c,
			user,
			path: '/api/me/verify-email',
			headers: { 'x-real-ip': '10.3.0.6' },
			body: { code: '33445566' }
		});
		expect({ status: res.status, body: res.body }).toEqual({
			status: 400,
			body: { success: false, error: 'Unexpected error, please try again' }
		});
		expect(await rowsOfEmail('verify-type@example.test')).toHaveLength(1);
	});

	it('refuses an expired code and deletes it first', async () => {
		const c = ctx();
		const user = await seedUser(db(), {
			email: 'verify-expired@example.test',
			emailVerified: false
		});
		// `deleteDeadCodes` (`codes.ts:80`) runs before the lookup, so the row is
		// gone by the time the handler looks for it — same generic 400 either way.
		await seedAccessEmailCode({
			code: '76543210',
			email: 'verify-expired@example.test',
			type: 'password-signup',
			expiresAt: new Date('2020-01-01T00:00:00.000Z')
		});
		const res = await invoke(postVerifyEmail, {
			ctx: c,
			user,
			path: '/api/me/verify-email',
			headers: { 'x-real-ip': '10.3.0.7' },
			body: { code: '76543210' }
		});
		expect({ status: res.status, body: res.body }).toEqual({
			status: 400,
			body: { success: false, error: 'Unexpected error, please try again' }
		});
		expect(await rowsOfEmail('verify-expired@example.test')).toEqual([]);
	});

	const badCodeCases = [
		{ label: 'an absent code', ip: '10.3.1.1', options: { body: {} } },
		{ label: 'a null code', ip: '10.3.1.2', options: { body: { code: null } } },
		{ label: 'a number', ip: '10.3.1.3', options: { body: { code: 7 } } }
	] as const satisfies readonly BodyCase[];

	it.each(badCodeCases)('answers the generic 400 for $label', async (testCase) => {
		const c = ctx();
		const user = await seedUser(db(), { email: 'verify-absent@example.test' });
		const res = await invoke(postVerifyEmail, {
			ctx: c,
			user,
			path: '/api/me/verify-email',
			headers: { 'x-real-ip': testCase.ip },
			...testCase.options
		});
		expect({ status: res.status, body: res.body }).toEqual({
			status: 400,
			body: { success: false, error: 'Unexpected error, please try again' }
		});
	});

	it('throttles code guessing at 10 per 15 minutes per IP', async () => {
		const c = ctx();
		const user = await seedUser(db(), { email: 'verify-429@example.test' });
		const other = await seedUser(db(), { email: 'verify-429-other@example.test' });
		const send = (ip: string, who = user) =>
			invoke(postVerifyEmail, {
				ctx: c,
				user: who,
				path: '/api/me/verify-email',
				headers: { 'x-real-ip': ip },
				body: { code: '00000000' }
			});
		for (let attempt = 0; attempt < 10; attempt += 1) {
			const allowed = await send('10.3.2.1');
			expect(allowed.status).toBe(400);
		}
		const refused = await send('10.3.2.1');
		expect({ status: refused.status, body: refused.body }).toEqual({
			status: 429,
			body: { success: false, error: 'Too many attempts. Try again shortly.' }
		});

		// `pw-verify-code` is IP-only (`signup/password/verify/+server.ts:47`): a
		// different caller from the same IP is still refused, a new IP is not.
		const sameIpOtherUser = await send('10.3.2.1', other);
		expect({ status: sameIpOtherUser.status, body: sameIpOtherUser.body }).toEqual({
			status: 429,
			body: { success: false, error: 'Too many attempts. Try again shortly.' }
		});
		const newIp = await send('10.3.2.2');
		expect({ status: newIp.status, body: newIp.body }).toEqual({
			status: 400,
			body: { success: false, error: 'Unexpected error, please try again' }
		});
	});
});

describe('POST /api/me/verify-email/resend', () => {
	it('answers 401 {"error":"Unauthorized"} when signed out', async () => {
		const c = ctx();
		const res = await invoke(postResendVerification, {
			ctx: c,
			path: '/api/me/verify-email/resend',
			headers: { 'x-real-ip': '10.4.0.1' }
		});
		expect({ status: res.status, body: res.body }).toEqual({
			status: 401,
			body: { error: 'Unauthorized' }
		});
	});

	it('answers 401 for an Anonymous Account (nothing to resend to)', async () => {
		const c = ctx();
		const guest = await seedAccessGuest();
		const res = await invoke(postResendVerification, {
			ctx: c,
			user: guest,
			path: '/api/me/verify-email/resend',
			headers: { 'x-real-ip': '10.4.0.2' }
		});
		expect({ status: res.status, body: res.body }).toEqual({
			status: 401,
			body: { error: 'Unauthorized' }
		});
	});

	it('answers {success:true} without emailing once verified', async () => {
		const c = ctx();
		const user = await seedUser(db(), {
			email: 'resend-verified@example.test',
			emailVerified: true
		});
		const res = await invoke(postResendVerification, {
			ctx: c,
			user,
			path: '/api/me/verify-email/resend',
			headers: { 'x-real-ip': '10.4.0.3' }
		});
		expect({ status: res.status, body: res.body }).toEqual({
			status: 200,
			body: { success: true }
		});
		expect(await rowsOfEmail('resend-verified@example.test')).toEqual([]);
	});

	it('throttles resends at 5 per 15 minutes per person and IP', async () => {
		const c = ctx();
		const user = await seedUser(db(), {
			email: 'resend-429@example.test',
			emailVerified: true
		});
		const other = await seedUser(db(), {
			email: 'resend-429-other@example.test',
			emailVerified: true
		});
		const send = (ip: string, who = user) =>
			invoke(postResendVerification, {
				ctx: c,
				user: who,
				path: '/api/me/verify-email/resend',
				headers: { 'x-real-ip': ip }
			});
		for (let attempt = 0; attempt < 5; attempt += 1) {
			const allowed = await send('10.4.1.1');
			expect(allowed.status).toBe(200);
		}
		const refused = await send('10.4.1.1');
		expect({ status: refused.status, body: refused.body }).toEqual({
			status: 429,
			body: { error: 'Too many attempts. Try again shortly.' }
		});

		// `pw-resend:<userId>` folds the IP in; `pw-resend-ip` is the second gate.
		const newIp = await send('10.4.1.2');
		expect({ status: newIp.status, body: newIp.body }).toEqual({
			status: 200,
			body: { success: true }
		});
		const sameIp = await send('10.4.1.1', other);
		expect({ status: sameIp.status, body: sameIp.body }).toEqual({
			status: 200,
			body: { success: true }
		});
	});

	it('throttles resends at 30 per 5 minutes per IP across people', async () => {
		const c = ctx();
		const people = await Promise.all(
			Array.from({ length: 31 }, (_, index) =>
				seedUser(db(), {
					email: `resend-spray-${index}@example.test`,
					emailVerified: true
				})
			)
		);
		const send = (ip: string, who: (typeof people)[number]) =>
			invoke(postResendVerification, {
				ctx: c,
				user: who,
				path: '/api/me/verify-email/resend',
				headers: { 'x-real-ip': ip }
			});
		for (const person of people.slice(0, 30)) {
			const allowed = await send('10.4.2.1', person);
			expect({ status: allowed.status, body: allowed.body }).toEqual({
				status: 200,
				body: { success: true }
			});
		}
		const refused = await send('10.4.2.1', people[30]);
		expect({ status: refused.status, body: refused.body }).toEqual({
			status: 429,
			body: { error: 'Too many attempts. Try again shortly.' }
		});

		// The IP bucket does not know the person: a fresh person from the same IP is
		// still refused, the same person from a new IP is not.
		const sameIp = await send('10.4.2.1', people[30]);
		expect({ status: sameIp.status, body: sameIp.body }).toEqual({
			status: 429,
			body: { error: 'Too many attempts. Try again shortly.' }
		});
		const newIp = await send('10.4.2.2', people[0]);
		expect({ status: newIp.status, body: newIp.body }).toEqual({
			status: 200,
			body: { success: true }
		});
	});
});

describe('POST /api/mobile/auth/email', () => {
	const notJsonCases = [
		{ label: 'malformed JSON', ip: '10.5.0.1', options: { rawBody: '{not json' } },
		{ label: 'an array', ip: '10.5.0.2', options: { body: [1, 2] } },
		{ label: 'null', ip: '10.5.0.3', options: { body: null } }
	] as const satisfies readonly BodyCase[];

	it.each(notJsonCases)(
		'answers 400 {"error":"Request body must be JSON"} for $label',
		async (testCase) => {
			const c = ctx();
			const res = await invoke(postMobileEmail, {
				ctx: c,
				path: '/api/mobile/auth/email',
				headers: { 'x-real-ip': testCase.ip },
				...testCase.options
			});
			expect({ status: res.status, body: res.body }).toEqual({
				status: 400,
				body: { error: 'Request body must be JSON' }
			});
		}
	);

	it('validates the address, then the intent, then the signup names', async () => {
		const c = ctx();
		const noEmail = await invoke(postMobileEmail, {
			ctx: c,
			path: '/api/mobile/auth/email',
			headers: { 'x-real-ip': '10.5.1.1' },
			body: {}
		});
		expect({ status: noEmail.status, body: noEmail.body }).toEqual({
			status: 400,
			body: { error: 'Enter a valid email' }
		});

		const noIntent = await invoke(postMobileEmail, {
			ctx: c,
			path: '/api/mobile/auth/email',
			headers: { 'x-real-ip': '10.5.1.2' },
			body: { email: 'intent@example.test' }
		});
		expect({ status: noIntent.status, body: noIntent.body }).toEqual({
			status: 400,
			body: { error: 'intent must be "login" or "signup"' }
		});

		const noNames = await invoke(postMobileEmail, {
			ctx: c,
			path: '/api/mobile/auth/email',
			headers: { 'x-real-ip': '10.5.1.3' },
			body: { email: 'names@example.test', intent: 'signup' }
		});
		expect({ status: noNames.status, body: noNames.body }).toEqual({
			status: 400,
			body: { error: 'First and last name are required' }
		});
	});

	it('answers {sent:true} and sends nothing for an unknown login', async () => {
		const c = ctx();
		const email = 'unknown-login@example.test';
		const res = await invoke(postMobileEmail, {
			ctx: c,
			path: '/api/mobile/auth/email',
			headers: { 'x-real-ip': '10.5.2.1' },
			body: { email, intent: 'login' }
		});
		expect({ status: res.status, body: res.body }).toEqual({
			status: 200,
			body: { sent: true }
		});
		expect(res.headers.get('set-cookie')).toBeNull();
		expect(await rowsOfEmail(email)).toEqual([]);
	});

	it('answers {sent:true} and writes no code for an already-registered signup address', async () => {
		const c = ctx();
		const email = 'registered-signup@example.test';
		await seedUser(db(), { email });
		const res = await invoke(postMobileEmail, {
			ctx: c,
			path: '/api/mobile/auth/email',
			headers: { 'x-real-ip': '10.5.2.2' },
			body: { email, intent: 'signup', firstName: 'Mia', lastName: 'Lopez' }
		});
		expect({ status: res.status, body: res.body }).toEqual({
			status: 200,
			body: { sent: true }
		});
		expect(await rowsOfEmail(email)).toEqual([]);
	});

	it('rate-limits one address at 5 emails per 15 minutes → 429', async () => {
		const c = ctx();
		const email = 'email-429@example.test';
		const send = (ip: string, address = email) =>
			invoke(postMobileEmail, {
				ctx: c,
				path: '/api/mobile/auth/email',
				headers: { 'x-real-ip': ip },
				body: { email: address, intent: 'login' }
			});
		for (let attempt = 0; attempt < 5; attempt += 1) {
			const allowed = await send('10.5.3.1');
			expect(allowed.status).toBe(200);
		}
		const refused = await send('10.5.3.1');
		expect({ status: refused.status, body: refused.body }).toEqual({
			status: 429,
			body: { error: 'Too many attempts — try again in a few minutes' }
		});

		// The key is `login-code:<email>:<ip>`: the same address from a new IP, and
		// a new address from the same IP, both still get a send.
		const newIp = await send('10.5.3.2');
		expect({ status: newIp.status, body: newIp.body }).toEqual({
			status: 200,
			body: { sent: true }
		});
		const newAddress = await send('10.5.3.1', 'email-429-other@example.test');
		expect({ status: newAddress.status, body: newAddress.body }).toEqual({
			status: 200,
			body: { sent: true }
		});
	});
});

describe('POST /api/mobile/auth/verify', () => {
	it('answers 400 {"error":"Request body must be JSON"} for a malformed body', async () => {
		const c = ctx();
		const res = await invoke(postMobileVerify, {
			ctx: c,
			path: '/api/mobile/auth/verify',
			headers: { 'x-real-ip': '10.6.0.1' },
			rawBody: 'not json'
		});
		expect({ status: res.status, body: res.body }).toEqual({
			status: 400,
			body: { error: 'Request body must be JSON' }
		});
	});

	it('validates the address and the intent before touching a code', async () => {
		const c = ctx();
		const noEmail = await invoke(postMobileVerify, {
			ctx: c,
			path: '/api/mobile/auth/verify',
			headers: { 'x-real-ip': '10.6.0.2' },
			body: { code: '12345678', intent: 'login' }
		});
		expect({ status: noEmail.status, body: noEmail.body }).toEqual({
			status: 400,
			body: { error: 'Enter a valid email' }
		});

		const noIntent = await invoke(postMobileVerify, {
			ctx: c,
			path: '/api/mobile/auth/verify',
			headers: { 'x-real-ip': '10.6.0.3' },
			body: { code: '12345678', email: 'a@example.test' }
		});
		expect({ status: noIntent.status, body: noIntent.body }).toEqual({
			status: 400,
			body: { error: 'intent must be "login" or "signup"' }
		});
	});

	const noCodeCases = [
		{
			label: 'an absent code',
			ip: '10.6.1.1',
			options: { body: { email: 'nocode@example.test', intent: 'login' } }
		},
		{
			label: 'a null code',
			ip: '10.6.1.2',
			options: { body: { email: 'nocode@example.test', intent: 'login', code: null } }
		}
	] as const satisfies readonly BodyCase[];

	it.each(noCodeCases)('reads $label as "That code is wrong or expired"', async (testCase) => {
		const c = ctx();
		const res = await invoke(postMobileVerify, {
			ctx: c,
			path: '/api/mobile/auth/verify',
			headers: { 'x-real-ip': testCase.ip },
			...testCase.options
		});
		expect({ status: res.status, body: res.body }).toEqual({
			status: 400,
			body: { error: 'That code is wrong or expired' }
		});
	});

	it('refuses a code minted for the other intent with the one generic 400', async () => {
		const c = ctx();
		await seedAccessEmailCode({
			code: '11223344',
			email: 'cross-intent@example.test',
			type: 'signup',
			firstName: 'Mia',
			lastName: 'Lopez'
		});
		const res = await invoke(postMobileVerify, {
			ctx: c,
			path: '/api/mobile/auth/verify',
			headers: { 'x-real-ip': '10.6.1.3' },
			body: { email: 'cross-intent@example.test', intent: 'login', code: '11223344' }
		});
		expect({ status: res.status, body: res.body }).toEqual({
			status: 400,
			body: { error: 'That code is wrong or expired' }
		});
	});

	it('answers {token,user} and sets no cookie', async () => {
		const c = ctx();
		const email = 'verify-login@example.test';
		const user = await seedUser(db(), { email, firstName: 'Mia', lastName: 'Lopez' });
		await seedAccessEmailCode({ code: '13572468', email, type: 'login' });
		const res = await invoke(postMobileVerify, {
			ctx: c,
			path: '/api/mobile/auth/verify',
			headers: { 'x-real-ip': '10.6.2.1' },
			body: { email, intent: 'login', code: '13572468' }
		});
		expect(res.status).toBe(200);
		expect(res.body).toEqual({
			token: expect.stringMatching(FP_TOKEN),
			user: { id: user.id, firstName: 'Mia', lastName: 'Lopez', email }
		});
		expect(res.headers.get('set-cookie')).toBeNull();
		const tokens = await tokensFor(user.id);
		expect(tokens.map((row) => row.name)).toEqual(['Android — Android']);
		expect(tokens.map((row) => row.lastUsedAt)).toEqual([null]);
	});

	it('resolves a provider account before the user row', async () => {
		const c = ctx();
		const owner = await seedUser(db(), {
			email: 'account-owner@example.test',
			firstName: 'Ada',
			lastName: 'Byron'
		});
		// `mobileAuth.ts:291-292`: `getAccount(email)` wins over `getUserByEmail`,
		// so the session's address is the account's owner, not the code's email.
		await seedAccessProviderAccount('via-account@example.test', owner.id);
		await seedAccessEmailCode({
			code: '24682468',
			email: 'via-account@example.test',
			type: 'login'
		});
		const res = await invoke(postMobileVerify, {
			ctx: c,
			path: '/api/mobile/auth/verify',
			headers: { 'x-real-ip': '10.6.2.2' },
			body: { email: 'via-account@example.test', intent: 'login', code: '24682468' }
		});
		expect(res.status).toBe(200);
		expect(res.body).toEqual({
			token: expect.stringMatching(FP_TOKEN),
			user: {
				id: owner.id,
				firstName: 'Ada',
				lastName: 'Byron',
				email: 'account-owner@example.test'
			}
		});
		expect(await rowsOfEmail('via-account@example.test')).toEqual([]);
	});

	it('burns the code so it cannot be redeemed twice', async () => {
		const c = ctx();
		const email = 'verify-once@example.test';
		await seedUser(db(), { email });
		await seedAccessEmailCode({ code: '99887766', email, type: 'login' });
		const send = () =>
			invoke(postMobileVerify, {
				ctx: c,
				path: '/api/mobile/auth/verify',
				headers: { 'x-real-ip': '10.6.2.3' },
				body: { email, intent: 'login', code: '99887766' }
			});
		expect((await send()).status).toBe(200);
		const second = await send();
		expect({ status: second.status, body: second.body }).toEqual({
			status: 400,
			body: { error: 'That code is wrong or expired' }
		});
		expect(await rowsOfEmail(email)).toEqual([]);
	});

	it('refuses an expired code and deletes it first', async () => {
		const c = ctx();
		const email = 'verify-expired-mobile@example.test';
		await seedUser(db(), { email });
		// `mobileAuth.ts:273` runs `deleteDeadCodes` before the lookup (`codes.ts:80`).
		await seedAccessEmailCode({
			code: '55661122',
			email,
			type: 'login',
			expiresAt: new Date('2020-01-01T00:00:00.000Z')
		});
		const res = await invoke(postMobileVerify, {
			ctx: c,
			path: '/api/mobile/auth/verify',
			headers: { 'x-real-ip': '10.6.2.4' },
			body: { email, intent: 'login', code: '55661122' }
		});
		expect({ status: res.status, body: res.body }).toEqual({
			status: 400,
			body: { error: 'That code is wrong or expired' }
		});
		expect(await rowsOfEmail(email)).toEqual([]);
	});

	it('answers 400 and keeps the row when a login code has no account at all', async () => {
		const c = ctx();
		const email = 'verify-orphan-mobile@example.test';
		await seedAccessEmailCode({ code: '33441122', email, type: 'login' });
		const res = await invoke(postMobileVerify, {
			ctx: c,
			path: '/api/mobile/auth/verify',
			headers: { 'x-real-ip': '10.6.2.5' },
			body: { email, intent: 'login', code: '33441122' }
		});
		expect({ status: res.status, body: res.body }).toEqual({
			status: 400,
			body: { error: 'That code is wrong or expired' }
		});
		// `mobileAuth.ts:293-294` returns before `deleteHashedCode`: unlike the web
		// verify, a login code with nobody behind it stays for its full 15 minutes.
		expect(await rowsOfEmail(email)).toHaveLength(1);
	});

	it('creates the account on a signup code, from the names stored with it', async () => {
		const c = ctx();
		const email = 'verify-signup@example.test';
		await seedAccessEmailCode({
			code: '44556677',
			email,
			type: 'signup',
			firstName: 'Noah',
			lastName: 'Kim'
		});
		const res = await invoke(postMobileVerify, {
			ctx: c,
			path: '/api/mobile/auth/verify',
			headers: { 'x-real-ip': '10.6.2.6' },
			body: { email, intent: 'signup', code: '44556677', deviceName: '  Pixel 9 Pro  ' }
		});
		expect(res.status).toBe(200);
		expect(res.body).toEqual({
			token: expect.stringMatching(FP_TOKEN),
			user: {
				id: expect.stringMatching(/^[a-z0-9]{15}$/),
				firstName: 'Noah',
				lastName: 'Kim',
				email
			}
		});
		const created = first(await db().select().from(users).where(eq(users.email, email)));
		expect(created.emailVerified).toBe(true);
		const tokens = await tokensFor(created.id);
		expect(tokens.map((row) => row.name)).toEqual(['Android — Pixel 9 Pro']);
		expect(await rowsOfEmail(email)).toEqual([]);
		// `createNewUser.ts:21-32` writes the provider account, the settings row and
		// the personal calendar alongside the user.
		const providerRows = await db()
			.select()
			.from(accounts)
			.where(eq(accounts.userId, created.id));
		expect(providerRows.map((row) => [row.provider, row.providerAccountId])).toEqual([
			['email', email]
		]);
		const settings = await db()
			.select()
			.from(userSettings)
			.where(eq(userSettings.userId, created.id));
		// falso's randHex is `#${Math.random().toString(16).substr(2, 6)}`, so a dyadic
		// draw can yield fewer than six digits (createNewUser.ts:29).
		expect(settings.map((row) => row.color)).toEqual([expect.stringMatching(/^#[0-9a-f]{1,6}$/)]);
		const personalCalendar = await db()
			.select()
			.from(calendars)
			.where(eq(calendars.ownerId, created.id));
		expect(personalCalendar.map((row) => row.familyId)).toEqual([null]);
	});

	it('refuses a signup code row that lost its names with the generic 400', async () => {
		const c = ctx();
		const email = 'verify-names@example.test';
		await seedAccessEmailCode({ code: '55667788', email, type: 'signup' });
		const res = await invoke(postMobileVerify, {
			ctx: c,
			path: '/api/mobile/auth/verify',
			headers: { 'x-real-ip': '10.6.2.7' },
			body: { email, intent: 'signup', code: '55667788' }
		});
		expect({ status: res.status, body: res.body }).toEqual({
			status: 400,
			body: { error: 'That code is wrong or expired' }
		});
	});

	it('refuses a signup whose address got registered meanwhile with 409 and burns the code', async () => {
		const c = ctx();
		const email = 'verify-race@example.test';
		await seedUser(db(), { email });
		await seedAccessEmailCode({
			code: '66778899',
			email,
			type: 'signup',
			firstName: 'Mia',
			lastName: 'Lopez'
		});
		const res = await invoke(postMobileVerify, {
			ctx: c,
			path: '/api/mobile/auth/verify',
			headers: { 'x-real-ip': '10.6.2.8' },
			body: { email, intent: 'signup', code: '66778899' }
		});
		expect({ status: res.status, body: res.body }).toEqual({
			status: 409,
			body: { error: 'An account with this email already exists — sign in instead' }
		});
		expect(await rowsOfEmail(email)).toEqual([]);
		const existing = first(await db().select().from(users).where(eq(users.email, email)));
		expect(await tokensFor(existing.id)).toEqual([]);
	});

	it('throttles code redemption at 10 per 15 minutes per address and IP', async () => {
		const c = ctx();
		const email = 'verify-429@example.test';
		const other = 'verify-429-other@example.test';
		await seedUser(db(), { email });
		await seedUser(db(), { email: other });
		const send = (ip: string, address = email) =>
			invoke(postMobileVerify, {
				ctx: c,
				path: '/api/mobile/auth/verify',
				headers: { 'x-real-ip': ip },
				body: { email: address, intent: 'login', code: '00000000' }
			});
		for (let attempt = 0; attempt < 10; attempt += 1) {
			const allowed = await send('10.6.3.1');
			expect(allowed.status).toBe(400);
		}
		const refused = await send('10.6.3.1');
		expect({ status: refused.status, body: refused.body }).toEqual({
			status: 429,
			body: { error: 'Too many attempts — try again in a few minutes' }
		});

		// The key is `verify-<intent>-code:<email>:<ip>` (`mobileAuth.ts:263-271`).
		const newIp = await send('10.6.3.2');
		expect({ status: newIp.status, body: newIp.body }).toEqual({
			status: 400,
			body: { error: 'That code is wrong or expired' }
		});
		const newAddress = await send('10.6.3.1', other);
		expect({ status: newAddress.status, body: newAddress.body }).toEqual({
			status: 400,
			body: { error: 'That code is wrong or expired' }
		});
	});
});

describe('POST /api/mobile/auth/password', () => {
	it('answers 400 {"error":"Request body must be JSON"} for a malformed body', async () => {
		const c = ctx();
		const res = await invoke(postMobilePassword, {
			ctx: c,
			path: '/api/mobile/auth/password',
			headers: { 'x-real-ip': '10.7.0.1' },
			rawBody: '{"email":'
		});
		expect({ status: res.status, body: res.body }).toEqual({
			status: 400,
			body: { error: 'Request body must be JSON' }
		});
	});

	const missingCases = [
		{ label: 'both absent', ip: '10.7.0.2', options: { body: {} } },
		{
			label: 'an absent password',
			ip: '10.7.0.3',
			options: { body: { email: 'a@example.test' } }
		},
		{
			label: 'an absent email',
			ip: '10.7.0.4',
			options: { body: { password: 'correct-horse-battery' } }
		},
		{
			label: 'a null email',
			ip: '10.7.0.5',
			options: { body: { email: null, password: 'correct-horse-battery' } }
		},
		{
			label: 'an empty password',
			ip: '10.7.0.6',
			options: { body: { email: 'a@example.test', password: '' } }
		}
	] as const satisfies readonly BodyCase[];

	it.each(missingCases)('requires both fields — $label reads the same', async (testCase) => {
		const c = ctx();
		const res = await invoke(postMobilePassword, {
			ctx: c,
			path: '/api/mobile/auth/password',
			headers: { 'x-real-ip': testCase.ip },
			...testCase.options
		});
		expect({ status: res.status, body: res.body }).toEqual({
			status: 400,
			body: { error: 'Email and password are required' }
		});
	});

	it('answers the one generic 401 for an unknown email', async () => {
		const c = ctx();
		const res = await invoke(postMobilePassword, {
			ctx: c,
			path: '/api/mobile/auth/password',
			headers: { 'x-real-ip': '10.7.1.1' },
			body: { email: 'nobody@example.test', password: PASSWORD }
		});
		expect({ status: res.status, body: res.body }).toEqual({
			status: 401,
			body: { error: 'Email or password is incorrect' }
		});
	});

	it('answers the one generic 401 for a wrong password', async () => {
		const c = ctx();
		const email = 'password-wrong@example.test';
		await seedAccessPasswordUser(email);
		const res = await invoke(postMobilePassword, {
			ctx: c,
			path: '/api/mobile/auth/password',
			headers: { 'x-real-ip': '10.7.1.2' },
			body: { email, password: 'not-the-password' }
		});
		expect({ status: res.status, body: res.body }).toEqual({
			status: 401,
			body: { error: 'Email or password is incorrect' }
		});
	});

	it('answers the one generic 401 for a registered account with no password', async () => {
		const c = ctx();
		const email = 'password-never-set@example.test';
		// A registered address with no `passwordHash`: the mobile password door is
		// closed, and says so exactly as it does for an unknown email
		// (`mobileAuth.ts:316-321`, still paying one dummy compare).
		await seedUser(db(), { email, emailVerified: true });
		const res = await invoke(postMobilePassword, {
			ctx: c,
			path: '/api/mobile/auth/password',
			headers: { 'x-real-ip': '10.7.1.3' },
			body: { email, password: PASSWORD }
		});
		expect({ status: res.status, body: res.body }).toEqual({
			status: 401,
			body: { error: 'Email or password is incorrect' }
		});
	});

	it('answers the one generic 401 for an Anonymous Account', async () => {
		const c = ctx();
		const guest = await seedAccessGuest();
		const res = await invoke(postMobilePassword, {
			ctx: c,
			path: '/api/mobile/auth/password',
			headers: { 'x-real-ip': '10.7.1.4' },
			body: { email: guest.email, password: PASSWORD }
		});
		expect({ status: res.status, body: res.body }).toEqual({
			status: 401,
			body: { error: 'Email or password is incorrect' }
		});
	});

	it('signs in with a token, creates the missing settings row and leaks no hash', async () => {
		const c = ctx();
		const email = 'password-ok@example.test';
		const user = await seedAccessPasswordUser(email);
		const res = await invoke(postMobilePassword, {
			ctx: c,
			path: '/api/mobile/auth/password',
			headers: { 'x-real-ip': '10.7.2.1' },
			body: { email, password: PASSWORD, deviceName: 'Pixel 9 Pro' }
		});
		expect(res.status).toBe(200);
		expect(res.body).toEqual({
			token: expect.stringMatching(FP_TOKEN),
			user: { id: user.id, firstName: user.firstName, lastName: user.lastName, email }
		});
		expect(res.headers.get('set-cookie')).toBeNull();
		const [settings] = await db()
			.select()
			.from(userSettings)
			.where(eq(userSettings.userId, user.id));
		expect(settings?.timeZone).toBe('UTC');
		const tokens = await tokensFor(user.id);
		expect(tokens.map((row) => row.name)).toEqual(['Android — Pixel 9 Pro']);
		expect(await db().select().from(users).where(eq(users.email, email))).toHaveLength(1);
	});

	it('signs in an unverified password account: the app never gates on verification', async () => {
		const c = ctx();
		const email = 'password-unverified@example.test';
		// `mobileAuth.ts:299-330` checks the hash and the placeholder domain only;
		// `emailVerified` is not part of the mobile password door.
		const user = await seedUser(db(), {
			email,
			passwordHash: ACCESS_PASSWORD_HASH,
			emailVerified: false
		});
		const res = await invoke(postMobilePassword, {
			ctx: c,
			path: '/api/mobile/auth/password',
			headers: { 'x-real-ip': '10.7.2.2' },
			body: { email, password: PASSWORD }
		});
		expect(res.status).toBe(200);
		expect(res.body).toEqual({
			token: expect.stringMatching(FP_TOKEN),
			user: { id: user.id, firstName: user.firstName, lastName: user.lastName, email }
		});
	});

	it('throttles password sign-in at 10 per 5 minutes per address and IP', async () => {
		const c = ctx();
		const email = 'password-429@example.test';
		const other = 'password-429-other@example.test';
		await seedAccessPasswordUser(email);
		await seedAccessPasswordUser(other);
		const send = (ip: string, address = email) =>
			invoke(postMobilePassword, {
				ctx: c,
				path: '/api/mobile/auth/password',
				headers: { 'x-real-ip': ip },
				body: { email: address, password: 'not-the-password' }
			});
		for (let attempt = 0; attempt < 10; attempt += 1) {
			const allowed = await send('10.7.3.1');
			expect(allowed.status).toBe(401);
		}
		const refused = await send('10.7.3.1');
		expect({ status: refused.status, body: refused.body }).toEqual({
			status: 429,
			body: { error: 'Too many attempts — try again in a few minutes' }
		});

		// `pw-login:<email>:<ip>` (`mobileAuth.ts:305-311`): both dimensions key it.
		const newIp = await send('10.7.3.2');
		expect({ status: newIp.status, body: newIp.body }).toEqual({
			status: 401,
			body: { error: 'Email or password is incorrect' }
		});
		const newAddress = await send('10.7.3.1', other);
		expect({ status: newAddress.status, body: newAddress.body }).toEqual({
			status: 401,
			body: { error: 'Email or password is incorrect' }
		});
	});
});

describe('POST /api/mobile/auth/guest', () => {
	it('creates an Anonymous Account with an empty body, and sets no cookie', async () => {
		const c = ctx();
		const res = await invoke(postMobileGuest, {
			ctx: c,
			method: 'POST',
			path: '/api/mobile/auth/guest',
			headers: { 'x-real-ip': '10.8.0.1' }
		});
		expect(res.status).toBe(200);
		expect(res.body).toEqual({
			token: expect.stringMatching(FP_TOKEN),
			user: {
				id: expect.stringMatching(/^[a-z0-9]{15}$/),
				firstName: 'Guest',
				lastName: '',
				email: null
			}
		});
		expect(res.headers.get('set-cookie')).toBeNull();
		// `truncateAll` leaves this the only person row: the guest the route just created.
		const guests = await db().select().from(users);
		expect(guests).toHaveLength(1);
		const guest = first(guests);
		expect(guest.email).toBe(`${guest.id}${ACCESS_ANON_DOMAIN}`);
		expect([guest.emailVerified, guest.roles]).toEqual([false, []]);
		const tokens = await tokensFor(guest.id);
		expect(tokens.map((row) => row.name)).toEqual(['Android — Android']);
		const settings = await db()
			.select()
			.from(userSettings)
			.where(eq(userSettings.userId, guest.id));
		expect(settings.map((row) => row.timeZone)).toEqual(['UTC']);
	});

	it('names the token Android — <deviceName> and caps it at 60 chars', async () => {
		const c = ctx();
		const trimmed = await invoke(postMobileGuest, {
			ctx: c,
			path: '/api/mobile/auth/guest',
			headers: { 'x-real-ip': '10.8.0.2' },
			body: { deviceName: '  Pixel 9 Pro  ' }
		});
		expect(trimmed.status).toBe(200);
		const long = await invoke(postMobileGuest, {
			ctx: c,
			path: '/api/mobile/auth/guest',
			headers: { 'x-real-ip': '10.8.0.3' },
			body: { deviceName: 'x'.repeat(70) }
		});
		expect(long.status).toBe(200);
		const names = (await db().select({ name: apiTokens.name }).from(apiTokens)).map(
			(row) => row.name
		);
		expect(names.sort()).toEqual([`Android — Pixel 9 Pro`, `Android — ${'x'.repeat(60)}`]);
	});

	const notJsonCases = [
		{ label: 'a null body', ip: '10.8.0.4', options: { body: null } },
		{ label: 'a malformed body', ip: '10.8.0.5', options: { rawBody: '{oops' } }
	] as const satisfies readonly BodyCase[];

	it.each(notJsonCases)(
		'answers 400 {"error":"Request body must be JSON"} for $label',
		async (testCase) => {
			const c = ctx();
			const res = await invoke(postMobileGuest, {
				ctx: c,
				path: '/api/mobile/auth/guest',
				headers: { 'x-real-ip': testCase.ip },
				...testCase.options
			});
			expect({ status: res.status, body: res.body }).toEqual({
				status: 400,
				body: { error: 'Request body must be JSON' }
			});
		}
	);

	it('rate-limits guest creation at 10 per hour per IP', async () => {
		const c = ctx();
		const send = (ip: string) =>
			invoke(postMobileGuest, {
				ctx: c,
				path: '/api/mobile/auth/guest',
				headers: { 'x-real-ip': ip },
				body: {}
			});
		for (let attempt = 0; attempt < 10; attempt += 1) {
			const allowed = await send('10.8.1.1');
			expect(allowed.status).toBe(200);
		}
		const refused = await send('10.8.1.1');
		expect({ status: refused.status, body: refused.body }).toEqual({
			status: 429,
			body: { error: 'Too many attempts — try again in a few minutes' }
		});

		// `mobile-guest:<ip>` has no address dimension at all: only a new IP helps.
		const newIp = await send('10.8.1.2');
		expect({ status: newIp.status, body: newIp.body }).toEqual({
			status: 200,
			body: {
				token: expect.stringMatching(FP_TOKEN),
				user: {
					id: expect.stringMatching(/^[a-z0-9]{15}$/),
					firstName: 'Guest',
					lastName: '',
					email: null
				}
			}
		});
	});
});

describe('POST /api/mobile/auth/logout', () => {
	it('answers 401 {"error":"Unauthorized"} without a bearer token', async () => {
		const c = ctx();
		const user = await seedUser(db(), { email: 'logout-nobearer@example.test' });
		const res = await invoke(postMobileLogout, {
			ctx: c,
			user,
			via: 'token',
			path: '/api/mobile/auth/logout',
			headers: { 'x-real-ip': '10.9.0.1' }
		});
		expect({ status: res.status, body: res.body }).toEqual({
			status: 401,
			body: { error: 'Unauthorized' }
		});
	});

	it('answers 401 when the bearer token resolved to nobody', async () => {
		const c = ctx();
		const res = await invoke(postMobileLogout, {
			ctx: c,
			path: '/api/mobile/auth/logout',
			headers: { 'x-real-ip': '10.9.0.2', authorization: 'Bearer fp_unknown' }
		});
		expect({ status: res.status, body: res.body }).toEqual({
			status: 401,
			body: { error: 'Unauthorized' }
		});
	});

	it('answers 401 for a token that is not an fp_ token', async () => {
		const c = ctx();
		const user = await seedUser(db(), { email: 'logout-badtoken@example.test' });
		const res = await invoke(postMobileLogout, {
			ctx: c,
			user,
			via: 'token',
			path: '/api/mobile/auth/logout',
			headers: { 'x-real-ip': '10.9.0.3', authorization: 'Bearer not-an-fp-token' }
		});
		expect({ status: res.status, body: res.body }).toEqual({
			status: 401,
			body: { error: 'Unauthorized' }
		});
	});

	it('revokes exactly the presented token and leaves sessions alone', async () => {
		const c = ctx();
		const user = await seedUser(db(), { email: 'logout-ok@example.test' });
		const presented = 'fp_presentedTokenForTheLogoutGoldenOnly';
		await seedAccessApiToken(user.id, presented, 'This phone');
		await seedAccessApiToken(user.id, 'fp_otherTokenForTheLogoutGoldenOnly', 'Another phone');
		const session = await seedAccessSession(user.id);
		const res = await invoke(postMobileLogout, {
			ctx: c,
			user,
			via: 'token',
			path: '/api/mobile/auth/logout',
			headers: { 'x-real-ip': '10.9.1.1', authorization: `Bearer ${presented}` }
		});
		expect({ status: res.status, body: res.body }).toEqual({
			status: 200,
			body: { success: true }
		});
		expect(res.headers.get('set-cookie')).toBeNull();
		const tokens = await tokensFor(user.id);
		expect(tokens.map((row) => row.name)).toEqual(['Another phone']);
		// A mobile sign-out is not a web sign-out: the session row survives.
		expect(await db().select().from(authSession).where(eq(authSession.userId, user.id))).toEqual([
			session
		]);
	});

	it('is idempotent for an already-revoked token: still {success:true}', async () => {
		const c = ctx();
		const user = await seedUser(db(), { email: 'logout-twice@example.test' });
		const res = await invoke(postMobileLogout, {
			ctx: c,
			user,
			via: 'token',
			path: '/api/mobile/auth/logout',
			headers: { 'x-real-ip': '10.9.1.2', authorization: 'Bearer fp_neverExistedForThisGoldenOnly' }
		});
		expect({ status: res.status, body: res.body }).toEqual({
			status: 200,
			body: { success: true }
		});
	});
});

describe('POST /api/mobile/auth/signup', () => {
	it('answers 400 {"error":"Invalid JSON"} for a malformed body', async () => {
		const c = ctx();
		const res = await invoke(postMobileSignup, {
			ctx: c,
			path: '/api/mobile/auth/signup',
			headers: { 'x-real-ip': '10.10.0.1' },
			rawBody: '{signup'
		});
		expect({ status: res.status, body: res.body }).toEqual({
			status: 400,
			body: { error: 'Invalid JSON' }
		});
	});

	it('requires all four fields and a password of at least 8 characters', async () => {
		const c = ctx();
		const missing = await invoke(postMobileSignup, {
			ctx: c,
			path: '/api/mobile/auth/signup',
			headers: { 'x-real-ip': '10.10.0.2' },
			body: {
				email: 'signup-missing@example.test',
				password: PASSWORD,
				firstName: 'Mia',
				lastName: null
			}
		});
		expect({ status: missing.status, body: missing.body }).toEqual({
			status: 400,
			body: { error: 'All fields are required' }
		});

		const short = await invoke(postMobileSignup, {
			ctx: c,
			path: '/api/mobile/auth/signup',
			headers: { 'x-real-ip': '10.10.0.3' },
			body: {
				email: 'signup-short@example.test',
				password: 'short',
				firstName: 'Mia',
				lastName: 'Lopez'
			}
		});
		expect({ status: short.status, body: short.body }).toEqual({
			status: 400,
			body: { error: 'Password must be at least 8 characters' }
		});
	});

	it('answers the same 200 pending shape for a taken email — empty token, nothing created', async () => {
		const c = ctx();
		const email = 'signup-taken@example.test';
		const existing = await seedUser(db(), { email });
		const res = await invoke(postMobileSignup, {
			ctx: c,
			path: '/api/mobile/auth/signup',
			headers: { 'x-real-ip': '10.10.1.1' },
			body: {
				email,
				password: PASSWORD,
				firstName: '  Mia ',
				lastName: ' Lopez '
			}
		});
		expect(res.status).toBe(200);
		expect(res.body).toEqual({
			token: '',
			user: { id: '', firstName: 'Mia', lastName: 'Lopez', email, emailVerified: false },
			emailVerification: 'pending'
		});
		expect(res.headers.get('set-cookie')).toBeNull();
		expect(await db().select().from(users).where(eq(users.email, email))).toHaveLength(1);
		expect(await tokensFor(existing.id)).toEqual([]);
		// Taken means taken: the pending shape carries no code row either
		// (`signup/+server.ts:77-89` returns before `sendSignupVerification`).
		expect(await rowsOfEmail(email)).toEqual([]);
	});

	it('rate-limits one address at 10 attempts per 5 minutes', async () => {
		const c = ctx();
		const email = 'signup-429@example.test';
		const other = 'signup-429-other@example.test';
		await seedUser(db(), { email });
		await seedUser(db(), { email: other });
		const send = (ip: string, address = email) =>
			invoke(postMobileSignup, {
				ctx: c,
				path: '/api/mobile/auth/signup',
				headers: { 'x-real-ip': ip },
				body: { email: address, password: PASSWORD, firstName: 'Mia', lastName: 'Lopez' }
			});
		for (let attempt = 0; attempt < 10; attempt += 1) {
			const allowed = await send('10.10.2.1');
			expect(allowed.status).toBe(200);
		}
		const refused = await send('10.10.2.1');
		expect({ status: refused.status, body: refused.body }).toEqual({
			status: 429,
			body: { error: 'Too many attempts. Try again shortly.' }
		});

		// `pw-signup:<email>:<ip>` (`passwordSignup.ts:81`): both dimensions key it.
		const newIp = await send('10.10.2.2');
		expect({ status: newIp.status, body: newIp.body }).toEqual({
			status: 200,
			body: {
				token: '',
				user: { id: '', firstName: 'Mia', lastName: 'Lopez', email, emailVerified: false },
				emailVerification: 'pending'
			}
		});
		const newAddress = await send('10.10.2.1', other);
		expect({ status: newAddress.status, body: newAddress.body }).toEqual({
			status: 200,
			body: {
				token: '',
				user: {
					id: '',
					firstName: 'Mia',
					lastName: 'Lopez',
					email: other,
					emailVerified: false
				},
				emailVerification: 'pending'
			}
		});
	});

	it('rate-limits one IP at 30 attempts per 5 minutes across addresses', async () => {
		const c = ctx();
		const emails = Array.from(
			{ length: 31 },
			(_, index) => `signup-spray-${index}@example.test`
		);
		await Promise.all(emails.map((email) => seedUser(db(), { email })));
		const send = (ip: string, email: string) =>
			invoke(postMobileSignup, {
				ctx: c,
				path: '/api/mobile/auth/signup',
				headers: { 'x-real-ip': ip },
				body: { email, password: PASSWORD, firstName: 'Mia', lastName: 'Lopez' }
			});
		for (const email of emails.slice(0, 30)) {
			const allowed = await send('10.10.3.1', email);
			expect(allowed.status).toBe(200);
		}
		const refused = await send('10.10.3.1', emails[30]);
		expect({ status: refused.status, body: refused.body }).toEqual({
			status: 429,
			body: { error: 'Too many attempts. Try again shortly.' }
		});

		// `pw-signup-ip:<ip>` (`passwordSignup.ts:78`) is checked first and knows no
		// address: a fresh address from the same IP is refused, a new IP is not.
		const sameIp = await send('10.10.3.1', emails[30]);
		expect({ status: sameIp.status, body: sameIp.body }).toEqual({
			status: 429,
			body: { error: 'Too many attempts. Try again shortly.' }
		});
		const newIp = await send('10.10.3.2', emails[0]);
		expect({ status: newIp.status, body: newIp.body }).toEqual({
			status: 200,
			body: {
				token: '',
				user: {
					id: '',
					firstName: 'Mia',
					lastName: 'Lopez',
					email: emails[0],
					emailVerified: false
				},
				emailVerification: 'pending'
			}
		});
	});
});

describe('POST /api/mobile/auth/forgot', () => {
	it('answers 400 {"error":"Email is required"} for an absent email', async () => {
		const c = ctx();
		const res = await invoke(postMobileForgot, {
			ctx: c,
			path: '/api/mobile/auth/forgot',
			headers: { 'x-real-ip': '10.11.0.1' },
			body: {}
		});
		expect({ status: res.status, body: res.body }).toEqual({
			status: 400,
			body: { error: 'Email is required' }
		});
	});

	it('answers 500 {"error":"Failed to send reset email"} for a malformed body', async () => {
		const c = ctx();
		const res = await invoke(postMobileForgot, {
			ctx: c,
			path: '/api/mobile/auth/forgot',
			headers: { 'x-real-ip': '10.11.0.2' },
			rawBody: 'not json'
		});
		expect({ status: res.status, body: res.body }).toEqual({
			status: 500,
			body: { error: 'Failed to send reset email' }
		});
	});

	it('answers {sent:true} for an unknown address without emailing', async () => {
		const c = ctx();
		const res = await invoke(postMobileForgot, {
			ctx: c,
			path: '/api/mobile/auth/forgot',
			headers: { 'x-real-ip': '10.11.0.3' },
			body: { email: 'forgot-unknown@example.test' }
		});
		expect({ status: res.status, body: res.body }).toEqual({
			status: 200,
			body: { sent: true }
		});
		expect(await rowsOfEmail('forgot-unknown@example.test')).toEqual([]);
	});

	it('treats an Anonymous Account placeholder as unknown', async () => {
		const c = ctx();
		const guest = await seedAccessGuest();
		const res = await invoke(postMobileForgot, {
			ctx: c,
			path: '/api/mobile/auth/forgot',
			headers: { 'x-real-ip': '10.11.0.4' },
			body: { email: guest.email }
		});
		expect({ status: res.status, body: res.body }).toEqual({
			status: 200,
			body: { sent: true }
		});
		expect(await rowsOfEmail(guest.email ?? '')).toEqual([]);
	});

	it('answers {sent:true} for a value that is not an address at all', async () => {
		const c = ctx();
		// `forgot-password/+server.ts:50` checks `!email` only — no format rule, no
		// dot, no case folding (Decision 2: this route keeps exactly its legacy
		// check, the kernel `isEmailAddress` rule does not apply here).
		const res = await invoke(postMobileForgot, {
			ctx: c,
			path: '/api/mobile/auth/forgot',
			headers: { 'x-real-ip': '10.11.0.5' },
			body: { email: 'nope' }
		});
		expect({ status: res.status, body: res.body }).toEqual({
			status: 200,
			body: { sent: true }
		});
	});

	it('throttles reset mail at 5 per 15 minutes per address and IP', async () => {
		const c = ctx();
		const email = 'forgot-429@example.test';
		const send = (ip: string, address = email) =>
			invoke(postMobileForgot, {
				ctx: c,
				path: '/api/mobile/auth/forgot',
				headers: { 'x-real-ip': ip },
				body: { email: address }
			});
		for (let attempt = 0; attempt < 5; attempt += 1) {
			const allowed = await send('10.11.1.1');
			expect(allowed.status).toBe(200);
		}
		const refused = await send('10.11.1.1');
		expect({ status: refused.status, body: refused.body }).toEqual({
			status: 429,
			body: { error: 'Too many attempts. Try again shortly.' }
		});

		// `reset:<email>:<ip>` (`forgot-password/+server.ts:54`).
		const newIp = await send('10.11.1.2');
		expect(newIp.status).toBe(200);
		const newAddress = await send('10.11.1.1', 'forgot-429-other@example.test');
		expect(newAddress.status).toBe(200);
	});
});

describe('POST /api/mobile/auth/reset', () => {
	const missingCases = [
		{ label: 'both absent', ip: '10.12.0.1', options: { body: {} } },
		{
			label: 'a null token',
			ip: '10.12.0.2',
			options: { body: { token: null, password: 'long-enough-password' } }
		}
	] as const satisfies readonly BodyCase[];

	it.each(missingCases)('requires a token and a password ($label)', async (testCase) => {
		const c = ctx();
		const res = await invoke(postMobileReset, {
			ctx: c,
			path: '/api/mobile/auth/reset',
			headers: { 'x-real-ip': testCase.ip },
			...testCase.options
		});
		expect({ status: res.status, body: res.body }).toEqual({
			status: 400,
			body: { error: 'Token and password are required' }
		});
	});

	it('requires a password of at least 8 characters', async () => {
		const c = ctx();
		const token = await mintResetToken('reset-short@example.test');
		const res = await invoke(postMobileReset, {
			ctx: c,
			path: '/api/mobile/auth/reset',
			headers: { 'x-real-ip': '10.12.0.3' },
			body: { token, password: 'short' }
		});
		expect({ status: res.status, body: res.body }).toEqual({
			status: 400,
			body: { error: 'Password must be at least 8 characters' }
		});
	});

	it('checks the password length before the token', async () => {
		const c = ctx();
		// `reset/+server.ts:75-80`: length is a plain `if` before `verifyJwt`, so a
		// short password wins over a forged token.
		const res = await invoke(postMobileReset, {
			ctx: c,
			path: '/api/mobile/auth/reset',
			headers: { 'x-real-ip': '10.12.0.4' },
			body: { token: 'not.a.jwt', password: 'short' }
		});
		expect({ status: res.status, body: res.body }).toEqual({
			status: 400,
			body: { error: 'Password must be at least 8 characters' }
		});
	});

	it('refuses a token it did not sign', async () => {
		const c = ctx();
		const res = await invoke(postMobileReset, {
			ctx: c,
			path: '/api/mobile/auth/reset',
			headers: { 'x-real-ip': '10.12.0.5' },
			body: { token: 'not.a.jwt', password: 'long-enough-password' }
		});
		expect({ status: res.status, body: res.body }).toEqual({
			status: 400,
			body: { error: 'Invalid or expired reset token. Please request a new one.' }
		});
	});

	it('answers Invalid reset token for a signed JWT without an email claim', async () => {
		const c = ctx();
		const token = await mintEmailJwt({ code: '12345678' });
		// `reset/+server.ts:88-96`: the signature passes, the payload shape does not.
		const res = await invoke(postMobileReset, {
			ctx: c,
			path: '/api/mobile/auth/reset',
			headers: { 'x-real-ip': '10.12.0.6' },
			body: { token, password: 'long-enough-password' }
		});
		expect({ status: res.status, body: res.body }).toEqual({
			status: 400,
			body: { error: 'Invalid reset token' }
		});
	});

	it('answers 500 {"error":"Failed to reset password"} for a malformed body', async () => {
		const c = ctx();
		const res = await invoke(postMobileReset, {
			ctx: c,
			path: '/api/mobile/auth/reset',
			headers: { 'x-real-ip': '10.12.0.7' },
			rawBody: 'not json'
		});
		expect({ status: res.status, body: res.body }).toEqual({
			status: 500,
			body: { error: 'Failed to reset password' }
		});
	});

	it('answers 400 {"error":"Account not found"} for a signed token with no account', async () => {
		const c = ctx();
		const token = await mintResetToken('reset-gone@example.test');
		const res = await invoke(postMobileReset, {
			ctx: c,
			path: '/api/mobile/auth/reset',
			headers: { 'x-real-ip': '10.12.0.8' },
			body: { token, password: 'long-enough-password' }
		});
		expect({ status: res.status, body: res.body }).toEqual({
			status: 400,
			body: { error: 'Account not found' }
		});
	});

	it('resets the password, kills every session and every token, and refuses the token again', async () => {
		const c = ctx();
		const email = 'reset-ok@example.test';
		const user = await seedAccessPasswordUser(email);
		await seedAccessSession(user.id, {
			id: 'session-reset-1',
			token: 'session-token-reset-1'
		});
		await seedAccessApiToken(user.id, 'fp_doomedTokenForTheResetGoldenOnly', 'Old phone');
		// Q-104: Better Auth's credential row was seeded from `users.passwordHash`
		// and no sign-in path reads it yet, so reset leaves it stale. Owner answer C:
		// `auth_account.password` stops being a password store (no access flow writes
		// it — legacy reset writes only `users.passwordHash`) and the column goes at
		// the schema cleanup; this assertion holds until then.
		await seedAccessAuthAccount(user.id, 'stale-credential-password');
		const token = await mintResetToken(email);
		const parsed = parseJWT(token);
		if (!parsed?.expiresAt) throw new Error('the minted reset token carries no expiry');

		const res = await invoke(postMobileReset, {
			ctx: c,
			path: '/api/mobile/auth/reset',
			headers: { 'x-real-ip': '10.12.1.1' },
			body: { token, password: 'a-brand-new-password' }
		});
		expect({ status: res.status, body: res.body }).toEqual({
			status: 200,
			body: { success: true }
		});
		const [row] = await db().select().from(users).where(eq(users.id, user.id));
		expect(row.passwordHash).toMatch(/^\$2[aby]\$/);
		expect(row.passwordHash).not.toBe(ACCESS_PASSWORD_HASH);
		expect(await db().select().from(authSession).where(eq(authSession.userId, user.id))).toEqual(
			[]
		);
		expect(await tokensFor(user.id)).toEqual([]);
		const credentials = await db()
			.select()
			.from(authAccount)
			.where(eq(authAccount.userId, user.id));
		expect(credentials.map((credential) => credential.password)).toEqual([
			'stale-credential-password'
		]);
		const marker = first(
			await db()
				.select()
				.from(codes)
				.where(eq(codes.code, `used:${sha256(token)}`))
		);
		expect(marker.type).toBe('reset_used');
		expect(marker.email).toBe(email);
		// The marker expires exactly when the token does (`reset/+server.ts:116`).
		expect(marker.expiresAt.getTime()).toBe(parsed.expiresAt.getTime());

		const again = await invoke(postMobileReset, {
			ctx: c,
			path: '/api/mobile/auth/reset',
			headers: { 'x-real-ip': '10.12.1.2' },
			body: { token, password: 'another-brand-new-password' }
		});
		expect({ status: again.status, body: again.body }).toEqual({
			status: 400,
			body: { error: 'This reset link has already been used. Please request a new one.' }
		});
	});

	it('accepts a sign-in magic link as a reset token (Q-102)', async () => {
		const c = ctx();
		const email = 'reset-via-login-link@example.test';
		const user = await seedAccessPasswordUser(email);
		// The payload a login link carries (`magicLink.ts:207-225`): no purpose
		// claim exists, so `isResetPayload` only asks for an `email`. Owner answer B
		// (mint reset tokens with a purpose claim and refuse the rest) lands after S6
		// as a `fix(access)` commit that turns this into a 400 first.
		const token = await mintEmailJwt({ kind: 'login', email, code: '13572468' }, 15);
		const res = await invoke(postMobileReset, {
			ctx: c,
			path: '/api/mobile/auth/reset',
			headers: { 'x-real-ip': '10.12.1.3' },
			body: { token, password: 'chosen-by-the-link-holder' }
		});
		expect({ status: res.status, body: res.body }).toEqual({
			status: 200,
			body: { success: true }
		});
		const [row] = await db().select().from(users).where(eq(users.id, user.id));
		expect(row.passwordHash).not.toBe(ACCESS_PASSWORD_HASH);
	});

	it('throttles reset attempts at 10 per 15 minutes per IP', async () => {
		const c = ctx();
		const token = await mintResetToken('reset-429@example.test');
		const send = (ip: string, body: JsonValue) =>
			invoke(postMobileReset, {
				ctx: c,
				path: '/api/mobile/auth/reset',
				headers: { 'x-real-ip': ip },
				body
			});
		for (let attempt = 0; attempt < 10; attempt += 1) {
			const allowed = await send('10.12.2.1', {
				token: 'not.a.jwt',
				password: 'long-enough-password'
			});
			expect(allowed.status).toBe(400);
		}
		const refused = await send('10.12.2.1', {
			token: 'not.a.jwt',
			password: 'long-enough-password'
		});
		expect({ status: refused.status, body: refused.body }).toEqual({
			status: 429,
			body: { error: 'Too many attempts. Try again shortly.' }
		});

		// `pw-reset-ip:<ip>` (`api/mobile/auth/reset/+server.ts:21-28`) has no body
		// dimension: even a well-formed token is refused from the same IP. Q-066's
		// answered fix moves the limiter into the shared service — same key, same
		// limit, and the wrapper's copy must go so this burst is not counted twice.
		const sameIpValid = await send('10.12.2.1', {
			token,
			password: 'long-enough-password'
		});
		expect({ status: sameIpValid.status, body: sameIpValid.body }).toEqual({
			status: 429,
			body: { error: 'Too many attempts. Try again shortly.' }
		});
		const newIp = await send('10.12.2.2', {
			token: 'not.a.jwt',
			password: 'long-enough-password'
		});
		expect({ status: newIp.status, body: newIp.body }).toEqual({
			status: 400,
			body: { error: 'Invalid or expired reset token. Please request a new one.' }
		});
	});
});

/**
 * Q-064: the two page-group JSON endpoints the sign-in and sign-up screens
 * POST to. They are not page loads or form actions — the client fetches JSON —
 * so they get goldens: each answers a 500 that names the account state, and
 * these tests are what makes the flip visible. The owner answered B (both
 * answer the generic `Unexpected error, please try again`); that lands after
 * S6 as a `fix(access)` commit which edits these two expectations first.
 */
describe('POST /signup/email/code (page JSON, Q-064)', () => {
	it('answers 500 {"success":false,"error":"Account with this email already Exists"} and burns the code', async () => {
		const c = ctx();
		const email = 'page-signup-taken@example.test';
		const owner = await seedUser(db(), { email: 'page-signup-owner@example.test' });
		await seedAccessProviderAccount(email, owner.id);
		await seedAccessEmailCode({
			code: '24681012',
			email,
			type: 'signup',
			firstName: 'Mia',
			lastName: 'Lopez'
		});
		const res = await invoke(postSignupEmailCode, {
			ctx: c,
			path: '/signup/email/code',
			headers: { 'x-real-ip': '10.13.0.1' },
			body: { code: '24681012', email }
		});
		// `signup/email/code/+server.ts:87-95`: the membership signal, capitalised
		// typo included, and the code is deleted before the answer.
		expect({ status: res.status, body: res.body }).toEqual({
			status: 500,
			body: { success: false, error: 'Account with this email already Exists' }
		});
		expect(await rowsOfEmail(email)).toEqual([]);
	});
});

describe('POST /login/email/code (page JSON, Q-064)', () => {
	it('answers 500 {"success":false,"error":"No Account found"} and keeps the code', async () => {
		const c = ctx();
		const email = 'page-login-orphan@example.test';
		await seedAccessEmailCode({ code: '12108642', email, type: 'login' });
		const res = await invoke(postLoginEmailCode, {
			ctx: c,
			path: '/login/email/code',
			headers: { 'x-real-ip': '10.13.1.1' },
			body: { code: '12108642', email }
		});
		// `login/email/code/+server.ts:94-100`: an orphaned login code names its own
		// state, and the row survives (nothing deletes it on this branch).
		expect({ status: res.status, body: res.body }).toEqual({
			status: 500,
			body: { success: false, error: 'No Account found' }
		});
		expect(await rowsOfEmail(email)).toHaveLength(1);
	});
});

/**
 * golden from spec: legacy handler sends through the module-scope Resend client
 * (`src/lib/utils/sendEmail.ts`), so these success paths would hit the network
 * from the db project and cannot run here. The expected wire comes from
 * docs/guides/task-api-spec.md and the legacy unit tests (which inject the send
 * seam). The ported handlers take the sender from `ctx`, so S6 unskips these —
 * see docs/rewrite/modules/access.md#notes. Each one asserts the rows it
 * writes, because S6 may only remove the `.skip`.
 */
describe('success paths that send email (spec-goldens, skipped until S6)', () => {
	it.skip('POST /api/me/claim — answers {sent:true} for a guest at a fresh address', async () => {
		const c = ctx();
		const guest = await seedAccessGuest();
		const email = 'claim-fresh@example.test';
		const before = Date.now();
		const res = await invoke(postClaim, {
			ctx: c,
			user: guest,
			path: '/api/me/claim',
			headers: { 'x-real-ip': '10.14.0.1' },
			body: { email }
		});
		expect({ status: res.status, body: res.body }).toEqual({
			status: 200,
			body: { sent: true }
		});
		// `claimService.ts:12-21`: 32 random bytes, only the sha256 stored, 15 min TTL.
		const claimRows = await db().select().from(claimTokens).where(eq(claimTokens.userId, guest.id));
		expect(claimRows.map((row) => row.email)).toEqual([email]);
		const claimRow = first(claimRows);
		expect(claimRow.tokenHash).toMatch(/^[0-9a-f]{64}$/);
		expect(claimRow.expiresAt.getTime()).toBeGreaterThan(before);
		expect(claimRow.expiresAt.getTime()).toBeLessThanOrEqual(before + 15 * 60 * 1000);
	});

	it.skip('POST /api/me/claim — answers the same {sent:true} for a registered address', async () => {
		const c = ctx();
		const guest = await seedAccessGuest();
		const email = 'claim-taken@example.test';
		await seedUser(db(), { email });
		const res = await invoke(postClaim, {
			ctx: c,
			user: guest,
			path: '/api/me/claim',
			headers: { 'x-real-ip': '10.14.0.2' },
			body: { email }
		});
		expect({ status: res.status, body: res.body }).toEqual({
			status: 200,
			body: { sent: true }
		});
		// Only the email copy differs (`claimRequest.ts:76-84`): the token row is
		// written either way.
		expect(
			(await db().select().from(claimTokens).where(eq(claimTokens.userId, guest.id))).map(
				(row) => row.email
			)
		).toEqual([email]);
	});

	it.skip('POST /api/me/claim — answers 429 on the fourth request for the same address within 15 minutes', async () => {
		const c = ctx();
		const guest = await seedAccessGuest();
		const email = 'claim-429@example.test';
		const send = (ip: string, address = email) =>
			invoke(postClaim, {
				ctx: c,
				user: guest,
				path: '/api/me/claim',
				headers: { 'x-real-ip': ip },
				body: { email: address }
			});
		for (let attempt = 0; attempt < 3; attempt += 1) {
			const allowed = await send('10.14.0.3');
			expect(allowed.status).toBe(200);
		}
		const refused = await send('10.14.0.3');
		expect({ status: refused.status, body: refused.body }).toEqual({
			status: 429,
			body: { error: 'Too many attempts. Try again shortly.' }
		});
		// `claim:<email>:<ip>` (`claimRequest.ts:66`): both dimensions key it.
		const newIp = await send('10.14.0.4');
		expect(newIp.status).toBe(200);
		const newAddress = await send('10.14.0.3', 'claim-429-other@example.test');
		expect(newAddress.status).toBe(200);
	});

	it.skip('POST /api/me/claim — answers 429 on the eleventh request from one IP within 15 minutes', async () => {
		const c = ctx();
		const guest = await seedAccessGuest();
		const send = (ip: string, address: string) =>
			invoke(postClaim, {
				ctx: c,
				user: guest,
				path: '/api/me/claim',
				headers: { 'x-real-ip': ip },
				body: { email: address }
			});
		for (let attempt = 0; attempt < 10; attempt += 1) {
			const allowed = await send('10.14.1.1', `claim-spray-${attempt}@example.test`);
			expect(allowed.status).toBe(200);
		}
		const refused = await send('10.14.1.1', 'claim-spray-10@example.test');
		expect({ status: refused.status, body: refused.body }).toEqual({
			status: 429,
			body: { error: 'Too many attempts. Try again shortly.' }
		});
		// `claim-ip:<ip>` (`claimRequest.ts:63`): a new IP is a new bucket.
		const newIp = await send('10.14.1.2', 'claim-spray-11@example.test');
		expect(newIp.status).toBe(200);
	});

	it.skip('POST /api/me/email — mails a code to the NEW address and answers the message', async () => {
		const c = ctx();
		const email = 'change-ok@example.test';
		const user = await seedUser(db(), {
			email,
			firstName: 'Ada',
			lastName: 'Lovelace'
		});
		// A real reset first: it writes the durable `used:<hash>` marker, which is
		// what Q-103's `deleteCodesByEmail` below wipes.
		const reset = await invoke(postMobileReset, {
			ctx: c,
			path: '/api/mobile/auth/reset',
			headers: { 'x-real-ip': '10.14.2.1' },
			body: { token: await mintResetToken(email), password: 'a-brand-new-password' }
		});
		expect(reset.status).toBe(200);

		const res = await invoke(postChangeEmail, {
			ctx: c,
			user,
			path: '/api/me/email',
			headers: { 'x-real-ip': '10.14.2.2' },
			body: { email: 'change-new@example.test' }
		});
		expect({ status: res.status, body: res.body }).toEqual({
			status: 200,
			body: { success: true, message: 'Verification email sent. Please check your inbox.' }
		});

		// Q-065: the row is bound to the CURRENT address, carries the pending one,
		// and stores the 8-digit code in plaintext (`accountData.ts:374-383`). Owner
		// answer B (hash it at rest, no wire change) lands after S6 and swaps this
		// for a digest.
		const rows = await rowsOfEmail(email);
		expect(rows.map((row) => [row.type, row.pendingEmail])).toEqual([
			['email_change', 'change-new@example.test']
		]);
		const linkRow = first(rows);
		expect(linkRow.code).toMatch(/^\d{8}$/);
		expect([linkRow.firstName, linkRow.lastName]).toEqual(['Ada', 'Lovelace']);
		// Q-103: that one row is all that is left for this address — the reset
		// marker (and any other code) went with `deleteCodesByEmail`. Owner answer B
		// (delete only the `email_change` codes) lands after S6 as a `fix(access)`
		// commit; this test then also sees the marker survive.
		expect(rows).toHaveLength(1);
	});

	it.skip('POST /api/me/verify-email/resend — sends a code to an unverified caller', async () => {
		const c = ctx();
		const email = 'resend-unverified@example.test';
		const user = await seedUser(db(), {
			email,
			emailVerified: false,
			firstName: 'Mia',
			lastName: 'Lopez'
		});
		const res = await invoke(postResendVerification, {
			ctx: c,
			user,
			path: '/api/me/verify-email/resend',
			headers: { 'x-real-ip': '10.14.3.1' }
		});
		expect({ status: res.status, body: res.body }).toEqual({
			status: 200,
			body: { success: true }
		});
		// One `password-signup` row, the user's names, a digest and a 15-minute TTL
		// (`magicLink.ts:235-258`).
		const rows = await rowsOfEmail(email);
		expect(rows.map((row) => [row.type, row.firstName, row.lastName])).toEqual([
			['password-signup', 'Mia', 'Lopez']
		]);
		const codeRow = first(rows);
		expect(codeRow.code).toMatch(/^[0-9a-f]{64}$/);
		expect(codeRow.expiresAt.getTime()).toBeGreaterThan(Date.now());
	});

	it.skip('POST /api/mobile/auth/email — sends the code for a known login and a fresh signup', async () => {
		const c = ctx();
		const known = 'mobile-email-known@example.test';
		await seedUser(db(), { email: known });
		const login = await invoke(postMobileEmail, {
			ctx: c,
			path: '/api/mobile/auth/email',
			headers: { 'x-real-ip': '10.14.4.1' },
			body: { email: known, intent: 'login' }
		});
		expect({ status: login.status, body: login.body }).toEqual({
			status: 200,
			body: { sent: true }
		});
		expect((await rowsOfEmail(known)).map((row) => row.type)).toEqual(['login']);

		// The other half of the title: a fresh signup address gets its own row,
		// tagged `signup` and carrying the names the request supplied.
		const fresh = 'mobile-email-fresh@example.test';
		const signup = await invoke(postMobileEmail, {
			ctx: c,
			path: '/api/mobile/auth/email',
			headers: { 'x-real-ip': '10.14.4.2' },
			body: { email: fresh, intent: 'signup', firstName: 'Noah', lastName: 'Kim' }
		});
		expect({ status: signup.status, body: signup.body }).toEqual({
			status: 200,
			body: { sent: true }
		});
		const freshRows = await rowsOfEmail(fresh);
		expect(freshRows.map((row) => [row.type, row.firstName, row.lastName])).toEqual([
			['signup', 'Noah', 'Kim']
		]);
	});

	it.skip('POST /api/mobile/auth/signup — creates the account, mints a token, answers 200 pending', async () => {
		const c = ctx();
		const email = 'mobile-signup-new@example.test';
		const res = await invoke(postMobileSignup, {
			ctx: c,
			path: '/api/mobile/auth/signup',
			headers: { 'x-real-ip': '10.14.5.1' },
			body: { email, password: PASSWORD, firstName: 'Mia', lastName: 'Lopez' }
		});
		expect(res.status).toBe(200);
		expect(res.body).toEqual({
			token: expect.stringMatching(FP_TOKEN),
			user: {
				id: expect.stringMatching(/^[a-z0-9]{15}$/),
				firstName: 'Mia',
				lastName: 'Lopez',
				email,
				emailVerified: false
			},
			emailVerification: 'pending'
		});
		const created = first(await db().select().from(users).where(eq(users.email, email)));
		expect(created.emailVerified).toBe(false);
		expect((await tokensFor(created.id)).map((row) => row.name)).toEqual(['Android — Android']);
		const personalCalendar = await db()
			.select()
			.from(calendars)
			.where(eq(calendars.ownerId, created.id));
		expect(personalCalendar.map((row) => row.familyId)).toEqual([null]);
		// `passwordSignup.ts:108-128` mails a code-only `password-signup` row.
		const rows = await rowsOfEmail(email);
		expect(rows.map((row) => [row.type, row.firstName, row.lastName])).toEqual([
			['password-signup', 'Mia', 'Lopez']
		]);
	});

	it.skip('POST /api/mobile/auth/forgot — mails a 60-minute reset link to a registered address', async () => {
		const c = ctx();
		const email = 'forgot-known@example.test';
		await seedUser(db(), { email });
		const res = await invoke(postMobileForgot, {
			ctx: c,
			path: '/api/mobile/auth/forgot',
			headers: { 'x-real-ip': '10.14.6.1' },
			body: { email }
		});
		expect({ status: res.status, body: res.body }).toEqual({
			status: 200,
			body: { sent: true }
		});
		// Forgot writes no code row: the reset link is a stateless JWT.
		expect(await rowsOfEmail(email)).toEqual([]);
	});
});
