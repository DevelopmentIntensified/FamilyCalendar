/**
 * The two password-recovery screens' state: `/forgot-password` asks for the
 * address and settles on the no-enumeration sentence; `/forgot-password/reset`
 * refuses in legacy's order (missing token, mismatch, length), then shows
 * "Password Reset!" and leaves for `/login` after the confirmation beat.
 *
 * Doc: ./README.md#public-interface
 */
import { systemScheduler, type Scheduler } from '$lib/kernel/time/scheduler';
import type { AuthApi } from './access.api';
import {
	AUTH_CONFIRMATION_MS,
	FORGOT_FAILED_COPY,
	RESET_FAILED_COPY,
	RESET_MISSING_TOKEN_COPY,
	RESET_SUCCESS_PATH,
	resetPasswordRefusal
} from './access.auth.rules';

export class ForgotPasswordState {
	email = $state('');
	error = $state('');
	waiting = $state(false);
	/** The confirmation panel is up. */
	sent = $state(false);

	private readonly api: AuthApi;

	constructor(api: AuthApi) {
		this.api = api;
	}

	async submit(): Promise<void> {
		if (this.waiting) return;
		this.waiting = true;
		this.error = '';
		const result = await this.api.requestPasswordReset({ email: this.email });
		this.waiting = false;
		if (!result.ok) {
			this.error = result.status === 0 ? FORGOT_FAILED_COPY : result.error;
			return;
		}
		this.sent = true;
	}
}

export class ResetPasswordState {
	password = $state('');
	confirmPassword = $state('');
	error = $state('');
	waiting = $state(false);
	/** The password was replaced; the redirect is pending. */
	success = $state(false);

	readonly token: string;

	private readonly api: AuthApi;
	private readonly redirect: (path: string) => void | Promise<void>;
	private readonly schedule: Scheduler;
	private cancelRedirect: (() => void) | undefined;

	constructor(
		api: AuthApi,
		token: string,
		redirect: (path: string) => void | Promise<void>,
		schedule: Scheduler = systemScheduler
	) {
		this.api = api;
		this.token = token;
		this.redirect = redirect;
		this.schedule = schedule;
		// Legacy showed the missing-token sentence on mount, before any submit.
		if (!token) this.error = RESET_MISSING_TOKEN_COPY;
	}

	async submit(): Promise<void> {
		if (this.waiting) return;
		const refusal = resetPasswordRefusal(this.token, this.password, this.confirmPassword);
		if (refusal) {
			this.error = refusal;
			return;
		}
		this.waiting = true;
		this.error = '';
		const result = await this.api.resetPassword({ token: this.token, password: this.password });
		this.waiting = false;
		if (!result.ok) {
			this.error = result.status === 0 ? RESET_FAILED_COPY : result.error;
			return;
		}
		this.success = true;
		this.cancelRedirect = this.schedule(() => {
			void this.redirect(RESET_SUCCESS_PATH);
		}, AUTH_CONFIRMATION_MS);
	}

	dispose(): void {
		this.cancelRedirect?.();
		this.cancelRedirect = undefined;
	}
}
