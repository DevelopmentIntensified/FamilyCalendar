import { getUser } from '$lib/server/db/actions/users';
import { getUserSettings } from '$lib/server/db/actions/userSettings';
import { db } from '$lib/server/db';
import { calendars } from '$lib/server/db/schema';
import { eq, inArray } from 'drizzle-orm';
import { getUserFamilyMemberships } from '$lib/server/db/actions/families';
import { fail, redirect } from '@sveltejs/kit';
import { requireUserAction } from '$lib/server/utils/requireUser';
import type { Actions, PageServerLoad } from './$types';
import { NOREPLYEMAIL, EMAILSECRET } from '$env/static/private';
import { getUrl } from '$lib/utils/getUrl';
import { hiddenModulesFromForm } from '$lib/components/account/accountDashboardModules';
import { familyCalendarEntries } from '$lib/components/account/accountCalendars';
import { listTokensForUser } from '$lib/server/db/actions/apiTokens';
import { isNotificationPreferenceId } from '$lib/components/account/accountNotifications';
import {
	ACCOUNT_SETTINGS_DEFAULTS,
	defaultUpdateEmailDeps,
	deleteAccount,
	loadConsentHistory,
	loadNotificationPreferences,
	loadSubscriptionSummary,
	mintNamedApiToken,
	requestEmailChange,
	revokeApiToken,
	revokeOtherSessions,
	saveCalendarSettings,
	saveDashboardModules,
	saveNotificationPreference,
	updateProfile,
	verseTranslationOptions,
	type AccountResult,
	type UpdateEmailDeps
} from '$lib/server/services/accountData';

// The load + action bodies live in accountData (#292 L0) so the /api/me/*
// JSON endpoints run the same code; this file parses forms and maps results.
export type { UpdateEmailDeps };

const updateEmailDeps: UpdateEmailDeps = defaultUpdateEmailDeps(
	getUrl(),
	NOREPLYEMAIL,
	EMAILSECRET
);

/** A service result as this page's form-action contract. */
function toActionResult(result: AccountResult) {
	if (!result.ok) {
		return fail(result.status, {
			success: false,
			message: result.message,
			...(result.guestNeedsClaim ? { guestNeedsClaim: true } : {})
		});
	}
	return { success: true, message: result.message };
}

export const load: PageServerLoad = async (event) => {
	if (!event.locals.user) {
		return redirect(302, '/login');
	}
	const userId = event.locals.user.id;
	const user = await getUser(userId);
	const userSettings = await getUserSettings(userId);

	const userCals = await db.select().from(calendars).where(eq(calendars.ownerId, userId));
	const calendarList: { id: string; name: string; color?: string }[] = userCals.map((c) => ({
		id: c.id,
		name: 'Personal Calendar',
		color: userSettings?.color || undefined
	}));

	// 105: the page's own "Your families" section, and the family calendars it
	// lists, both read the multi-family helper.
	const memberships = await getUserFamilyMemberships(userId).catch((error) => {
		console.error('Failed to load family memberships:', error);
		return [];
	});

	// #251: every family's calendar, not just memberships[0]'s.
	const memberFamilyIds = memberships.map((m) => m.family.id);
	if (memberFamilyIds.length > 0) {
		const familyCals = await db
			.select()
			.from(calendars)
			.where(inArray(calendars.familyId, memberFamilyIds));
		calendarList.push(...familyCalendarEntries(memberships, familyCals));
	}

	// Display-only: degrades to a "no subscription" state (shared, G14).
	const { subscription, planLimits, aiUsage, planPricing } = await loadSubscriptionSummary(userId);
	const notificationPreferences = await loadNotificationPreferences(userId);
	const consentHistory = await loadConsentHistory(userId);

	return {
		consentHistory,
		user: {
			id: user!.id,
			email: user!.email,
			firstName: user!.firstName,
			lastName: user!.lastName,
			emailVerified: user!.emailVerified,
			createdAt: user!.createdAt
		},
		userSettings: userSettings ?? ACCOUNT_SETTINGS_DEFAULTS,
		calendars: calendarList,
		// 105: one row per family the user belongs to, oldest first, each with
		// its real roster size (098).
		families: memberships.map((m) => ({
			id: m.family.id,
			name: m.family.name,
			role: m.role,
			memberType: m.memberType,
			memberCount: m.memberCount
		})),
		verseTranslations: verseTranslationOptions(),
		subscription,
		planLimits,
		aiUsage,
		planPricing,
		notificationPreferences,
		// api_tokens ships via runtime migration; degrade to [] until applied.
		apiTokens: await listTokensForUser(userId).catch(() => [])
	};
};

