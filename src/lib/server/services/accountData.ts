/**
 * Account page data + mutations (#292 L0: G3, G14). The /account loader and
 * form actions were the only home of this logic; it lives here now so the
 * page actions and the `/api/me/*` JSON endpoints run ONE implementation.
 *
 * Mutations return a result union instead of a SvelteKit `fail()`: the page
 * maps it onto `fail(status, { success:false, message })`, the API onto
 * `json({ error: message }, { status })`.
 */
import { updateUser } from '$lib/server/db/actions/users';
import { getUserSettings, updateUserSettings } from '$lib/server/db/actions/userSettings';
import { invalidateSession, invalidateUserSessions } from '$lib/server/auth';
import { db } from '$lib/server/db';
import { authSession, type UserSettings } from '$lib/server/db/schema';
import { eq } from 'drizzle-orm';
import { getAccessibleCalendarIds } from '$lib/server/db/actions/calendarScope';
import {
	getSubscriptionStatus,
	getUserSubscriptionLimits,
	getAiUsageThisMonth,
	getDefaultLimits
} from '$lib/server/services/subscriptionService';
import { getPlanPricing } from '$lib/server/services/checkoutService';
import { recordAdConsentChange, getAdConsentRecords } from '$lib/server/services/adConsentService';
import { dashboardModulesSavedMessage } from '$lib/domains/dashboardModules';
import { createApiToken, revokeToken } from '$lib/server/db/actions/apiTokens';
import {
	getNotificationPreferences,
	setNotificationPreference
} from '$lib/server/db/actions/notificationMethods';
import {
	DEFAULT_NOTIFICATION_PREFERENCES,
	notificationPreferenceChangeLabel,
	type NotificationPreferenceId
} from '$lib/components/account/accountNotifications';

export type AccountResult<T extends object = object> =
	| ({ ok: true; message: string } & T)
	| { ok: false; status: number; message: string; guestNeedsClaim?: boolean };

const bad = (status: number, message: string) => ({ ok: false as const, status, message });

/** What /account shows when the user has no settings row yet. */
export const ACCOUNT_SETTINGS_DEFAULTS = {
	weekStart: 'sunday',
	timeZone: 'UTC',
	color: '#3b82f6',
	defaultView: 'dayView',
	defaultCalendarId: null,
	syncEventsToFamilyCalendar: false,
	// Ads are opt-in (#088): no settings row means no ads.
	showAdsAsEvents: false
};

/** A stored settings row as clients see it: everything but `verse_translation`. */
type StoredSettingsView = Omit<UserSettings, 'verseTranslation'>;
/**
 * The no-row view: only the defaults /account shows; every other stored field
 * reads as absent, so callers can probe it (`?.hiddenDashboardModules`) on
 * either branch without a type guard.
 */
type DefaultSettingsView = typeof ACCOUNT_SETTINGS_DEFAULTS & {
	[K in Exclude<keyof StoredSettingsView, keyof typeof ACCOUNT_SETTINGS_DEFAULTS>]?: undefined;
};
export type AccountSettingsView = StoredSettingsView | DefaultSettingsView;

/**
 * The settings the web and `/api/me/settings` expose. `verse_translation` is
 * a stored column no reader has since the verse feature left (owner,
 * 2026-11-12, Q-031/Q-032): strip it here so it never reaches a client. The
 * column itself stays — no DDL.
 */
export function accountSettingsView(row: UserSettings | null | undefined): AccountSettingsView {
	if (!row) return ACCOUNT_SETTINGS_DEFAULTS;
	const { verseTranslation: _dropped, ...settings } = row;
	void _dropped;
	return settings;
}

/**
 * #088: the trail read — the privacy promise ("prove I consented") needs to
 * be visible to the user it belongs to. Display only; degrades to [].
 */
export async function loadConsentHistory(userId: string) {
	return await getAdConsentRecords(userId)
		.then((rows) =>
			rows.map((row) => ({ decision: row.decision, recordedAt: row.recordedAt.toISOString() }))
		)
		.catch((error) => {
			console.error('Failed to load ad consent history:', error);
			return [];
		});
}

/** G3 GET: the settings card's data. */
export async function loadAccountSettings(userId: string) {
	const [userSettings, consentHistory] = await Promise.all([
		getUserSettings(userId),
		loadConsentHistory(userId)
	]);
	return {
		settings: accountSettingsView(userSettings),
		consentHistory
	};
}

/**
 * Subscription data is display-only — a failure degrades to a "no
 * subscription" state, never a dead page.
 */
