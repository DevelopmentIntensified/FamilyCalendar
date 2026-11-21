/**
 * shell verify state: the unverified-email notice's inline form. The notice is
 * self-sufficient (`(calendar)/calendar/+layout.svelte:65-136`) because a user
 * who navigated away has nowhere else to enter the code.
 *
 * Copy is the legacy copy: a failed submit shows the server's sentence or
 * `Invalid code`; a failed resend shows its sentence or `Couldn't resend the
 * code — try again.`; a request that never left shows the connection sentence.
 * "Sent again ✓" clears after 3 s.
 *
 * `schedule` and `onVerified` are constructor inputs (R5): the frame passes the
 * kernel scheduler and its `invalidate('shell:scope')`.
 *
 * Doc: ./README.md#invariants
 */
import type { Scheduler } from '$lib/kernel/time/scheduler';
import type { ShellVerifyPort } from './shell.contract';

/** The legacy receipt's lifetime (`+layout.svelte:117`). */
const RESENT_RECEIPT_MS = 3000;

const SUBMIT_FALLBACK = 'Invalid code';
const RESEND_FALLBACK = "Couldn't resend the code — try again.";
const SUBMIT_OFFLINE = 'Verification failed — check your connection and try again.';
const RESEND_OFFLINE = "Couldn't resend the code — check your connection.";

export type ShellVerifyDeps = {
	readonly schedule: Scheduler;
	/** Re-reads the group scope once the email is confirmed (the legacy `invalidateAll`). */
	readonly onVerified: () => void;
};

export class ShellVerifyState {
	code = $state('');
	busy = $state(false);
	error = $state('');
	resent = $state(false);

	private readonly port: ShellVerifyPort;
	private readonly deps: ShellVerifyDeps;
	private cancelReceipt: (() => void) | null = null;

	constructor(port: ShellVerifyPort, deps: ShellVerifyDeps) {
		this.port = port;
		this.deps = deps;
	}

	/** The submit button is disabled while blank or busy (legacy `disabled`). */
	get canSubmit(): boolean {
		return !this.busy && this.code.trim().length > 0;
	}

	/** `POST /signup/password/verify` with the trimmed code. */
	async submit(): Promise<void> {
		const code = this.code.trim();
		if (!code || this.busy) return;
		this.busy = true;
		this.error = '';
		try {
			const result = await this.port.submitCode(code);
			if (result.ok) {
				this.deps.onVerified();
			} else {
				this.error = result.message || SUBMIT_FALLBACK;
			}
		} catch {
			this.error = SUBMIT_OFFLINE;
		} finally {
			this.busy = false;
		}
	}

	/** `POST /signup/password/resend`, then the 3 s "Sent again ✓" receipt. */
	async resend(): Promise<void> {
		if (this.busy) return;
		this.busy = true;
		this.error = '';
		try {
			const result = await this.port.resendCode();
			if (result.ok) {
				this.resent = true;
				this.cancelReceipt?.();
				this.cancelReceipt = this.deps.schedule(() => {
					this.resent = false;
					this.cancelReceipt = null;
				}, RESENT_RECEIPT_MS);
			} else {
				this.error = result.message || RESEND_FALLBACK;
			}
		} catch {
			this.error = RESEND_OFFLINE;
		} finally {
			this.busy = false;
		}
	}
}
