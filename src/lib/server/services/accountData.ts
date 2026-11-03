/**
 * Account page data + mutations (#292 L0: G3, G14). The /account loader and
 * form actions were the only home of this logic; it lives here now so the
 * page actions and the `/api/me/*` JSON endpoints run ONE implementation.
 *
 * Mutations return a result union instead of a SvelteKit `fail()`: the page
 * maps it onto `fail(status, { success:false, message })`, the API onto
 * `json({ error: message }, { status })`.
 */
import { getUser, updateUser } from '$lib/server/db/actions/users';
import { getUserSettings, updateUserSettings } from '$lib/server/db/actions/userSettings';
import { invalidateSession, invalidateUserSessions } from '$lib/server/auth';
import { db } from '$lib/server/db';
import { authSession } from '$lib/server/db/schema';
import { eq } from 'drizzle-orm';
import { getAccessibleCalendarIds } from '$lib/server/db/actions/calendarScope';
import {
	getSubscriptionStatus,
	getUserSubscriptionLimits,
	getAiUsageThisMonth,
	getDefaultLimits
} from '$lib/server/services/subscriptionService';
import { getPlanPricing } from '$lib/server/services/checkoutService';
import { sendEmail } from '$lib/utils/sendEmail';
import { createJWT } from 'oslo/jwt';
import { TimeSpan } from 'oslo';
import { generateRandomString, type RandomReader } from '@oslojs/crypto/random';
import { clientKey, rateLimit } from '$lib/server/utils/rateLimit';
import { createCode, deleteCodesByEmail } from '$lib/server/db/actions/codes';
import { TRANSLATIONS } from '$lib/server/services/verseService';
import { recordAdConsentChange, getAdConsentRecords } from '$lib/server/services/adConsentService';
import { DASHBOARD_MODULES } from '$lib/dashboardModules';
import { isRegisteredAccount } from '$lib/utils/anonymous';
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
	showAdsAsEvents: false,
	verseTranslation: 'esv'
};

export function verseTranslationOptions() {
	return Object.values(TRANSLATIONS).map(({ id, label, attribution }) => ({
		id,
		label,
		attribution
	}));
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
		settings: userSettings ?? ACCOUNT_SETTINGS_DEFAULTS,
		verseTranslations: verseTranslationOptions(),
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
	showDailyVerse: boolean;
	/** The ad gate (#088) — the one field that decides whether ads render. */
	showAdsAsEvents: boolean;
	/** Unknown ids are stored as 'esv' (the form's rule). */
	verseTranslation: string;
};

export async function saveCalendarSettings(
	userId: string,
	input: CalendarSettingsInput,
	opts: { checkDefaultCalendar?: boolean } = {}
): Promise<AccountResult> {
	const verseTranslation = input.verseTranslation in TRANSLATIONS ? input.verseTranslation : 'esv';
	const values = { ...input, verseTranslation };
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
				verseTranslation: 'esv',
				hiddenDashboardModules
			});
		} else {
			await updateUserSettings(userId, { hiddenDashboardModules });
		}
		const hiddenCount = hiddenDashboardModules.length;
		return {
			ok: true,
			message: hiddenCount
				? `Dashboard modules saved — ${DASHBOARD_MODULES.length - hiddenCount} of ${DASHBOARD_MODULES.length} cards on.`
				: `Dashboard modules saved — all ${DASHBOARD_MODULES.length} cards on.`
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
 * Testable seam for the hardened email-change request (Oct lane): keeps the
 * 3/15m throttle + code-consumer binding behaviour verbatim while letting
 * route tests inject fakes.
 */
export type UpdateEmailDeps = {
	getUser: typeof getUser;
	sendEmail: typeof sendEmail;
	createJwt: typeof createJWT;
	baseUrl: string;
	fromEmail: string;
	emailSecret: Uint8Array;
	deleteCodesByEmail: typeof deleteCodesByEmail;
	createCode: typeof createCode;
};

export const defaultUpdateEmailDeps = (
	baseUrl: string,
	fromEmail: string,
	emailSecret: string
): UpdateEmailDeps => ({
	getUser,
	sendEmail,
	createJwt: createJWT,
	baseUrl,
	fromEmail,
	emailSecret: new TextEncoder().encode(emailSecret),
	deleteCodesByEmail,
	createCode
});

/**
 * Starts an email change: mails a code + link to the NEW address and binds
 * the code to the current one. `readEmail` is called only after the
 * throttle and the guest check pass (the page reads its form there).
 */
export async function requestEmailChange(
	request: Request,
	userId: string,
	readEmail: () => Promise<string>,
	deps: UpdateEmailDeps
): Promise<AccountResult> {
	// Throttle email bombing: 3 sends per 15min per user+IP (forgot-password pattern).
	if (!rateLimit(clientKey(request, `email-change:${userId}`), 3, 15 * 60 * 1000)) {
		return bad(429, 'Too many attempts. Try again shortly.');
	}
	const currentUser = await deps.getUser(userId);

	// Anonymous Accounts have no email yet — they claim their first email via
	// the magic-link save flow, not the change-email flow (#242).
	if (!isRegisteredAccount(currentUser)) {
		return {
			...bad(
				400,
				"You're using a guest calendar — add your first email from the Save-your-calendar banner instead."
			),
			guestNeedsClaim: true
		};
	}
	const email = await readEmail();

	if (!email || !email.includes('@')) {
		return bad(400, 'Valid email is required');
	}
	if (email === currentUser?.email) {
		return bad(400, 'New email must be different from current email');
	}

	try {
		const random: RandomReader = {
			read(bytes) {
				crypto.getRandomValues(bytes);
			}
		};
		const code = generateRandomString(random, '0123456789', 8);
		const token = await deps.createJwt(
			'HS256',
			deps.emailSecret,
			{ code, pendingEmail: email },
			{
				headers: { alg: 'HS256', typ: 'JWT' },
				expiresIn: new TimeSpan(15, 'm')
			}
		);

		const verifyUrl = new URL(deps.baseUrl);
		verifyUrl.pathname = '/account/verify-email';
		verifyUrl.searchParams.set('token', token);

		await deps.sendEmail({
			to: email,
			from: deps.fromEmail,
			subject: 'Family Planz Email Change Verification',
			html: `<h1>Your verification code is: ${code}</h1>
<p>Or click this link to verify: <a href="${verifyUrl.toString()}">Verify Email</a></p>`
		});

		await deps.deleteCodesByEmail(currentUser!.email);
		await deps.createCode({
			code,
			expiresAt: new Date(Date.now() + 60 * 1000 * 15),
			email: currentUser!.email,
			firstName: currentUser!.firstName,
			lastName: currentUser!.lastName,
			type: 'email_change',
			pendingEmail: email
		});

		return { ok: true, message: 'Verification email sent. Please check your inbox.' };
	} catch (error) {
		console.error('Failed to update email:', error);
		return bad(500, 'Failed to send verification email');
	}
}

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
