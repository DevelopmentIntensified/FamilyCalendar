/**
 * `/signup`'s state: the Password / Email Link switch, the two sign-up calls,
 * the shared code screen and its resend.
 *
 * Password signup's `emailVerification:'pending'` answer reuses that one code
 * screen (`passwordVerifyPending`) instead of forking a second; the code and
 * resend then hit the password-signup doors. Confirming a code toasts
 * "Email verified — welcome to Family Planz." and leaves for the target.
 *
 * Doc: ./README.md#public-interface
 */
import { systemScheduler, type Scheduler } from '$lib/kernel/time/scheduler';
import type { Toasts } from '$lib/kernel/client/toasts.svelte';
import type { AuthApi } from './access.api';
import {
	AUTH_CONFIRMATION_MS,
	CODE_FAILED_COPY,
	CODE_INVALID_COPY,
	SIGNUP_FAILED_COPY,
	SIGNUP_LINK_FAILED_COPY,
	SIGNUP_VERIFIED_TOAST,
	signupPasswordRefusal,
	type AuthMethod
} from './access.auth.rules';

export type SignupStateOptions = {
	readonly redirectTo: string;
	readonly isLoggedIn: boolean;
	readonly redirect: (path: string) => void | Promise<void>;
	readonly schedule?: Scheduler;
};

export class SignupState {
	method = $state<AuthMethod>('password');
	firstName = $state('');
	lastName = $state('');
	email = $state('');
	password = $state('');
	confirmPassword = $state('');
	error = $state('');
	waiting = $state(false);
	/** The shared code screen is up. */
	sent = $state(false);
	code = $state('');
	resent = $state(false);
	/** The code screen belongs to a password signup: code/resend use its doors. */
	passwordVerifyPending = $state(false);

	readonly redirectTo: string;
	readonly isLoggedIn: boolean;

	private readonly api: AuthApi;
	private readonly toasts: Toasts;
	private readonly redirect: (path: string) => void | Promise<void>;
	private readonly schedule: Scheduler;
	private cancelResent: (() => void) | undefined;

	constructor(
		api: AuthApi,
		toasts: Toasts,
		options: SignupStateOptions
	) {
		this.api = api;
		this.toasts = toasts;
		this.redirectTo = options.redirectTo;
		this.isLoggedIn = options.isLoggedIn;
		this.redirect = options.redirect;
		this.schedule = options.schedule ?? systemScheduler;
	}

	setMethod(method: AuthMethod): void {
		this.method = method;
	}

	/** Create the account; a pending answer shows the code screen. */
	async signUpWithPassword(): Promise<void> {
		if (this.waiting) return;
		const refusal = signupPasswordRefusal(this.password, this.confirmPassword);
		if (refusal) {
			this.error = refusal;
			return;
		}
		this.waiting = true;
		this.error = '';
		const result = await this.api.signUpWithPassword({
			email: this.email,
			password: this.password,
			firstName: this.firstName,
			lastName: this.lastName
		});
		this.waiting = false;
		if (!result.ok) {
			this.error = result.status === 0 ? SIGNUP_FAILED_COPY : result.error;
			return;
		}
		if (result.data?.emailVerification === 'pending') {
			this.passwordVerifyPending = true;
			this.sent = true;
			return;
		}
		await this.redirect(this.redirectTo);
	}

	/** Mail the sign-up link; success shows the same code screen. */
	async sendLink(): Promise<void> {
		if (this.waiting) return;
		this.waiting = true;
		this.error = '';
		const result = await this.api.requestSignupLink({
			email: this.email,
			firstName: this.firstName,
			lastName: this.lastName,
			redirectTo: this.redirectTo
		});
		this.waiting = false;
		if (!result.ok) {
			this.error = result.status === 0 ? SIGNUP_LINK_FAILED_COPY : result.error;
			return;
		}
		this.sent = true;
	}

	/** Redeem the code: the password door when a password signup is pending, else the link door. */
	async submitCode(): Promise<void> {
		if (this.waiting) return;
		this.waiting = true;
		this.error = '';
		const input = { code: this.code, email: this.email };
		const result = this.passwordVerifyPending
			? await this.api.verifySignupPasswordCode(input)
			: await this.api.submitSignupCode(input);
		this.waiting = false;
		if (!result.ok) {
			this.error = result.status === 0 ? CODE_FAILED_COPY : result.error || CODE_INVALID_COPY;
			return;
		}
		this.toasts.success(SIGNUP_VERIFIED_TOAST);
		await this.redirect(this.redirectTo);
	}

	/** Send the code again: a password signup is signed in and resends authenticated. */
	async resend(): Promise<void> {
		if (this.waiting) return;
		this.waiting = true;
		this.error = '';
		const result = this.passwordVerifyPending
			? await this.api.resendSignupVerification()
			: await this.api.requestSignupLink({
					email: this.email,
					firstName: this.firstName,
					lastName: this.lastName,
					redirectTo: this.redirectTo
				});
		this.waiting = false;
		if (!result.ok) {
			this.error = result.status === 0 ? SIGNUP_LINK_FAILED_COPY : result.error;
			return;
		}
		this.resent = true;
		this.cancelResent?.();
		this.cancelResent = this.schedule(() => {
			this.resent = false;
		}, AUTH_CONFIRMATION_MS);
	}

	dispose(): void {
		this.cancelResent?.();
		this.cancelResent = undefined;
	}
}
