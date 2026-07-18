import { getUserSettings, updateUserSettings } from '$lib/server/db/actions/userSettings';
import { fail, redirect } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import { db } from '$lib/server/db';
import { calendars, families, familyMembers, userAdConsent } from '$lib/server/db/schema';
import { eq } from 'drizzle-orm';

export const load: PageServerLoad = async (event) => {
	if (!event.locals.user) {
		return redirect(302, '/login');
	}
	const userId = event.locals.user.id;
	const userSettings = await getUserSettings(userId);

	const userCals = await db.select().from(calendars).where(eq(calendars.ownerId, userId));
	const calendarList: { id: string; name: string }[] = userCals.map(c => ({ id: c.id, name: 'Personal Calendar' }));

	const [member] = await db.select().from(familyMembers).where(eq(familyMembers.userId, userId));
	if (member) {
		const familyCals = await db.select().from(calendars).where(eq(calendars.familyId, member.familyId));
		const [family] = await db.select().from(families).where(eq(families.id, member.familyId));
		for (const fc of familyCals) {
			calendarList.push({ id: fc.id, name: family?.name || 'Family Calendar' });
		}
	}

	return {
		userSettings: userSettings ?? {
			weekStart: 'sunday',
			timeZone: 'UTC',
			color: '#3b82f6',
			defaultView: 'dayView',
			syncEventsToFamilyCalendar: false
		},
		calendars: calendarList
	};
};

export const actions: Actions = {
	default: async ({ request, locals }) => {
		const userId = locals.user.id;
		const formData = await request.formData();

		const weekStart = formData.get('weekStart') as string;
		const timeZone = formData.get('timeZone') as string;
		const color = formData.get('color') as string;
		const defaultView = formData.get('defaultView') as string;
		const defaultCalendarId = formData.get('defaultCalendarId') as string || null;
		const syncEventsToFamilyCalendar = formData.get('syncEventsToFamilyCalendar') === 'on';
		const autoParseEventDetails = formData.get('autoParseEventDetails') === 'true';
		const useCloudAI = formData.get('useCloudAI') === 'true';
		const useLocalAI = formData.get('useLocalAI') === 'true';

		try {
			const existingSettings = await getUserSettings(userId);

			if (!existingSettings) {
				await import('$lib/server/db/actions/userSettings').then(async ({ createUserSettings }) => {
					await createUserSettings({
						userId,
						weekStart,
						timeZone,
						color,
						defaultView,
						defaultCalendarId,
						syncEventsToFamilyCalendar,
						autoParseEventDetails,
						useCloudAI,
						useLocalAI
					});
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
					useCloudAI,
					useLocalAI
				});
			}

			return { success: true, message: 'Settings saved successfully' };
		} catch (error) {
			console.error('Failed to save settings:', error);
			return fail(500, { success: false, message: 'Failed to save settings' });
		}
	},
	ads: async ({ request, locals }) => {
		const userId = locals.user.id;
		const formData = await request.formData();

		const showAdsAsEvents = formData.get('showAdsAsEvents') === 'true';
		const showAdMarkers = formData.get('showAdMarkers') === 'true';
		const personalizedAds = formData.get('personalizedAds') === 'true';

		try {
			const existing = await db.select().from(userAdConsent).where(eq(userAdConsent.userId, userId));
			
			if (existing.length > 0) {
				await db.update(userAdConsent).set({
					showAdsAsEvents,
					showAdMarkers,
					personalizedAds,
					updatedAt: new Date()
				}).where(eq(userAdConsent.userId, userId));
			} else {
				await db.insert(userAdConsent).values({
					userId,
					showAdsAsEvents,
					showAdMarkers,
					personalizedAds,
					updatedAt: new Date()
				});
			}

			return { success: true, message: 'Ad preferences saved' };
		} catch (error) {
			console.error('Failed to save ad preferences:', error);
			return fail(500, { success: false, message: 'Failed to save ad preferences' });
		}
	}
};
