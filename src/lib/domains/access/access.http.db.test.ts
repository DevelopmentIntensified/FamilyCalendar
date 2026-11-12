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
 * The success paths that really send an email are spec-goldens at the bottom
 * (skipped today, activated in S6); the reason and the exact shape are in
 * docs/rewrite/modules/access.md#notes.
 *
 * Doc: ./README.md#how-to-test
 */
import { createHash } from 'node:crypto';
import { eq } from 'drizzle-orm';
import { TimeSpan } from 'oslo';
import { createJWT } from 'oslo/jwt';
import { beforeEach, describe, expect, it } from 'vitest';
import { apiTokens, authSession, codes, userSettings, users } from '$lib/kernel/db/tables.server';
import {
	invoke,
	type AnyRouteHandler,
	type InvokeOptions
} from '$lib/kernel/testing/invokeHandlers.server';
import { seedUser, uniqueSuffix } from '$lib/kernel/testing/seedRows.server';
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

const db = () => testDb();
const ctx = () => testCtx({ db: testDb() });

/**
 * The secret SvelteKit bakes into `$env/static/private` for this project: the
 * shell value wins over `.env.test` (Vite gives process.env priority), so read
 * it first and fall back to the committed test value. A v2 file may not import
 * `$env` (R6), but a test may read the environment (R5/R6 skip tests).
 */
const EMAIL_SECRET = process.env.EMAILSECRET ?? 'test-email-secret-key-for-testing-only-32chars';

/** The reserved Anonymous Account domain (`src/lib/utils/anonymous.ts:12`). */
const ANON_DOMAIN = '@anonymous.placeholder.invalid';

/** A minted personal API token: `fp_` + 43 base64url characters. */
const FP_TOKEN = /^fp_[A-Za-z0-9_-]{43}$/;

/** bcrypt hash of {@link PASSWORD} at cost 8 — a real compare, no hashing here. */
const PASSWORD = 'correct-horse-battery';
const PASSWORD_HASH = '$2b$08$Au1ENwjxEYcZzc1EZQ/M5Oe1ZJaBJpJv/MMVQqr7lncxWRNe7/P1C';

/** sha256 hex — the only form of a code, token or Claim link that reaches a row. */
const sha256 = (value: string) => createHash('sha256').update(value).digest('hex');

/** A far-future expiry: the handlers delete dead codes first, so a live row stays. */
const LATER = new Date('2099-01-01T00:00:00.000Z');

function first<T>(rows: readonly T[]): T {
	const [row] = rows;
	if (row === undefined) throw new Error('expected at least one row');
	return row;
}

/** A guest (Anonymous Account) row: the placeholder email is what makes it a guest. */
async function seedGuest() {
	return seedUser(db(), {
		email: `guest-${uniqueSuffix()}${ANON_DOMAIN}`,
		firstName: 'Guest',
		lastName: '',
		emailVerified: false
	});
}

async function seedPasswordUser(email: string) {
	return seedUser(db(), { email, passwordHash: PASSWORD_HASH, emailVerified: true });
}

async function seedApiToken(userId: string, plaintext: string, name = 'Phone') {
	await db().insert(apiTokens).values({ userId, name, tokenHash: sha256(plaintext) });
}

/** A hashed, type-stamped email code row, exactly as `issueVerificationCode` writes it. */
async function seedEmailCode(input: {
	code: string;
	email: string;
	type: string;
	firstName?: string;
	lastName?: string;
}) {
	await db()
		.insert(codes)
		.values({
			code: sha256(input.code),
			email: input.email,
			type: input.type,
			firstName: input.firstName ?? null,
			lastName: input.lastName ?? null,
			expiresAt: LATER
		});
}

async function rowsOfEmail(email: string) {
	return db().select().from(codes).where(eq(codes.email, email));
}

async function tokensFor(userId: string) {
	return db().select().from(apiTokens).where(eq(apiTokens.userId, userId));
}

/** The 60-minute reset JWT the forgot-password email carries (`reset` reads it back). */
async function mintResetToken(email: string): Promise<string> {
	return createJWT('HS256', new TextEncoder().encode(EMAIL_SECRET), { email }, {
		headers: { alg: 'HS256', typ: 'JWT' },
		expiresIn: new TimeSpan(60, 'm')
	});
}

type RedirectTarget = { readonly status: number; readonly location: string | null };

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
		return { status: res.status, location: res.headers.get('location') };
	} catch (error) {
		if (typeof error === 'object' && error !== null && 'status' in error && 'location' in error) {
			const status: unknown = error.status;
			const location: unknown = error.location;
			if (typeof status === 'number' && typeof location === 'string') return { status, location };
		}
		throw error;
	}
}

beforeEach(truncateAll);

describe('POST /api/logout', () => {
	it('answers 302 / when signed out', async () => {
		const res = await invokeRedirect(postLogout, {
			ctx: ctx(),
			method: 'POST',
			path: '/api/logout'
		});
		expect(res).toEqual({ status: 302, location: '/' });
	});

	// `invoke` cannot inject `locals.session` (the harness pins it to null), so
	// the delete-the-session-row half is pinned by the S5 service test.
});

describe('POST /api/me/claim', () => {
	it('answers 401 {"error":"Unauthorized"} when signed out', async () => {
		const res = await invoke(postClaim, {
			ctx: ctx(),
			path: '/api/me/claim',
			headers: { 'x-real-ip': '10.1.0.1' },
			body: { email: 'a@example.test' }
		});
		expect(res).toMatchObject({ status: 401, body: { error: 'Unauthorized' } });
	});

	it('answers 400 {"error":"Invalid JSON"} for a malformed body', async () => {
		const guest = await seedGuest();
		const res = await invoke(postClaim, {
			ctx: ctx(),
			user: guest,
			path: '/api/me/claim',
			headers: { 'x-real-ip': '10.1.0.2' },
			rawBody: '{not json'
		});
		expect(res).toMatchObject({ status: 400, body: { error: 'Invalid JSON' } });
	});

	it('refuses a non-guest with Account already has an email', async () => {
		const user = await seedUser(db(), { email: 'claim-registered@example.test' });
		const res = await invoke(postClaim, {
			ctx: ctx(),
			user,
			path: '/api/me/claim',
			headers: { 'x-real-ip': '10.1.0.3' },
			body: { email: 'other@example.test' }
		});
		expect(res).toMatchObject({ status: 400, body: { error: 'Account already has an email' } });
	});

	it('reads an absent, null or non-string email as "" and asks for a valid address', async () => {
		const guest = await seedGuest();
		const bodies: JsonValue[] = [{}, { email: null }, { email: 42 }];
		for (const [index, body] of bodies.entries()) {
			const res = await invoke(postClaim, {
				ctx: ctx(),
				user: guest,
				path: '/api/me/claim',
				headers: { 'x-real-ip': `10.1.1.${index + 1}` },
				body
			});
			expect(res).toMatchObject({
				status: 400,
				body: { error: 'Please enter a valid email address' }
			});
		}
	});
});