function isString(value: FormDataEntryValue | null): value is string {
	return typeof value === 'string';
}

function formString(formData: FormData, key: string): string {
	const value = formData.get(key);
	return isString(value) ? value : '';
}

export const actions: Actions = {
	saveCalendarSettings: async ({ request, locals }) => {
		const auth = requireUserAction(locals);
		if (auth.response) return auth.response;
		const formData = await request.formData();
		const result = await saveCalendarSettings(auth.user.id, {
			weekStart: formString(formData, 'weekStart'),
			timeZone: formString(formData, 'timeZone'),
			color: formString(formData, 'color'),
			defaultView: formString(formData, 'defaultView'),
			defaultCalendarId: formString(formData, 'defaultCalendarId') || null,
			syncEventsToFamilyCalendar: formData.get('syncEventsToFamilyCalendar') === 'on',
			autoParseEventDetails: formData.get('autoParseEventDetails') === 'true',
			showDailyVerse: formData.get('showDailyVerse') === 'true',
			showAdsAsEvents: formData.get('showAdsAsEvents') === 'true',
			verseTranslation: formString(formData, 'verseTranslation')
		});
		return toActionResult(result);
	},

	// 105: the Dashboard Module switches are their own save.
	saveDashboardModules: async ({ request, locals }) => {
		const auth = requireUserAction(locals);
		if (auth.response) return auth.response;
		const formData = await request.formData();
		return toActionResult(await saveDashboardModules(auth.user.id, hiddenModulesFromForm(formData)));
	},

	// The Notifications card's own save: one switch, one receipt.
	setNotificationPreference: async ({ request, locals }) => {
		const auth = requireUserAction(locals);
		if (auth.response) return auth.response;
		const formData = await request.formData();
		const preference = formString(formData, 'preference');

		// The posted key decides which row is written, so a hand-rolled POST must
		// not be able to invent a fifth switch or write an unrecognised shape.
		if (!isNotificationPreferenceId(preference)) {
			return fail(400, { success: false, message: 'Unknown notification preference' });
		}
		const rawValue = formString(formData, 'value');
		if (rawValue !== 'true' && rawValue !== 'false') {
			return fail(400, { success: false, message: 'Notification preference value is required' });
		}
		return toActionResult(
			await saveNotificationPreference(auth.user.id, preference, rawValue === 'true')
		);
	},

	updateProfile: async ({ request, locals }) => {
		const auth = requireUserAction(locals);
		if (auth.response) return auth.response;
		const formData = await request.formData();
		return toActionResult(
			await updateProfile(
				auth.user.id,
				formString(formData, 'firstName'),
				formString(formData, 'lastName')
			)
		);
	},

	updateEmail: async ({ request, locals }, deps: UpdateEmailDeps = updateEmailDeps) => {
		const auth = requireUserAction(locals);
		if (auth.response) return auth.response;
		const result = await requestEmailChange(
			request,
			auth.user.id,
			async () => formString(await request.formData(), 'email'),
			deps
		);
		return toActionResult(result);
	},

	logoutAllDevices: async ({ locals }) => {
		const auth = requireUserAction(locals);
		if (auth.response) return auth.response;
		return toActionResult(await revokeOtherSessions(auth.user.id, locals.session?.id));
	},

	createApiToken: async ({ request, locals }) => {
		const auth = requireUserAction(locals);
		if (auth.response) return auth.response;
		const formData = await request.formData();
		const result = await mintNamedApiToken(auth.user.id, formString(formData, 'name'));
		if (!result.ok) return toActionResult(result);
		return {
			success: true,
			message: result.message,
			apiToken: result.token,
			apiTokenName: result.record.name
		};
	},

	revokeApiToken: async ({ request, locals }) => {
		const auth = requireUserAction(locals);
		if (auth.response) return auth.response;
		const formData = await request.formData();
		return toActionResult(await revokeApiToken(auth.user.id, formString(formData, 'tokenId')));
	},

	deleteAccount: async ({ request, locals }) => {
		const auth = requireUserAction(locals);
		if (auth.response) return auth.response;
		const formData = await request.formData();
		const result = await deleteAccount(
			auth.user.id,
			formString(formData, 'confirmation'),
			locals.session!.id
		);
		if (!result.ok) return toActionResult(result);
		return redirect(302, '/');
	}
};