export async function loadSubscriptionSummary(userId: string) {
	let subscription: Awaited<ReturnType<typeof getSubscriptionStatus>> = {
		tier: null,
		subscription: null
	};
	let planLimits: Awaited<ReturnType<typeof getUserSubscriptionLimits>> = getDefaultLimits();
	let aiUsage: Awaited<ReturnType<typeof getAiUsageThisMonth>> = {
		used: 0,
		limit: planLimits.aiEventCreationsPerMonth,
		remaining: planLimits.aiEventCreationsPerMonth
	};
	try {
		[subscription, planLimits, aiUsage] = await Promise.all([
			getSubscriptionStatus(userId),
			getUserSubscriptionLimits(userId),
			getAiUsageThisMonth(userId)
		]);
	} catch (error) {
		console.error('Failed to load subscription data:', error);
	}
	return { subscription, planLimits, aiUsage, planPricing: getPlanPricing('monthly') };
}

/**
 * A never-touched account sees the approved defaults, and this read writes
 * nothing: the defaults are persisted only by a first toggle.
 */
export async function loadNotificationPreferences(userId: string) {
	return await getNotificationPreferences(userId).catch((error) => {
		console.error('Failed to load notification preferences:', error);
		return { ...DEFAULT_NOTIFICATION_PREFERENCES };
	});
}

/** The full set the calendar-settings save writes. */
export type CalendarSettingsInput = {
	weekStart: string;
	timeZone: string;
	color: string;
	defaultView: string;
	defaultCalendarId: string | null;
	syncEventsToFamilyCalendar: boolean;
	autoParseEventDetails: boolean;
	/**
	 * Verse visibility, persisted for the Android app and the `verse` Dashboard
	 * Module. The /account form has no control for it any more (owner,
	 * 2026-11-12, Q-031/Q-032): only `PATCH /api/me/settings` writes it, so a
	 * form save leaves the stored value alone.
	 */
	showDailyVerse?: boolean;
	/** The ad gate (#088) — the one field that decides whether ads render. */
	showAdsAsEvents: boolean;
};

export async function saveCalendarSettings(
	userId: string,
	input: CalendarSettingsInput,
	opts: { checkDefaultCalendar?: boolean } = {}
): Promise<AccountResult> {
	const values = input;
	// 167: the create-event POST re-validates its target calendar the same
	// way (api/events/+server.ts) — a saved default must point at a calendar
	// this user can actually see, or it is not saved at all.
	if (values.defaultCalendarId && opts.checkDefaultCalendar !== false) {
		const accessibleCalIds = await getAccessibleCalendarIds(userId);
		if (!accessibleCalIds.includes(values.defaultCalendarId)) {
			return bad(400, 'Selected default calendar is not available');
		}
	}

	try {
		const existingSettings = await getUserSettings(userId);
		// The ad value as it stands BEFORE this save. Consent records are
		// written on a transition, so this is what decides whether the save
		// is an event at all (#088).
		const previousAdsConsent = existingSettings?.showAdsAsEvents;

		// 105: `hiddenDashboardModules` is NOT written here. The switches
		// live in their own section and their own action.
		if (!existingSettings) {
			const { createUserSettings } = await import('$lib/server/db/actions/userSettings');
			await createUserSettings({ userId, ...values });
		} else {
			await updateUserSettings(userId, values);
		}

		// Evidence beside the setting, not a second gate (#088). It must NOT
		// be able to fail the save (the settings are already written), so a
		// failure is logged loudly instead of reported as a failed save.
		try {
			await recordAdConsentChange(userId, previousAdsConsent, values.showAdsAsEvents);
		} catch (consentError) {
			console.error(
				'Consent record NOT written; the ad setting itself WAS saved. ' +
					'Run the adConsentRecords DDL in ' +
					'docs/issues/088-ad-consent-two-sources-of-truth.md. Cause:',
				consentError
			);
		}

		return { ok: true, message: 'Calendar settings saved successfully' };
	} catch (error) {
		console.error('Failed to save calendar settings:', error);
		return bad(500, 'Failed to save calendar settings');
	}
}