describe('POST /api/me/email', () => {
	it('answers 401 {"error":"Unauthorized"} when signed out', async () => {
		const res = await invoke(postChangeEmail, {
			ctx: ctx(),
			path: '/api/me/email',
			headers: { 'x-real-ip': '10.2.0.1' },
			body: { email: 'new@example.test' }
		});
		expect(res).toMatchObject({ status: 401, body: { error: 'Unauthorized' } });
	});

	it('answers 400 {"error":"Invalid JSON"} for a malformed body', async () => {
		const user = await seedUser(db(), { email: 'change-json@example.test' });
		const res = await invoke(postChangeEmail, {
			ctx: ctx(),
			user,
			path: '/api/me/email',
			headers: { 'x-real-ip': '10.2.0.2' },
			rawBody: '[]'
		});
		expect(res).toMatchObject({ status: 400, body: { error: 'Invalid JSON' } });
	});

	it('refuses a guest with guestNeedsClaim', async () => {
		const guest = await seedGuest();
		const res = await invoke(postChangeEmail, {
			ctx: ctx(),
			user: guest,
			path: '/api/me/email',
			headers: { 'x-real-ip': '10.2.0.3' },
			body: { email: 'new@example.test' }
		});
		expect(res.status).toBe(400);
		expect(res.body).toEqual({
			error:
				"You're using a guest calendar — add your first email from the Save-your-calendar banner instead.",
			guestNeedsClaim: true
		});
	});

	it('requires a valid address, and one that differs from the current one', async () => {
		const user = await seedUser(db(), { email: 'change-same@example.test' });
		const invalid = await invoke(postChangeEmail, {
			ctx: ctx(),
			user,
			path: '/api/me/email',
			headers: { 'x-real-ip': '10.2.0.4' },
			body: { email: null }
		});
		expect(invalid).toMatchObject({ status: 400, body: { error: 'Valid email is required' } });

		const same = await invoke(postChangeEmail, {
			ctx: ctx(),
			user,
			path: '/api/me/email',
			headers: { 'x-real-ip': '10.2.0.5' },
			body: { email: 'change-same@example.test' }
		});
		expect(same).toMatchObject({
			status: 400,
			body: { error: 'New email must be different from current email' }
		});
	});

	it('throttles at 3 attempts per 15 minutes per person', async () => {
		const guest = await seedGuest();
		const send = (ip: string) =>
			invoke(postChangeEmail, {
				ctx: ctx(),
				user: guest,
				path: '/api/me/email',
				headers: { 'x-real-ip': ip },
				body: { email: 'new@example.test' }
			});
		for (let attempt = 0; attempt < 3; attempt += 1) {
			const allowed = await send('10.2.1.1');
			expect(allowed.status).toBe(400);
		}
		const refused = await send('10.2.1.1');
		expect(refused).toMatchObject({
			status: 429,
			body: { error: 'Too many attempts. Try again shortly.' }
		});
	});
});

describe('POST /api/me/verify-email', () => {
	it('answers 401 {"error":"Unauthorized"} when signed out', async () => {
		const res = await invoke(postVerifyEmail, {
			ctx: ctx(),
			path: '/api/me/verify-email',
			headers: { 'x-real-ip': '10.3.0.1' },
			body: { code: '12345678' }
		});
		expect(res).toMatchObject({ status: 401, body: { error: 'Unauthorized' } });
	});

	it('answers 401 for a person row with no email at all', async () => {
		const user = await seedUser(db(), { email: null });
		const res = await invoke(postVerifyEmail, {
			ctx: ctx(),
			user,
			path: '/api/me/verify-email',
			headers: { 'x-real-ip': '10.3.0.2' },
			body: { code: '12345678' }
		});
		expect(res).toMatchObject({ status: 401, body: { error: 'Unauthorized' } });
	});

	it('answers 400 {"error":"Invalid JSON"} for a malformed body', async () => {
		const user = await seedUser(db(), { email: 'verify-json@example.test' });
		const res = await invoke(postVerifyEmail, {
			ctx: ctx(),
			user,
			path: '/api/me/verify-email',
			headers: { 'x-real-ip': '10.3.0.3' },
			rawBody: 'nope'
		});
		expect(res).toMatchObject({ status: 400, body: { error: 'Invalid JSON' } });
	});

	it('verifies the caller’s own address and burns the code', async () => {
		const user = await seedUser(db(), {
			email: 'verify-ok@example.test',
			emailVerified: false
		});
		await seedEmailCode({
			code: '24681357',
			email: 'verify-ok@example.test',
			type: 'password-signup'
		});
		const res = await invoke(postVerifyEmail, {
			ctx: ctx(),
			user,
			path: '/api/me/verify-email',
			headers: { 'x-real-ip': '10.3.0.4' },
			body: { code: ' 24681357 ' }
		});
		expect(res.status).toBe(200);
		expect(res.body).toEqual({ success: true });
		const [row] = await db().select().from(users).where(eq(users.id, user.id));
		expect(row.emailVerified).toBe(true);
		expect(await rowsOfEmail('verify-ok@example.test')).toEqual([]);
	});

	it('rejects a code of another type with the one generic 400', async () => {
		const user = await seedUser(db(), {
			email: 'verify-type@example.test',
			emailVerified: false
		});
		await seedEmailCode({ code: '33445566', email: 'verify-type@example.test', type: 'login' });
		const res = await invoke(postVerifyEmail, {
			ctx: ctx(),
			user,
			path: '/api/me/verify-email',
			headers: { 'x-real-ip': '10.3.0.5' },
			body: { code: '33445566' }
		});
		expect(res.status).toBe(400);
		expect(res.body).toEqual({ success: false, error: 'Unexpected error, please try again' });
		expect(await rowsOfEmail('verify-type@example.test')).toHaveLength(1);
	});

	it('answers the same generic 400 for an absent or non-string code', async () => {
		const user = await seedUser(db(), { email: 'verify-absent@example.test' });
		const bodies: JsonValue[] = [{}, { code: null }, { code: 7 }];
		for (const [index, body] of bodies.entries()) {
			const res = await invoke(postVerifyEmail, {
				ctx: ctx(),
				user,
				path: '/api/me/verify-email',
				headers: { 'x-real-ip': `10.3.1.${index + 1}` },
				body
			});
			expect(res.status).toBe(400);
			expect(res.body).toEqual({ success: false, error: 'Unexpected error, please try again' });
		}
	});

	it('throttles code guessing at 10 per 15 minutes per IP', async () => {
		const user = await seedUser(db(), { email: 'verify-429@example.test' });
		const send = () =>
			invoke(postVerifyEmail, {
				ctx: ctx(),
				user,
				path: '/api/me/verify-email',
				headers: { 'x-real-ip': '10.3.2.1' },
				body: { code: '00000000' }
			});
		for (let attempt = 0; attempt < 10; attempt += 1) {
			const allowed = await send();
			expect(allowed.status).toBe(400);
		}
		const refused = await send();
		expect(refused.status).toBe(429);
		expect(refused.body).toEqual({
			success: false,
			error: 'Too many attempts. Try again shortly.'
		});
	});
});

