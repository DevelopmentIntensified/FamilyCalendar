import { getUser, updateUser } from '$lib/server/db/actions/users';
import { getUserSettings, updateUserSettings } from '$lib/server/db/actions/userSettings';
import { lucia } from '$lib/server/auth';
import { db } from '$lib/server/db';
import { sessions, calendars } from '$lib/server/db/schema';
import { eq } from 'drizzle-orm';
import { getUserFamilyMemberships } from '$lib/server/db/actions/families';
import {
	getSubscriptionStatus,
	getUserSubscriptionLimits,
	getAiUsageThisMonth,
	getDefaultLimits
} from '$lib/server/services/subscriptionService';
import { getPlanPricing } from '$lib/server/services/checkoutService';
import { fail, redirect } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import { sendEmail } from '$lib/utils/sendEmail';
import { NOREPLYEMAIL, EMAILSECRET } from '$env/static/private';
import { getUrl } from '$lib/utils/getUrl';
import { createJWT } from 'oslo/jwt';
import { TimeSpan } from 'lucia';
import { generateRandomString, type RandomReader } from '@oslojs/crypto/random';
import { createCode, deleteCodesByEmail } from '$lib/server/db/actions/codes';
import { TRANSLATIONS } from '$lib/server/services/verseService';
import { recordAdConsentChange } from '$lib/server/services/adConsentService';
import { DASHBOARD_MODULES } from '$lib/dashboardModules';
import { hiddenModulesFromForm } from '$lib/components/account/accountDashboardModules';
import {
	createApiToken as mintApiToken,
	listTokensForUser,
	revokeToken
} from '$lib/server/db/actions/apiTokens';

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
	// lists, both read the multi-family helper. `getUserFamilyId` is the
	// first-row guess 098 retired for authorisation - this loader was its last
	// reader here, so a second family no longer loses its calendar or its row.
	const memberships = await getUserFamilyMemberships(userId).catch((error) => {
		console.error('Failed to load family memberships:', error);
		return [];
	});

	const memberFamilyId = memberships[0]?.family.id ?? null;
	if (memberFamilyId) {
		const familyCals = await db
			.select()
			.from(calendars)
			.where(eq(calendars.familyId, memberFamilyId));
		const familyNames = new Map(memberships.map((m) => [m.family.id, m.family.name]));
		for (const fc of familyCals) {
			calendarList.push({
				id: fc.id,
				name: familyNames.get(memberFamilyId) || 'Family Calendar'
			});
		}
	}

	// Subscription data is display-only for settings — never let a failure here
	// break the rest of the settings page, so degrade to a "no subscription" state.
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

	return {
		user: {
			id: user!.id,
			email: user!.email,
			firstName: user!.firstName,
			lastName: user!.lastName,
			emailVerified: user!.emailVerified,
			createdAt: user!.createdAt
		},
		userSettings: userSettings ?? {
			weekStart: 'sunday',
			timeZone: 'UTC',
			color: '#3b82f6',
			defaultView: 'dayView',
			defaultCalendarId: null,
			syncEventsToFamilyCalendar: false,
			// Ads are opt-in (#088): no settings row means no ads.
			showAdsAsEvents: false,
			verseTranslation: 'esv'
		},
		calendars: calendarList,
		// 105: one row per family the user belongs to, oldest first, each with
		// its real roster size (098). The section's count cannot be a guess.
		families: memberships.map((m) => ({
			id: m.family.id,
			name: m.family.name,
			role: m.role,
			memberType: m.memberType,
			memberCount: m.memberCount
		})),
		verseTranslations: Object.values(TRANSLATIONS).map(({ id, label, attribution }) => ({
			id,
			label,
			attribution
		})),
		subscription,
		planLimits,
		aiUsage,
		planPricing: getPlanPricing('monthly'),
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
		const userId = locals.user.id;
		const formData = await request.formData();

		const weekStart = formString(formData, 'weekStart');
		const timeZone = formString(formData, 'timeZone');
		const color = formString(formData, 'color');
		const defaultView = formString(formData, 'defaultView');
		const defaultCalendarId = formString(formData, 'defaultCalendarId') || null;
		const syncEventsToFamilyCalendar = formData.get('syncEventsToFamilyCalendar') === 'on';
		const autoParseEventDetails = formData.get('autoParseEventDetails') === 'true';
		const showDailyVerse = formData.get('showDailyVerse') === 'true';
		// The ad gate (#088) — the one field that decides whether ads render.
		const showAdsAsEvents = formData.get('showAdsAsEvents') === 'true';
		const rawTranslation = formString(formData, 'verseTranslation');
		const verseTranslation = rawTranslation in TRANSLATIONS ? rawTranslation : 'esv';

		try {
			const existingSettings = await getUserSettings(userId);
			// The ad value as it stands BEFORE this save. Consent records are
			// written on a transition, so this is what decides whether the save
			// is an event at all — saving the form with the box untouched is not
			// one (#088).
			const previousAdsConsent = existingSettings?.showAdsAsEvents;

			// 105: `hiddenDashboardModules` is NOT written here. The switches
			// live in their own section and their own action. Deriving the list
			// from this form would mark every module hidden on every save,
			// because a form without module checkboxes reports them all absent.
			if (!existingSettings) {
				const { createUserSettings } = await import('$lib/server/db/actions/userSettings');
				await createUserSettings({
					userId,
					weekStart,
					timeZone,
					color,
					defaultView,
					defaultCalendarId,
					syncEventsToFamilyCalendar,
					autoParseEventDetails,
					showDailyVerse,
					showAdsAsEvents,
					verseTranslation
				});
			} else {
				await updateUserSettings(userId, {
					weekStart,
					timeZone,
					color,
					defaultView,
					defaultCalendarId,
					syncEventsToFamilyCalendar,
					autoParseEventDetails,
					showDailyVerse,
					showAdsAsEvents,
					verseTranslation
				});
			}

			// Evidence beside the setting, not a second gate (#088). The ad gate
			// is still shouldServeAds(userSettings) alone; this row is what
			// answers "prove I consented" and "when did they withdraw".
			//
			// It must NOT be able to fail the save. The settings are already
			// written by this point, so a throw here was caught by the block
			// below and returned fail(500) — the user was told their settings
			// had not saved when they had. That is worse than a crash: it is a
			// false report about work that succeeded, on a toggle the user
			// believes IS their consent.
			//
			// So the record is best-effort evidence and a failure is LOUD, not
			// silent: logged with the reason, because a consent trail that
			// quietly stops recording is the exact failure this table exists to
			// prevent. Until the hand-written DDL in the issue has been run, the
			// reason is almost always that the table does not exist.
			try {
				await recordAdConsentChange(userId, previousAdsConsent, showAdsAsEvents);
			} catch (consentError) {
				console.error(
					'Consent record NOT written; the ad setting itself WAS saved. ' +
						'Run the adConsentRecords DDL in ' +
						'docs/issues/088-ad-consent-two-sources-of-truth.md. Cause:',
					consentError
				);
			}

			return { success: true, message: 'Calendar settings saved successfully' };
		} catch (error) {
			console.error('Failed to save calendar settings:', error);
			return fail(500, { success: false, message: 'Failed to save calendar settings' });
		}
	},

	// 105: the Dashboard Module switches are their own save. Kept apart from
	// saveCalendarSettings so hiding a card and changing your week start are two
	// acts with two receipts, and a failure in one cannot rewrite the other.
	saveDashboardModules: async ({ request, locals }) => {
		const userId = locals.user.id;
		const formData = await request.formData();

		try {
			const hiddenDashboardModules = hiddenModulesFromForm(formData);
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
				success: true,
				message: hiddenCount
					? `Dashboard modules saved — ${DASHBOARD_MODULES.length - hiddenCount} of ${DASHBOARD_MODULES.length} cards on.`
					: `Dashboard modules saved — all ${DASHBOARD_MODULES.length} cards on.`
			};
		} catch (error) {
			console.error('Failed to save dashboard modules:', error);
			return fail(500, { success: false, message: 'Failed to save dashboard modules' });
		}
	},

	updateProfile: async ({ request, locals }) => {
		const userId = locals.user.id;
		const formData = await request.formData();

		const firstName = formString(formData, 'firstName');
		const lastName = formString(formData, 'lastName');

		if (!firstName || !lastName) {
			return fail(400, { success: false, message: 'First name and last name are required' });
		}

		try {
			await updateUser(userId, { firstName, lastName });
			return { success: true, message: 'Profile updated successfully' };
		} catch (error) {
			console.error('Failed to update profile:', error);
			return fail(500, { success: false, message: 'Failed to update profile' });
		}
	},

	updateEmail: async ({ request, locals }) => {
		const userId = locals.user.id;
		const currentUser = await getUser(userId);
		const formData = await request.formData();

		if (!currentUser) {
			return fail(401, { success: false, message: 'Not signed in' });
		}

		// Anonymous Accounts have no email yet — they claim their first
		// email via the magic-link save flow, not the change-email flow.
		if (!currentUser.email) {
			return fail(400, {
				success: false,
				message:
					"You're using a guest calendar — add your first email from the Save-your-calendar banner instead.",
				guestNeedsClaim: true
			});
		}

		const email = formString(formData, 'email');

		if (!email || !email.includes('@')) {
			return fail(400, { success: false, message: 'Valid email is required' });
		}

		if (email === currentUser?.email) {
			return fail(400, {
				success: false,
				message: 'New email must be different from current email'
			});
		}

		try {
			const random: RandomReader = {
				read(bytes) {
					crypto.getRandomValues(bytes);
				}
			};
			const nums = '0123456789';
			const code = generateRandomString(random, nums, 8);

			const secret = new TextEncoder().encode(EMAILSECRET);
			const token = await createJWT(
				'HS256',
				secret,
				{ code, pendingEmail: email },
				{
					headers: { alg: 'HS256', typ: 'JWT' },
					expiresIn: new TimeSpan(15, 'm')
				}
			);

			const verifyUrl = new URL(getUrl());
			verifyUrl.pathname = '/account/verify-email';
			verifyUrl.searchParams.set('token', token);

			await sendEmail({
				to: email,
				from: NOREPLYEMAIL,
				subject: 'Family Planz Email Change Verification',
				html: `<h1>Your verification code is: ${code}</h1>
<p>Or click this link to verify: <a href="${verifyUrl.toString()}">Verify Email</a></p>`
			});

			await deleteCodesByEmail(currentUser!.email);
			await createCode({
				code,
				expiresAt: new Date(Date.now() + 60 * 1000 * 15),
				email: currentUser!.email,
				firstName: currentUser!.firstName,
				lastName: currentUser!.lastName,
				type: 'email_change',
				pendingEmail: email
			});

			return { success: true, message: 'Verification email sent. Please check your inbox.' };
		} catch (error) {
			console.error('Failed to update email:', error);
			return fail(500, { success: false, message: 'Failed to send verification email' });
		}
	},

	logoutAllDevices: async ({ locals }) => {
		const userId = locals.user.id;
		const currentSessionId = locals.session?.id;

		try {
			const allSessions = await db.select().from(sessions).where(eq(sessions.userId, userId));

			for (const session of allSessions) {
				if (session.id !== currentSessionId) {
					await lucia.invalidateSession(session.id);
				}
			}

			return { success: true, message: 'Logged out from all other devices' };
		} catch (error) {
			console.error('Failed to logout from all devices:', error);
			return fail(500, { success: false, message: 'Failed to logout from all devices' });
		}
	},

	createApiToken: async ({ request, locals }) => {
		const formData = await request.formData();
		const name = formString(formData, 'name').trim();
		if (!name) {
			return fail(400, { success: false, message: 'Token name is required' });
		}
		try {
			const { row, token } = await mintApiToken(locals.user.id, name.slice(0, 60));
			return {
				success: true,
				message: `Token '${row.name}' created — copy it now, it won't be shown again.`,
				apiToken: token,
				apiTokenName: row.name
			};
		} catch (error) {
			console.error('Failed to create API token:', error);
			return fail(500, { success: false, message: 'Failed to create token' });
		}
	},

	revokeApiToken: async ({ request, locals }) => {
		const formData = await request.formData();
		const tokenId = formString(formData, 'tokenId');
		if (!tokenId) {
			return fail(400, { success: false, message: 'Token id is required' });
		}
		try {
			await revokeToken(locals.user.id, tokenId);
			return { success: true, message: 'Token revoked' };
		} catch (error) {
			console.error('Failed to revoke API token:', error);
			return fail(500, { success: false, message: 'Failed to revoke token' });
		}
	},

	deleteAccount: async ({ request, locals }) => {
		const userId = locals.user.id;
		const formData = await request.formData();

		const confirmation = formString(formData, 'confirmation');

		if (confirmation !== userId) {
			return fail(400, { success: false, message: 'Confirmation does not match' });
		}

		await lucia.invalidateSession(locals.session!.id);

		await db.delete(sessions).where(eq(sessions.userId, userId));

		const { deleteUser } = await import('$lib/server/db/actions/users');
		await deleteUser(userId);

		return redirect(302, '/');
	}
};
