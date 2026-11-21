/**
 * alerts preference services: the four Notifications switches, stored in
 * `activeSubscriptions.notificationMethods`.
 *
 * The row is the user's newest unexpired one (this module's repo query, a
 * declared read of billing's table); the parse, the billing-half copy and the
 * receipt wording are `alerts.preferences.rules.ts`. A read writes nothing and
 * a read failure answers the approved defaults (legacy
 * `loadNotificationPreferences`), so the GET has no 500 path.
 *
 * A save that cannot write is reported, not thrown: the legacy route answered
 * `500 {error: "<Label> alerts are on|off. This did not save."}` and the card
 * needs that sentence to put the switch back.
 *
 * Doc: ./README.md#invariants
 */
import type { Actor } from '$lib/kernel/ctx/actor';
import type { Ctx } from '$lib/kernel/ctx/ctx.server';
import type { AlertPreferenceId, AlertPreferences } from './alerts.contract';
import {
	DEFAULT_ALERT_PREFERENCES,
	preferenceChangeLabel,
	preferencesFrom,
	withPreference
} from './alerts.preferences.rules';
import {
	findAlertPreferencesRow,
	insertAlertPreferencesRow,
	updateAlertPreferencesRow
} from './alerts.repo.server';

/** What a save did: the receipt the card shows, or the failure copy that reverts the switch. */
export type AlertPreferenceSave =
	| { readonly ok: true; readonly message: string }
	| { readonly ok: false; readonly message: string };

/**
 * The four switches as they should render. An account with no row, a partial
 * bag or a malformed one reads as the approved defaults and nothing is written:
 * the first toggle, not the first page view, persists a preference.
 */
export async function getAlertPreferences(ctx: Ctx, actor: Actor): Promise<AlertPreferences> {
	try {
		const row = await findAlertPreferencesRow(ctx.db, actor.id, ctx.clock.now());
		return preferencesFrom(row?.notificationMethods);
	} catch (error) {
		ctx.log.error('alert_preferences_read_failed', {
			message: error instanceof Error ? error.message : String(error)
		});
		return { ...DEFAULT_ALERT_PREFERENCES };
	}
}

/**
 * Set one switch, leaving the other three and the billing `{email, sms}` half
 * alone. With no unexpired row, the first toggle inserts the tierless,
 * far-future one the rules build (`subscriptionTypeId: null`, `email`/`sms`
 * false) so the row stays out of every plan read and claims no channel
 * consent. Returns the receipt, or the "did not save" copy on a write failure.
 */
export async function setAlertPreference(
	ctx: Ctx,
	actor: Actor,
	input: { readonly id: AlertPreferenceId; readonly value: boolean }
): Promise<AlertPreferenceSave> {
	const now = ctx.clock.now();
	const change = preferenceChangeLabel(input.id, input.value);
	try {
		const row = await findAlertPreferencesRow(ctx.db, actor.id, now);
		if (row) {
			await updateAlertPreferencesRow(
				ctx.db,
				row.id,
				withPreference(row.notificationMethods, input.id, input.value),
				now
			);
		} else {
			await insertAlertPreferencesRow(
				ctx.db,
				actor.id,
				withPreference(undefined, input.id, input.value),
				now
			);
		}
		return { ok: true, message: `${change} Saved.` };
	} catch (error) {
		ctx.log.error('alert_preference_save_failed', {
			message: error instanceof Error ? error.message : String(error)
		});
		return { ok: false, message: `${change} This did not save.` };
	}
}