describe('POST /api/me/verify-email/resend', () => {
	it('answers 401 {"error":"Unauthorized"} when signed out', async () => {
		const res = await invoke(postResendVerification, {
			ctx: ctx(),
			path: '/api/me/verify-email/resend',
			headers: { 'x-real-ip': '10.4.0.1' }
		});
		expect(res).toMatchObject({ status: 401, body: { error: 'Unauthorized' } });
	});

	it('answers 401 for an Anonymous Account (nothing to resend to)', async () => {
		const guest = await seedGuest();
		const res = await invoke(postResendVerification, {
			ctx: ctx(),
			user: guest,
			path: '/api/me/verify-email/resend',
			headers: { 'x-real-ip': '10.4.0.2' }
		});
		expect(res).toMatchObject({ status: 401, body: { error: 'Unauthorized' } });
	});

	it('answers {success:true} without emailing once verified', async () => {
		const user = await seedUser(db(), {
			email: 'resend-verified@example.test',
			emailVerified: true
		});
		const res = await invoke(postResendVerification, {
			ctx: ctx(),
			user,
			path: '/api/me/verify-email/resend',
			headers: { 'x-real-ip': '10.4.0.3' }
		});
		expect(res.status).toBe(200);
		expect(res.body).toEqual({ success: true });
		expect(await rowsOfEmail('resend-verified@example.test')).toEqual([]);
	});

	it('throttles resends at 5 per 15 minutes per person', async () => {
		const user = await seedUser(db(), {
			email: 'resend-429@example.test',
			emailVerified: true
		});
		const send = () =>
			invoke(postResendVerification, {
				ctx: ctx(),
				user,
				path: '/api/me/verify-email/resend',
				headers: { 'x-real-ip': '10.4.1.1' }
			});
		for (let attempt = 0; attempt < 5; attempt += 1) {
			const allowed = await send();
			expect(allowed.status).toBe(200);
		}
		const refused = await send();
		expect(refused).toMatchObject({
			status: 429,
			body: { error: 'Too many attempts. Try again shortly.' }
		});
	});
});

describe('POST /api/mobile/auth/email', () => {
	it('answers 400 {"error":"Request body must be JSON"} for a non-object body', async () => {
		for (const [index, options] of [
			{ rawBody: '{not json' },
			{ body: [1, 2] },
			{ body: null }
		].entries()) {
			const res = await invoke(postMobileEmail, {
				ctx: ctx(),
				path: '/api/mobile/auth/email',
				headers: { 'x-real-ip': `10.5.0.${index + 1}` },
				...options
			});
			expect(res).toMatchObject({
				status: 400,
				body: { error: 'Request body must be JSON' }
			});
		}
	});

	it('validates the address, then the intent, then the signup names', async () => {
		const noEmail = await invoke(postMobileEmail, {
			ctx: ctx(),
			path: '/api/mobile/auth/email',
			headers: { 'x-real-ip': '10.5.1.1' },
			body: {}
		});
		expect(noEmail).toMatchObject({ status: 400, body: { error: 'Enter a valid email' } });

		const noIntent = await invoke(postMobileEmail, {
			ctx: ctx(),
			path: '/api/mobile/auth/email',
			headers: { 'x-real-ip': '10.5.1.2' },
			body: { email: 'intent@example.test' }
		});
		expect(noIntent).toMatchObject({
			status: 400,
			body: { error: 'intent must be "login" or "signup"' }
		});

		const noNames = await invoke(postMobileEmail, {
			ctx: ctx(),
			path: '/api/mobile/auth/email',
			headers: { 'x-real-ip': '10.5.1.3' },
			body: { email: 'names@example.test', intent: 'signup' }
		});
		expect(noNames).toMatchObject({
			status: 400,
			body: { error: 'First and last name are required' }
		});
	});

	it('answers {sent:true} and sends nothing for an unknown login', async () => {
		const email = 'unknown-login@example.test';
		const res = await invoke(postMobileEmail, {
			ctx: ctx(),
			path: '/api/mobile/auth/email',
			headers: { 'x-real-ip': '10.5.2.1' },
			body: { email, intent: 'login' }
		});
		expect(res.status).toBe(200);
		expect(res.body).toEqual({ sent: true });
		expect(res.headers.get('set-cookie')).toBeNull();
		expect(await rowsOfEmail(email)).toEqual([]);
	});

	it('answers {sent:true} and writes no code for an already-registered signup address', async () => {
		const email = 'registered-signup@example.test';
		await seedUser(db(), { email });
		const res = await invoke(postMobileEmail, {
			ctx: ctx(),
			path: '/api/mobile/auth/email',
			headers: { 'x-real-ip': '10.5.2.2' },
			body: { email, intent: 'signup', firstName: 'Mia', lastName: 'Lopez' }
		});
		expect(res.status).toBe(200);
		expect(res.body).toEqual({ sent: true });
		expect(await rowsOfEmail(email)).toEqual([]);
	});

	it('rate-limits one address at 5 emails per 15 minutes → 429', async () => {
		const email = 'email-429@example.test';
		const send = () =>
			invoke(postMobileEmail, {
				ctx: ctx(),
				path: '/api/mobile/auth/email',
				headers: { 'x-real-ip': '10.5.3.1' },
				body: { email, intent: 'login' }
			});
		for (let attempt = 0; attempt < 5; attempt += 1) {
			const allowed = await send();
			expect(allowed.status).toBe(200);
		}
		const refused = await send();
		expect(refused.status).toBe(429);
		expect(refused.body).toEqual({ error: 'Too many attempts — try again in a few minutes' });
	});
});

