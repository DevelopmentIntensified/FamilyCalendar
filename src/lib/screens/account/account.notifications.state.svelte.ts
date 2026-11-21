/**
 * The Notifications card's client state: the optimistic flip, its receipt, and
 * the revert to the server's value when the save refuses.
 *
 * Split from `account.state.svelte.ts` so the alerts vocabulary it reads
 * (`saveOutcome`, the defaults) loads with the section's lazy chunk instead of
 * the /account first paint (ADR 0010: initial JS may only shrink).
 *
 * The server value is captured before the flip; the revert never re-derives it
 * with `!intent.value`, which is only right while nothing else has moved.
 *
 * No `$effect`: every side effect is a method, so this runs in node with no DOM.
 *
 * Doc: ./README.md#invariants
 */
import type { AlertPreferenceId, AlertPreferences } from '$lib/domains/alerts';
import { DEFAULT_ALERT_PREFERENCES, saveOutcome } from '$lib/domains/alerts';

/** What the card shows once a switch's save answers: the switches, the line, its tone. */
export type AccountPreferenceOutcome = {
	readonly preferences: AlertPreferences;
	readonly status: string;
	readonly isError: boolean;
};

export class AccountNotificationsState {
	preferences = $state<AlertPreferences>({ ...DEFAULT_ALERT_PREFERENCES });
	/** The switch a save is in flight for; that row alone is disabled. */
	pendingId = $state<AlertPreferenceId | null>(null);
	/** The receipt or the did-not-save line; always rendered (a live region). */
	status = $state('');
	statusIsError = $state(false);

	/** The server's answer as this class last saw it. */
	private saved: AlertPreferences;
	/** The flip the in-flight save is asking for. */
	private intent: { readonly id: AlertPreferenceId; readonly value: boolean } | null = null;

	constructor(initial: AlertPreferences) {
		this.saved = { ...initial };
		this.preferences = { ...initial };
	}

	/** The loader's answer after a reload is truth again. */
	reset(initial: AlertPreferences): void {
		this.saved = { ...initial };
		this.preferences = { ...initial };
	}

	valueOf(id: AlertPreferenceId): boolean {
		return this.preferences[id];
	}

	/** The value this row's next click saves — the in-flight one while a save runs. */
	nextValue(id: AlertPreferenceId, on: boolean): boolean {
		if (this.intent?.id === id) return this.intent.value;
		return !on;
	}

	/** Ack first, ask later: the switch and the receipt both move now. */
	press(id: AlertPreferenceId): void {
		const value = !this.preferences[id];
		this.intent = { id, value };
		this.pendingId = id;
		const outcome = saveOutcome(this.saved, this.intent, true);
		this.preferences = outcome.preferences;
		this.status = outcome.status;
		this.statusIsError = false;
	}

	/** The save answered: keep the flip on success, put the switch back on failure. */
	settle(ok: boolean): void {
		const intent = this.intent;
		this.intent = null;
		this.pendingId = null;
		if (!intent) return;
		const outcome = saveOutcome(this.saved, intent, ok);
		this.saved = outcome.preferences;
		this.preferences = outcome.preferences;
		this.status = outcome.status;
		this.statusIsError = outcome.isError;
	}
}