/** 105: the Dashboard Module switches are their own save. */
export async function saveDashboardModules(
	userId: string,
	hiddenDashboardModules: string[]
): Promise<AccountResult> {
	try {
		const existingSettings = await getUserSettings(userId);
		if (!existingSettings) {
			const { createUserSettings } = await import('$lib/server/db/actions/userSettings');
			await createUserSettings({
				userId,
				weekStart: 'sunday',
				timeZone: 'UTC',
				color: '#3b82f6',
				defaultView: 'dayView',
				defaultCalendarId: null,
				syncEventsToFamilyCalendar: false,
				showAdsAsEvents: false,
				hiddenDashboardModules
			});
		} else {
			await updateUserSettings(userId, { hiddenDashboardModules });
		}
		const hiddenCount = hiddenDashboardModules.length;
		return {
			ok: true,
			message: dashboardModulesSavedMessage(hiddenCount)
		};
	} catch (error) {
		console.error('Failed to save dashboard modules:', error);
		return bad(500, 'Failed to save dashboard modules');
	}
}

/** The Notifications card's own save: one switch, one receipt. */
export async function saveNotificationPreference(
	userId: string,
	preference: NotificationPreferenceId,
	value: boolean
): Promise<AccountResult> {
	try {
		await setNotificationPreference(userId, preference, value);
		return { ok: true, message: `${notificationPreferenceChangeLabel(preference, value)} Saved.` };
	} catch (error) {
		console.error('Failed to save notification preference:', error);
		return bad(500, `${notificationPreferenceChangeLabel(preference, value)} This did not save.`);
	}
}

export async function updateProfile(
	userId: string,
	firstName: string,
	lastName: string
): Promise<AccountResult> {
	if (!firstName || !lastName) {
		return bad(400, 'First name and last name are required');
	}
	try {
		await updateUser(userId, { firstName, lastName });
		return { ok: true, message: 'Profile updated successfully' };
	} catch (error) {
		console.error('Failed to update profile:', error);
		return bad(500, 'Failed to update profile');
	}
}

/**
 * `/account?/updateEmail` — access owns this flow now (HMAC-keyed code row the
 * verify page can redeem, the legacy bodies). Re-exported here because the
 * account route is still legacy code and may not import module code (R8);
 * "legacy may import v2" is the intended direction.
 */
export { changeEmailAction } from '$lib/domains/access/index.server';

/**
 * Signs out every web session except `keepSessionId` (the caller's own
 * cookie session; null for a Bearer caller, which has none). API tokens are
 * not sessions and are untouched (revoke them one by one).
 */
export async function revokeOtherSessions(
	userId: string,
	keepSessionId: string | null | undefined
): Promise<AccountResult<{ revoked: number }>> {
	try {
		const allSessions = await db.select().from(authSession).where(eq(authSession.userId, userId));
		let revoked = 0;
		for (const sessionRow of allSessions) {
			if (sessionRow.id !== keepSessionId) {
				await invalidateSession(sessionRow.id);
				revoked += 1;
			}
		}
		return { ok: true, message: 'Logged out from all other devices', revoked };
	} catch (error) {
		console.error('Failed to logout from all devices:', error);
		return bad(500, 'Failed to logout from all devices');
	}
}

/** Mints a named personal API token; the plaintext is shown once. */
export async function mintNamedApiToken(
	userId: string,
	rawName: string
): Promise<
	AccountResult<{ token: string; record: { id: string; name: string; createdAt: Date } }>
> {
	const name = rawName.trim();
	if (!name) return bad(400, 'Token name is required');
	try {
		const { row, token } = await createApiToken(userId, name.slice(0, 60));
		return {
			ok: true,
			message: `Token '${row.name}' created — copy it now, it won't be shown again.`,
			token,
			record: { id: row.id, name: row.name, createdAt: row.createdAt }
		};
	} catch (error) {
		console.error('Failed to create API token:', error);
		return bad(500, 'Failed to create token');
	}
}

/** Revokes one of the user's tokens (scoped: another user's id is a no-op). */
export async function revokeApiToken(userId: string, tokenId: string): Promise<AccountResult> {
	if (!tokenId) return bad(400, 'Token id is required');
	try {
		await revokeToken(userId, tokenId);
		return { ok: true, message: 'Token revoked' };
	} catch (error) {
		console.error('Failed to revoke API token:', error);
		return bad(500, 'Failed to revoke token');
	}
}

/** Deletes the account after the typed confirmation (= the user id). */
export async function deleteAccount(
	userId: string,
	confirmation: string,
	currentSessionId: string | null | undefined
): Promise<AccountResult> {
	if (confirmation !== userId) {
		return bad(400, 'Confirmation does not match');
	}
	if (currentSessionId) await invalidateSession(currentSessionId);
	await invalidateUserSessions(userId);
	const { deleteUser } = await import('$lib/server/db/actions/users');
	await deleteUser(userId);
	return { ok: true, message: 'Account deleted' };
}