describe('POST /api/mobile/auth/verify', () => {
	it('answers 400 {"error":"Request body must be JSON"} for a malformed body', async () => {
		const res = await invoke(postMobileVerify, {
			ctx: ctx(),
			path: '/api/mobile/auth/verify',
			headers: { 'x-real-ip': '10.6.0.1' },
			rawBody: 'not json'
		});
		expect(res).toMatchObject({ status: 400, body: { error: 'Request body must be JSON' } });
	});

	it('validates the address and the intent before touching a code', async () => {
		const noEmail = await invoke(postMobileVerify, {
			ctx: ctx(),
			path: '/api/mobile/auth/verify',
			headers: { 'x-real-ip': '10.6.0.2' },
			body: { code: '12345678', intent: 'login' }
		});
		expect(noEmail).toMatchObject({ status: 400, body: { error: 'Enter a valid email' } });

		const noIntent = await invoke(postMobileVerify, {
			ctx: ctx(),
			path: '/api/mobile/auth/verify',
			headers: { 'x-real-ip': '10.6.0.3' },
			body: { code: '12345678', email: 'a@example.test' }
		});
		expect(noIntent).toMatchObject({
			status: 400,
			body: { error: 'intent must be "login" or "signup"' }
		});
	});

	it('reads an absent or non-string code as "That code is wrong or expired"', async () => {
		const bodies: JsonValue[] = [
			{ email: 'nocode@example.test', intent: 'login' },
			{ email: 'nocode@example.test', intent: 'login', code: null }
		];
		for (const [index, body] of bodies.entries()) {
			const res = await invoke(postMobileVerify, {
				ctx: ctx(),
				path: '/api/mobile/auth/verify',
				headers: { 'x-real-ip': `10.6.1.${index + 1}` },
				body
			});
			expect(res).toMatchObject({
				status: 400,
				body: { error: 'That code is wrong or expired' }
			});
		}
	});

	it('refuses a code minted for the other intent with the one generic 400', async () => {
		await seedEmailCode({
			code: '11223344',
			email: 'cross-intent@example.test',
			type: 'signup',
			firstName: 'Mia',
			lastName: 'Lopez'
		});
		const res = await invoke(postMobileVerify, {
			ctx: ctx(),
			path: '/api/mobile/auth/verify',
			headers: { 'x-real-ip': '10.6.1.3' },
			body: { email: 'cross-intent@example.test', intent: 'login', code: '11223344' }
		});
		expect(res).toMatchObject({ status: 400, body: { error: 'That code is wrong or expired' } });
	});

	it('answers {token,user} and sets no cookie', async () => {
		const email = 'verify-login@example.test';
		const user = await seedUser(db(), { email, firstName: 'Mia', lastName: 'Lopez' });
		await seedEmailCode({ code: '13572468', email, type: 'login' });
		const res = await invoke(postMobileVerify, {
			ctx: ctx(),
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

	it('burns the code so it cannot be redeemed twice', async () => {
		const email = 'verify-once@example.test';
		await seedUser(db(), { email });
		await seedEmailCode({ code: '99887766', email, type: 'login' });
		const send = () =>
			invoke(postMobileVerify, {
				ctx: ctx(),
				path: '/api/mobile/auth/verify',
				headers: { 'x-real-ip': '10.6.2.2' },
				body: { email, intent: 'login', code: '99887766' }
			});
		expect((await send()).status).toBe(200);
		const second = await send();
		expect(second).toMatchObject({ status: 400, body: { error: 'That code is wrong or expired' } });
		expect(await rowsOfEmail(email)).toEqual([]);
	});

	it('creates the account on a signup code, from the names stored with it', async () => {
		const email = 'verify-signup@example.test';
		await seedEmailCode({
			code: '44556677',
			email,
			type: 'signup',
			firstName: 'Noah',
			lastName: 'Kim'
		});
		const res = await invoke(postMobileVerify, {
			ctx: ctx(),
			path: '/api/mobile/auth/verify',
			headers: { 'x-real-ip': '10.6.2.3' },
			body: { email, intent: 'signup', code: '44556677', deviceName: '  Pixel 9 Pro  ' }
		});
		expect(res.status).toBe(200);
		const body = res.body;
		expect(body).toEqual({
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
	});

	it('refuses a signup code row that lost its names with the generic 400', async () => {
		const email = 'verify-names@example.test';
		await seedEmailCode({ code: '55667788', email, type: 'signup' });
		const res = await invoke(postMobileVerify, {
			ctx: ctx(),
			path: '/api/mobile/auth/verify',
			headers: { 'x-real-ip': '10.6.2.4' },
			body: { email, intent: 'signup', code: '55667788' }
		});
		expect(res).toMatchObject({ status: 400, body: { error: 'That code is wrong or expired' } });
	});

	it('refuses a signup whose address got registered meanwhile with 409 and burns the code', async () => {
		const email = 'verify-race@example.test';
		await seedUser(db(), { email });
		await seedEmailCode({
			code: '66778899',
			email,
			type: 'signup',
			firstName: 'Mia',
			lastName: 'Lopez'
		});
		const res = await invoke(postMobileVerify, {
			ctx: ctx(),
			path: '/api/mobile/auth/verify',
			headers: { 'x-real-ip': '10.6.2.5' },
			body: { email, intent: 'signup', code: '66778899' }
		});
		expect(res.status).toBe(409);
		expect(res.body).toEqual({
			error: 'An account with this email already exists — sign in instead'
		});
		expect(await rowsOfEmail(email)).toEqual([]);
		const existing = first(await db().select().from(users).where(eq(users.email, email)));
		expect(await tokensFor(existing.id)).toEqual([]);
	});

	it('throttles code redemption at 10 per 15 minutes per address and IP', async () => {
		const email = 'verify-429@example.test';
		await seedUser(db(), { email });
		const send = () =>
			invoke(postMobileVerify, {
				ctx: ctx(),
				path: '/api/mobile/auth/verify',
				headers: { 'x-real-ip': '10.6.3.1' },
				body: { email, intent: 'login', code: '00000000' }
			});
		for (let attempt = 0; attempt < 10; attempt += 1) {
			const allowed = await send();
			expect(allowed.status).toBe(400);
		}
		const refused = await send();
		expect(refused.status).toBe(429);
		expect(refused.body).toEqual({ error: 'Too many attempts — try again in a few minutes' });
	});
});

describe('POST /api/mobile/auth/password', () => {
	it('answers 400 {"error":"Request body must be JSON"} for a malformed body', async () => {
		const res = await invoke(postMobilePassword, {
			ctx: ctx(),
			path: '/api/mobile/auth/password',
			headers: { 'x-real-ip': '10.7.0.1' },
			rawBody: '{"email":'
		});
		expect(res).toMatchObject({ status: 400, body: { error: 'Request body must be JSON' } });
	});

	it('requires both fields (absent, null and "" all read the same)', async () => {
		const bodies: JsonValue[] = [
			{},
			{ email: 'a@example.test' },
			{ password: 'correct-horse-battery' },
			{ email: null, password: 'correct-horse-battery' }
		];
		for (const [index, body] of bodies.entries()) {
			const res = await invoke(postMobilePassword, {
				ctx: ctx(),
				path: '/api/mobile/auth/password',
				headers: { 'x-real-ip': `10.7.0.${index + 2}` },
				body
			});
			expect(res).toMatchObject({
				status: 400,
				body: { error: 'Email and password are required' }
			});
		}
	});

	it('answers the one generic 401 for an unknown email', async () => {
		const res = await invoke(postMobilePassword, {
			ctx: ctx(),
			path: '/api/mobile/auth/password',
			headers: { 'x-real-ip': '10.7.1.1' },
			body: { email: 'nobody@example.test', password: PASSWORD }
		});
		expect(res.status).toBe(401);
		expect(res.body).toEqual({ error: 'Email or password is incorrect' });
	});

	it('answers the one generic 401 for a wrong password', async () => {
		const email = 'password-wrong@example.test';
		await seedPasswordUser(email);
		const res = await invoke(postMobilePassword, {
			ctx: ctx(),
			path: '/api/mobile/auth/password',
			headers: { 'x-real-ip': '10.7.1.2' },
			body: { email, password: 'not-the-password' }
		});
		expect(res.status).toBe(401);
		expect(res.body).toEqual({ error: 'Email or password is incorrect' });
	});

	it('answers the one generic 401 for an Anonymous Account', async () => {
		const guest = await seedGuest();
		const res = await invoke(postMobilePassword, {
			ctx: ctx(),
			path: '/api/mobile/auth/password',
			headers: { 'x-real-ip': '10.7.1.3' },
			body: { email: guest.email, password: PASSWORD }
		});
		expect(res.status).toBe(401);
		expect(res.body).toEqual({ error: 'Email or password is incorrect' });
	});

	it('signs in with a token, creates the missing settings row and leaks no hash', async () => {
		const email = 'password-ok@example.test';
		const user = await seedPasswordUser(email);
		const res = await invoke(postMobilePassword, {
			ctx: ctx(),
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

	it('throttles password sign-in at 10 per 5 minutes per address and IP', async () => {
		const email = 'password-429@example.test';
		await seedPasswordUser(email);
		const send = () =>
			invoke(postMobilePassword, {
				ctx: ctx(),
				path: '/api/mobile/auth/password',
				headers: { 'x-real-ip': '10.7.3.1' },
				body: { email, password: 'not-the-password' }
			});
		for (let attempt = 0; attempt < 10; attempt += 1) {
			const allowed = await send();
			expect(allowed.status).toBe(401);
		}
		const refused = await send();
		expect(refused.status).toBe(429);
		expect(refused.body).toEqual({ error: 'Too many attempts — try again in a few minutes' });
	});
});

describe('POST /api/mobile/auth/guest', () => {
	it('creates an Anonymous Account with an empty body, and sets no cookie', async () => {
		const res = await invoke(postMobileGuest, {
			ctx: ctx(),
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
		expect(guest.email).toBe(`${guest.id}${ANON_DOMAIN}`);
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
		const trimmed = await invoke(postMobileGuest, {
			ctx: ctx(),
			path: '/api/mobile/auth/guest',
			headers: { 'x-real-ip': '10.8.0.2' },
			body: { deviceName: '  Pixel 9 Pro  ' }
		});
		expect(trimmed.status).toBe(200);
		const long = await invoke(postMobileGuest, {
			ctx: ctx(),
			path: '/api/mobile/auth/guest',
			headers: { 'x-real-ip': '10.8.0.3' },
			body: { deviceName: 'x'.repeat(70) }
		});
		expect(long.status).toBe(200);
		const names = (await db().select({ name: apiTokens.name }).from(apiTokens)).map((row) => row.name);
		expect(names.sort()).toEqual([`Android — Pixel 9 Pro`, `Android — ${'x'.repeat(60)}`]);
	});

	it('answers 400 {"error":"Request body must be JSON"} for a null or malformed body', async () => {
		const nullBody = await invoke(postMobileGuest, {
			ctx: ctx(),
			path: '/api/mobile/auth/guest',
			headers: { 'x-real-ip': '10.8.0.4' },
			body: null
		});
		expect(nullBody).toMatchObject({ status: 400, body: { error: 'Request body must be JSON' } });

		const malformed = await invoke(postMobileGuest, {
			ctx: ctx(),
			path: '/api/mobile/auth/guest',
			headers: { 'x-real-ip': '10.8.0.5' },
			rawBody: '{oops'
		});
		expect(malformed).toMatchObject({ status: 400, body: { error: 'Request body must be JSON' } });
	});

	it('rate-limits guest creation at 10 per hour per IP', async () => {
		const send = () =>
			invoke(postMobileGuest, {
				ctx: ctx(),
				path: '/api/mobile/auth/guest',
				headers: { 'x-real-ip': '10.8.1.1' },
				body: {}
			});
		for (let attempt = 0; attempt < 10; attempt += 1) {
			const allowed = await send();
			expect(allowed.status).toBe(200);
		}
		const refused = await send();
		expect(refused.status).toBe(429);
		expect(refused.body).toEqual({ error: 'Too many attempts — try again in a few minutes' });
	});
});

describe('POST /api/mobile/auth/logout', () => {
	it('answers 401 {"error":"Unauthorized"} without a bearer token', async () => {
		const user = await seedUser(db(), { email: 'logout-nobearer@example.test' });
		const res = await invoke(postMobileLogout, {
			ctx: ctx(),
			user,
			via: 'token',
			path: '/api/mobile/auth/logout',
			headers: { 'x-real-ip': '10.9.0.1' }
		});
		expect(res).toMatchObject({ status: 401, body: { error: 'Unauthorized' } });
	});

	it('answers 401 when the bearer token resolved to nobody', async () => {
		const res = await invoke(postMobileLogout, {
			ctx: ctx(),
			path: '/api/mobile/auth/logout',
			headers: { 'x-real-ip': '10.9.0.2', authorization: 'Bearer fp_unknown' }
		});
		expect(res).toMatchObject({ status: 401, body: { error: 'Unauthorized' } });
	});

	it('answers 401 for a token that is not an fp_ token', async () => {
		const user = await seedUser(db(), { email: 'logout-badtoken@example.test' });
		const res = await invoke(postMobileLogout, {
			ctx: ctx(),
			user,
			via: 'token',
			path: '/api/mobile/auth/logout',
			headers: { 'x-real-ip': '10.9.0.3', authorization: 'Bearer not-an-fp-token' }
		});
		expect(res).toMatchObject({ status: 401, body: { error: 'Unauthorized' } });
	});

	it('revokes exactly the presented token', async () => {
		const user = await seedUser(db(), { email: 'logout-ok@example.test' });
		const presented = 'fp_presentedTokenForTheLogoutGoldenOnly';
		await seedApiToken(user.id, presented, 'This phone');
		await seedApiToken(user.id, 'fp_otherTokenForTheLogoutGoldenOnly', 'Another phone');
		const res = await invoke(postMobileLogout, {
			ctx: ctx(),
			user,
			via: 'token',
			path: '/api/mobile/auth/logout',
			headers: { 'x-real-ip': '10.9.1.1', authorization: `Bearer ${presented}` }
		});
		expect(res.status).toBe(200);
		expect(res.body).toEqual({ success: true });
		expect(res.headers.get('set-cookie')).toBeNull();
		const tokens = await tokensFor(user.id);
		expect(tokens.map((row) => row.name)).toEqual(['Another phone']);
	});

	it('is idempotent for an already-revoked token: still {success:true}', async () => {
		const user = await seedUser(db(), { email: 'logout-twice@example.test' });
		const res = await invoke(postMobileLogout, {
			ctx: ctx(),
			user,
			via: 'token',
			path: '/api/mobile/auth/logout',
			headers: { 'x-real-ip': '10.9.1.2', authorization: 'Bearer fp_neverExistedForThisGoldenOnly' }
		});
		expect(res.status).toBe(200);
		expect(res.body).toEqual({ success: true });
	});
});

describe('POST /api/mobile/auth/signup', () => {
	it('answers 400 {"error":"Invalid JSON"} for a malformed body', async () => {
		const res = await invoke(postMobileSignup, {
			ctx: ctx(),
			path: '/api/mobile/auth/signup',
			headers: { 'x-real-ip': '10.10.0.1' },
			rawBody: '{signup'
		});
		expect(res).toMatchObject({ status: 400, body: { error: 'Invalid JSON' } });
	});

	it('requires all four fields and a password of at least 8 characters', async () => {
		const missing = await invoke(postMobileSignup, {
			ctx: ctx(),
			path: '/api/mobile/auth/signup',
			headers: { 'x-real-ip': '10.10.0.2' },
			body: {
				email: 'signup-missing@example.test',
				password: PASSWORD,
				firstName: 'Mia',
				lastName: null
			}
		});
		expect(missing).toMatchObject({ status: 400, body: { error: 'All fields are required' } });

		const short = await invoke(postMobileSignup, {
			ctx: ctx(),
			path: '/api/mobile/auth/signup',
			headers: { 'x-real-ip': '10.10.0.3' },
			body: {
				email: 'signup-short@example.test',
				password: 'short',
				firstName: 'Mia',
				lastName: 'Lopez'
			}
		});
		expect(short).toMatchObject({
			status: 400,
			body: { error: 'Password must be at least 8 characters' }
		});
	});

	it('answers the same 200 pending shape for a taken email — empty token, nothing created', async () => {
		const email = 'signup-taken@example.test';
		const existing = await seedUser(db(), { email });
		const res = await invoke(postMobileSignup, {
			ctx: ctx(),
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
	});

	it('rate-limits one address at 10 attempts per 5 minutes', async () => {
		const email = 'signup-429@example.test';
		await seedUser(db(), { email });
		const send = () =>
			invoke(postMobileSignup, {
				ctx: ctx(),
				path: '/api/mobile/auth/signup',
				headers: { 'x-real-ip': '10.10.2.1' },
				body: { email, password: PASSWORD, firstName: 'Mia', lastName: 'Lopez' }
			});
		for (let attempt = 0; attempt < 10; attempt += 1) {
			const allowed = await send();
			expect(allowed.status).toBe(200);
		}
		const refused = await send();
		expect(refused).toMatchObject({
			status: 429,
			body: { error: 'Too many attempts. Try again shortly.' }
		});
	});

	it('rate-limits one IP at 30 attempts per 5 minutes across addresses', async () => {
		const emails: string[] = [];
		for (let index = 0; index < 30; index += 1) {
			const email = `signup-spray-${index}@example.test`;
			emails.push(email);
			await seedUser(db(), { email });
		}
		const send = (email: string) =>
			invoke(postMobileSignup, {
				ctx: ctx(),
				path: '/api/mobile/auth/signup',
				headers: { 'x-real-ip': '10.10.3.1' },
				body: { email, password: PASSWORD, firstName: 'Mia', lastName: 'Lopez' }
			});
		for (const email of emails) {
			const allowed = await send(email);
			expect(allowed.status).toBe(200);
		}
		const refused = await send('signup-spray-30@example.test');
		expect(refused).toMatchObject({
			status: 429,
			body: { error: 'Too many attempts. Try again shortly.' }
		});
	});
});

describe('POST /api/mobile/auth/forgot', () => {
	it('answers 400 {"error":"Email is required"} for an absent email', async () => {
		const res = await invoke(postMobileForgot, {
			ctx: ctx(),
			path: '/api/mobile/auth/forgot',
			headers: { 'x-real-ip': '10.11.0.1' },
			body: {}
		});
		expect(res).toMatchObject({ status: 400, body: { error: 'Email is required' } });
	});

	it('answers 500 {"error":"Failed to send reset email"} for a malformed body', async () => {
		const res = await invoke(postMobileForgot, {
			ctx: ctx(),
			path: '/api/mobile/auth/forgot',
			headers: { 'x-real-ip': '10.11.0.2' },
			rawBody: 'not json'
		});
		expect(res).toMatchObject({
			status: 500,
			body: { error: 'Failed to send reset email' }
		});
	});

	it('answers {sent:true} for an unknown address without emailing', async () => {
		const res = await invoke(postMobileForgot, {
			ctx: ctx(),
			path: '/api/mobile/auth/forgot',
			headers: { 'x-real-ip': '10.11.0.3' },
			body: { email: 'forgot-unknown@example.test' }
		});
		expect(res.status).toBe(200);
		expect(res.body).toEqual({ sent: true });
		expect(await rowsOfEmail('forgot-unknown@example.test')).toEqual([]);
	});

	it('treats an Anonymous Account placeholder as unknown', async () => {
		const guest = await seedGuest();
		const res = await invoke(postMobileForgot, {
			ctx: ctx(),
			path: '/api/mobile/auth/forgot',
			headers: { 'x-real-ip': '10.11.0.4' },
			body: { email: guest.email }
		});
		expect(res.status).toBe(200);
		expect(res.body).toEqual({ sent: true });
		expect(await rowsOfEmail(guest.email ?? '')).toEqual([]);
	});

	it('throttles reset mail at 5 per 15 minutes per address and IP', async () => {
		const email = 'forgot-429@example.test';
		const send = () =>
			invoke(postMobileForgot, {
				ctx: ctx(),
				path: '/api/mobile/auth/forgot',
				headers: { 'x-real-ip': '10.11.1.1' },
				body: { email }
			});
		for (let attempt = 0; attempt < 5; attempt += 1) {
			const allowed = await send();
			expect(allowed.status).toBe(200);
		}
		const refused = await send();
		expect(refused).toMatchObject({
			status: 429,
			body: { error: 'Too many attempts. Try again shortly.' }
		});
	});
});

describe('POST /api/mobile/auth/reset', () => {
	it('requires a token and a password (null reads as absent)', async () => {
		const bodies: JsonValue[] = [{}, { token: null, password: 'long-enough-password' }];
		for (const [index, body] of bodies.entries()) {
			const res = await invoke(postMobileReset, {
				ctx: ctx(),
				path: '/api/mobile/auth/reset',
				headers: { 'x-real-ip': `10.12.0.${index + 1}` },
				body
			});
			expect(res).toMatchObject({
				status: 400,
				body: { error: 'Token and password are required' }
			});
		}
	});

	it('requires a password of at least 8 characters', async () => {
		const token = await mintResetToken('reset-short@example.test');
		const res = await invoke(postMobileReset, {
			ctx: ctx(),
			path: '/api/mobile/auth/reset',
			headers: { 'x-real-ip': '10.12.0.3' },
			body: { token, password: 'short' }
		});
		expect(res).toMatchObject({
			status: 400,
			body: { error: 'Password must be at least 8 characters' }
		});
	});

	it('refuses a token it did not sign', async () => {
		const res = await invoke(postMobileReset, {
			ctx: ctx(),
			path: '/api/mobile/auth/reset',
			headers: { 'x-real-ip': '10.12.0.4' },
			body: { token: 'not.a.jwt', password: 'long-enough-password' }
		});
		expect(res.status).toBe(400);
		expect(res.body).toEqual({
			error: 'Invalid or expired reset token. Please request a new one.'
		});
	});

	it('answers 500 {"error":"Failed to reset password"} for a malformed body', async () => {
		const res = await invoke(postMobileReset, {
			ctx: ctx(),
			path: '/api/mobile/auth/reset',
			headers: { 'x-real-ip': '10.12.0.5' },
			rawBody: 'not json'
		});
		expect(res).toMatchObject({ status: 500, body: { error: 'Failed to reset password' } });
	});

	it('answers 400 {"error":"Account not found"} for a signed token with no account', async () => {
		const token = await mintResetToken('reset-gone@example.test');
		const res = await invoke(postMobileReset, {
			ctx: ctx(),
			path: '/api/mobile/auth/reset',
			headers: { 'x-real-ip': '10.12.0.6' },
			body: { token, password: 'long-enough-password' }
		});
		expect(res).toMatchObject({ status: 400, body: { error: 'Account not found' } });
	});

	it('resets the password, kills every session and every token, and refuses the token again', async () => {
		const email = 'reset-ok@example.test';
		const user = await seedPasswordUser(email);
		await db().insert(authSession).values({
			id: 'session-reset-1',
			token: 'session-token-reset-1',
			userId: user.id,
			expiresAt: new Date('2099-01-01T00:00:00.000Z')
		});
		await seedApiToken(user.id, 'fp_doomedTokenForTheResetGoldenOnly', 'Old phone');
		const token = await mintResetToken(email);
		const res = await invoke(postMobileReset, {
			ctx: ctx(),
			path: '/api/mobile/auth/reset',
			headers: { 'x-real-ip': '10.12.1.1' },
			body: { token, password: 'a-brand-new-password' }
		});
		expect(res.status).toBe(200);
		expect(res.body).toEqual({ success: true });
		const [row] = await db().select().from(users).where(eq(users.id, user.id));
		expect(row.passwordHash).toMatch(/^\$2[aby]\$/);
		expect(row.passwordHash).not.toBe(PASSWORD_HASH);
		expect(await db().select().from(authSession).where(eq(authSession.userId, user.id))).toEqual([]);
		expect(await tokensFor(user.id)).toEqual([]);
		const marker = first(
			await db()
				.select()
				.from(codes)
				.where(eq(codes.code, `used:${sha256(token)}`))
		);
		expect(marker.type).toBe('reset_used');
		expect(marker.email).toBe(email);
		expect(marker.expiresAt.toISOString()).toMatch(/^\d{4}-\d{2}-\d{2}T/);

		const again = await invoke(postMobileReset, {
			ctx: ctx(),
			path: '/api/mobile/auth/reset',
			headers: { 'x-real-ip': '10.12.1.2' },
			body: { token, password: 'another-brand-new-password' }
		});
		expect(again.status).toBe(400);
		expect(again.body).toEqual({
			error: 'This reset link has already been used. Please request a new one.'
		});
	});

	it('throttles reset attempts at 10 per 15 minutes per IP', async () => {
		const send = () =>
			invoke(postMobileReset, {
				ctx: ctx(),
				path: '/api/mobile/auth/reset',
				headers: { 'x-real-ip': '10.12.2.1' },
				body: { token: 'not.a.jwt', password: 'long-enough-password' }
			});
		for (let attempt = 0; attempt < 10; attempt += 1) {
			const allowed = await send();
			expect(allowed.status).toBe(400);
		}
		const refused = await send();
		expect(refused).toMatchObject({
			status: 429,
			body: { error: 'Too many attempts. Try again shortly.' }
		});
	});
});

/**
 * golden from spec: legacy handler sends through the module-scope Resend client
 * (`src/lib/utils/sendEmail.ts`), so these success paths would hit the network
 * from the db project and cannot run here. The expected wire comes from
 * docs/guides/task-api-spec.md and the legacy unit tests (which inject the send
 * seam). The ported handlers take the sender from `ctx`, so S6 unskips these —
 * see docs/rewrite/modules/access.md#notes.
 */
describe('success paths that send email (spec-goldens, skipped until S6)', () => {
	it.skip('POST /api/me/claim — answers {sent:true} for a guest at a fresh address', async () => {
		const guest = await seedGuest();
		const res = await invoke(postClaim, {
			ctx: ctx(),
			user: guest,
			path: '/api/me/claim',
			headers: { 'x-real-ip': '10.13.0.1' },
			body: { email: 'claim-fresh@example.test' }
		});
		expect(res.status).toBe(200);
		expect(res.body).toEqual({ sent: true });
	});

	it.skip('POST /api/me/claim — answers the same {sent:true} for a registered address', async () => {
		const guest = await seedGuest();
		await seedUser(db(), { email: 'claim-taken@example.test' });
		const res = await invoke(postClaim, {
			ctx: ctx(),
			user: guest,
			path: '/api/me/claim',
			headers: { 'x-real-ip': '10.13.0.2' },
			body: { email: 'claim-taken@example.test' }
		});
		expect(res.status).toBe(200);
		expect(res.body).toEqual({ sent: true });
	});

	it.skip('POST /api/me/claim — answers 429 on the fourth request for the same address within 15 minutes', async () => {
		const guest = await seedGuest();
		const send = () =>
			invoke(postClaim, {
				ctx: ctx(),
				user: guest,
				path: '/api/me/claim',
				headers: { 'x-real-ip': '10.13.0.3' },
				body: { email: 'claim-429@example.test' }
			});
		for (let attempt = 0; attempt < 3; attempt += 1) {
			expect((await send()).status).toBe(200);
		}
		const refused = await send();
		expect(refused).toMatchObject({
			status: 429,
			body: { error: 'Too many attempts. Try again shortly.' }
		});
	});

	it.skip('POST /api/me/email — mails a code to the NEW address and answers the message', async () => {
		const user = await seedUser(db(), { email: 'change-ok@example.test' });
		const res = await invoke(postChangeEmail, {
			ctx: ctx(),
			user,
			path: '/api/me/email',
			headers: { 'x-real-ip': '10.13.0.4' },
			body: { email: 'change-new@example.test' }
		});
		expect(res.status).toBe(200);
		expect(res.body).toEqual({
			success: true,
			message: 'Verification email sent. Please check your inbox.'
		});
	});

	it.skip('POST /api/me/verify-email/resend — sends a code to an unverified caller', async () => {
		const user = await seedUser(db(), {
			email: 'resend-unverified@example.test',
			emailVerified: false
		});
		const res = await invoke(postResendVerification, {
			ctx: ctx(),
			user,
			path: '/api/me/verify-email/resend',
			headers: { 'x-real-ip': '10.13.0.5' }
		});
		expect(res.status).toBe(200);
		expect(res.body).toEqual({ success: true });
	});

	it.skip('POST /api/mobile/auth/email — sends the code for a known login and a fresh signup', async () => {
		const email = 'mobile-email-known@example.test';
		await seedUser(db(), { email });
		const res = await invoke(postMobileEmail, {
			ctx: ctx(),
			path: '/api/mobile/auth/email',
			headers: { 'x-real-ip': '10.13.0.6' },
			body: { email, intent: 'login' }
		});
		expect(res.status).toBe(200);
		expect(res.body).toEqual({ sent: true });
		expect((await rowsOfEmail(email)).map((row) => row.type)).toEqual(['login']);
	});

	it.skip('POST /api/mobile/auth/signup — creates the account, mints a token, answers 200 pending', async () => {
		const email = 'mobile-signup-new@example.test';
		const res = await invoke(postMobileSignup, {
			ctx: ctx(),
			path: '/api/mobile/auth/signup',
			headers: { 'x-real-ip': '10.13.0.7' },
			body: { email, password: PASSWORD, firstName: 'Mia', lastName: 'Lopez' }
		});
		expect(res.status).toBe(200);
		const body = res.body;
		expect(body).toEqual({
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
	});

	it.skip('POST /api/mobile/auth/forgot — mails a 60-minute reset link to a registered address', async () => {
		const email = 'forgot-known@example.test';
		await seedUser(db(), { email });
		const res = await invoke(postMobileForgot, {
			ctx: ctx(),
			path: '/api/mobile/auth/forgot',
			headers: { 'x-real-ip': '10.13.0.8' },
			body: { email }
		});
		expect(res.status).toBe(200);
		expect(res.body).toEqual({ sent: true });
	});
});
