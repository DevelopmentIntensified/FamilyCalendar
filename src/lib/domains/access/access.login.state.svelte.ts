/**
 * `/login`'s state: the Password / Email Link switch, the two sign-in calls,
 * the code screen and its 3-second resend pill.
 *
 * The redirect and the scheduler are injected, so the class runs in node and
 * the screen keeps no logic. Its own refusal is the server's sentence; only a
 * request that never arrived falls back to legacy's network copy.
 *
 * Doc: ./README.md#public-interface
 */
import { systemScheduler, type Scheduler } from '$lib/kernel/time/scheduler';
import type { AuthApi } from './access.api';
import {
	AUTH_CONFIRMATION_MS,
	CODE_FAILED_COPY,
	CODE_INVALID_COPY,
	LOGIN_FAILED_COPY,
	LOGIN_LINK_FAILED_COPY,
	authErrorCopy,
	type AuthMethod
} from './access.auth.rules';

export type LoginStateOptions = {
	/** The already-sanitised post-auth target the load handed in. */
	readonly redirectTo: string;
	readonly isLoggedIn: boolean;
	/** `?merge=1`: the guest's form stays up even though it has a session. */
	readonly mergeMode: boolean;
	/** The page's navigation (SvelteKit `goto` with `invalidateAll`). */
	readonly redirect: (path: string) => void | Promise<void>;
	readonly schedule?: Scheduler;
};

export class LoginState {
	/** Which half of the switch is up. */
	method = $state<AuthMethod>('password');
	email = $state('');
	password = $state('');
	/** The refusal or `?error=` copy (the server's sentence, or legacy's network copy). */
	error = $state('');
	/** The green `?notice=` a redirect carried (#246). */
	notice = $state('');
	/** A request or redeem is in flight. */
	waiting = $state(false);
	/** The code screen is up: the link (or code) has been sent. */
	sent = $state(false);
	code = $state('');
	/** "Sent again ✓" is up for the confirmation beat. */
	resent = $state(false);

	readonly redirectTo: string;
	readonly isLoggedIn: boolean;
	readonly mergeMode: boolean;

	private readonly api: AuthApi;
	private readonly redirect: (path: string) => void | Promise<void>;
	private readonly schedule: Scheduler;
	private cancelResent: (() => void) | undefined;

	constructor(api: AuthApi, options: LoginStateOptions) {
		this.api = api;
		this.redirectTo = options.redirectTo;
		this.isLoggedIn = options.isLoggedIn;
		this.mergeMode = options.mergeMode;
		this.redirect = options.redirect;
		this.schedule = options.schedule ?? systemScheduler;
	}

	setMethod(method: AuthMethod): void {
		this.method = method;
	}

	/** Show the copy a redirect carried (`?error=`, `?notice=`) before the URL is cleaned. */
	applyUrlMessages(error: string | null, notice: string | null): void {
		if (error) this.error = authErrorCopy(error);
		if (notice) this.notice = notice;
	}

	/** Password sign-in; the route that follows owns the landing. */
	async signInWithPassword(): Promise<void> {
		if (this.waiting) return;
		this.waiting = true;
		this.error = '';
		const result = await this.api.signInWithPassword({
			email: this.email,
			password: this.password
		});
		this.waiting = false;
		if (!result.ok) {
			this.error = result.status === 0 ? LOGIN_FAILED_COPY : result.error;
			return;
		}
		await this.redirect(this.redirectTo);
	}

	/** Mail the sign-in link; success moves to the code screen without explaining suppression. */
	async sendLink(): Promise<void> {
		if (this.waiting) return;
		this.waiting = true;
		this.error = '';
		const result = await this.api.requestLoginLink({
			email: this.email,
			redirectTo: this.redirectTo
		});
		this.waiting = false;
		if (!result.ok) {
			this.error = result.status === 0 ? LOGIN_LINK_FAILED_COPY : result.error;
			return;
		}
		this.sent = true;
	}

	/** Redeem the code; a wrong or expired code is the server's generic sentence. */
	async submitCode(): Promise<void> {
		if (this.waiting) return;
		this.waiting = true;
		this.error = '';
		const result = await this.api.submitLoginCode({ code: this.code, email: this.email });
		this.waiting = false;
		if (!result.ok) {
			this.error =
				result.status === 0 ? CODE_FAILED_COPY : result.error || CODE_INVALID_COPY;
			return;
		}
		await this.redirect(this.redirectTo);
	}

	/** Send the link again and show "Sent again ✓" for the confirmation beat. */
	async resend(): Promise<void> {
		if (this.waiting) return;
		this.waiting = true;
		this.error = '';
		const result = await this.api.requestLoginLink({
			email: this.email,
			redirectTo: this.redirectTo
		});
		this.waiting = false;
		if (!result.ok) {
			this.error = result.status === 0 ? LOGIN_LINK_FAILED_COPY : result.error;
			return;
		}
		this.resent = true;
		this.cancelResent?.();
		this.cancelResent = this.schedule(() => {
			this.resent = false;
		}, AUTH_CONFIRMATION_MS);
	}

	/** The screen's unmount: no timer survives the page. */
	dispose(): void {
		this.cancelResent?.();
		this.cancelResent = undefined;
	}
}
