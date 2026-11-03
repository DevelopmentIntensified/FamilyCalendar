import { vi } from 'vitest';
import { rateLimit } from '$lib/server/utils/rateLimit';
import type { MobileAuthDeps } from '$lib/server/services/mobileAuth';

/**
 * TEST-ONLY fakes for the #288 mobile auth routes: every collaborator is an
 * untyped vi.fn() flowing through the typed deps seam (the SUT stays
 * type-checked). The rate limiter is the REAL one — tests clear its state.
 */
export function makeFakes() {
	const magicLink = {
		getAccount: vi.fn(),
		getUser: vi.fn(),
		getUserByEmail: vi.fn(),
		createCode: vi.fn(),
		sendEmail: vi.fn(),
		fromEmail: 'noreply@familyplanz.com',
		createJwt: vi.fn(async () => 'jwt-token'),
		verifyJwt: vi.fn(),
		jwtSecret: new Uint8Array([1]),
		baseSiteUrl: 'https://familyplanz.com',
		session: { createSession: vi.fn(), createSessionCookie: vi.fn() }
	};
	const fakes = {
		magicLink,
		getHashedCode: vi.fn(),
		deleteHashedCode: vi.fn(),
		deleteDeadCodes: vi.fn(),
		getAccount: vi.fn(),
		getUser: vi.fn(),
		getUserByEmail: vi.fn(),
		createNewUser: vi.fn(),
		createAnonymousUser: vi.fn(),
		getUserSettings: vi.fn(),
		createUserSettings: vi.fn(),
		verifyPassword: vi.fn(),
		createApiToken: vi.fn(),
		revokeTokenByPlaintext: vi.fn(),
		rateLimit: vi.fn(rateLimit)
	};
	fakes.createApiToken.mockImplementation(async (_userId: string, name: string) => ({
		row: { id: 'tok-row', name },
		token: 'fp_minted'
	}));
	const deps: MobileAuthDeps = fakes;
	return { fakes, deps };
}

/** A request body: a plain JSON object, or undefined for none. */
// oxlint-disable-next-line anti-slop/no-unsafe-dictionary-type -- test bodies are deliberately arbitrary (validation cases send wrong types).
export type TestBody = Record<string, unknown> | undefined;

export function jsonRequest(
	path: string,
	body: TestBody,
	opts: { ip?: string; auth?: string; raw?: string } = {}
): Request {
	const headers = new Headers({ 'content-type': 'application/json' });
	if (opts.ip) headers.set('x-real-ip', opts.ip);
	if (opts.auth) headers.set('authorization', opts.auth);
	return new Request(`https://familyplanz.com${path}`, {
		method: 'POST',
		headers,
		body: opts.raw ?? (body === undefined ? undefined : JSON.stringify(body))
	});
}

export function eventFor(request: Request, user: { id: string } | null = null) {
	// SAFETY: test double — the routes only read `request` (and `locals` for logout).
	return { request, locals: { user, session: null } } as never;
}
