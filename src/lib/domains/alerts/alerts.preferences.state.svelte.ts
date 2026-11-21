/**
 * alerts preference state: the account card's four notification switches.
 *
 * The card is not this module's markup — the account screen composes it at its
 * port — but the optimistic flip, the receipt and the revert are this module's
 * rules, so they live here with a fake-api test and no DOM.
 *
 * A failed save puts the switch back where the server still has it: the value
 * is captured before the flip, not re-derived with `!intent.value`, which is
 * only right while nothing else has moved.
 *
 * Doc: ./README.md#public-interface
 */
import type { AlertPreferenceId, AlertPreferences } from './alerts.contract';
import type { AlertsApi } from './alerts.api';
import {
	DEFAULT_ALERT_PREFERENCES,
	preferenceChangeLabel,
	saveOutcome
} from './alerts.preferences.rules';

/** The one call the card makes; `alertsApi` satisfies it. */
export type AlertPreferencesApi = Pick<AlertsApi, 'setPreference'>;

export class AlertPreferencesState {
	preferences = $state<AlertPreferences>({ ...DEFAULT_ALERT_PREFERENCES });
	/** The switch a save is in flight for; that row alone is disabled. */
	pendingId = $state<AlertPreferenceId | null>(null);
	/** The receipt or the did-not-save line; always rendered (a live region). */
	status = $state('');
	statusIsError = $state(false);

	private readonly api: AlertPreferencesApi;

	constructor(api: AlertPreferencesApi, initial: AlertPreferences = DEFAULT_ALERT_PREFERENCES) {
		this.api = api;
		this.preferences = { ...initial };
	}

	/** The loader's answer after a reload is truth again. */
	reset(initial: AlertPreferences): void {
		this.preferences = { ...initial };
	}

	valueOf(id: AlertPreferenceId): boolean {
		return this.preferences[id];
	}

	/** Flip one switch, save it, and keep the flip only if the server took it. */
	async toggle(id: AlertPreferenceId): Promise<void> {
		if (this.pendingId) return;
		const serverValue = this.preferences[id];
		const next = !serverValue;
		const intent = { id, value: next };
		this.pendingId = id;
		this.preferences = { ...this.preferences, [id]: next };
		this.status = preferenceChangeLabel(id, next);
		this.statusIsError = false;
		const result = await this.api.setPreference(id, next);
		this.pendingId = null;
		if (result.ok) return;
		this.preferences = { ...this.preferences, [id]: serverValue };
		this.status = saveOutcome(this.preferences, intent, false).status;
		this.statusIsError = true;
	}
}
