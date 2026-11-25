/**
 * access — the browser calls the auth pages make, on the kernel api client.
 *
 * Deep on purpose: a page passes its typed values and gets `{ok:true}` or the
 * server's own sentence back; it never names a path, a method or a status. The
 * two `/…/code` doors answer the generic `Unexpected error, please try again`
 * (Q-064), so a refusal is always the server's `error` field.
 *
 * Doc: ./README.md#public-interface
 */
import { createApiClient, type ApiResult } from '$lib/kernel/client/apiClient';

/** What `/login/password` echoes: the signed-in person, no token. */
export type AuthSignedInUser = {
	readonly id: string;
	readonly email: string;
	readonly firstName: string;
};

/** `/login/password`'s body. */
export type SignedInResponse = { readonly success: true; readonly user: AuthSignedInUser };

/** `/signup/password`'s body: a fresh account answers `emailVerification:'pending'`. */
export type PasswordSignupResponse = {
	readonly success: true;
	readonly user: AuthSignedInUser;
	readonly emailVerification?: 'pending';
};

/** The bare acknowledgements (`{success:true}`, `{sent:true}`, or an empty body). */
export type AuthAck = unknown;

export function createAuthApi(client = createApiClient()) {
	return {
		/** `POST /login/email` — mail a sign-in link and code; identical for a known and unknown address. */
		requestLoginLink: (input: {
			email: string;
			redirectTo: string;
		}): Promise<ApiResult<AuthAck>> =>
			client.request('POST', '/login/email', { email: input.email, redirectTo: input.redirectTo }),

		/** `POST /login/email/code` — redeem the code; answers an empty body. */
		submitLoginCode: (input: { code: string; email: string }): Promise<ApiResult<AuthAck>> =>
			client.request('POST', '/login/email/code', { code: input.code, email: input.email }),

		/** `POST /login/password` — the one password check, shared with Android. */
		signInWithPassword: (input: {
			email: string;
			password: string;
		}): Promise<ApiResult<SignedInResponse>> =>
			client.request('POST', '/login/password', {
				email: input.email,
				password: input.password
			}),

		/** `POST /signup/email` — mail a sign-up link and code. */
		requestSignupLink: (input: {
			email: string;
			firstName: string;
			lastName: string;
			redirectTo: string;
		}): Promise<ApiResult<AuthAck>> =>
			client.request('POST', '/signup/email', { ...input }),

		/** `POST /signup/email/code` — redeem the sign-up code; answers an empty body. */
		submitSignupCode: (input: { code: string; email: string }): Promise<ApiResult<AuthAck>> =>
			client.request('POST', '/signup/email/code', { code: input.code, email: input.email }),

		/** `POST /signup/password` — create an unverified account (201, pending). */
		signUpWithPassword: (input: {
			email: string;
			password: string;
			firstName: string;
			lastName: string;
		}): Promise<ApiResult<PasswordSignupResponse>> =>
			client.request('POST', '/signup/password', { ...input }),

		/** `POST /signup/password/verify` — confirm a password signup's code. */
		verifySignupPasswordCode: (input: {
			code: string;
			email: string;
		}): Promise<ApiResult<AuthAck>> =>
			client.request('POST', '/signup/password/verify', { code: input.code, email: input.email }),

		/** `POST /signup/password/resend` — the signed-in signup's own resend. */
		resendSignupVerification: (): Promise<ApiResult<AuthAck>> =>
			client.request('POST', '/signup/password/resend'),

		/** `POST /forgot-password` — always `{success:true}` for a well-formed call. */
		requestPasswordReset: (input: { email: string }): Promise<ApiResult<AuthAck>> =>
			client.request('POST', '/forgot-password', { email: input.email }),

		/** `POST /forgot-password/reset` — replace the password and end every session. */
		resetPassword: (input: { token: string; password: string }): Promise<ApiResult<AuthAck>> =>
			client.request('POST', '/forgot-password/reset', {
				token: input.token,
				password: input.password
			})
	};
}

export type AuthApi = ReturnType<typeof createAuthApi>;
