import { getUserSettings, updateUserSettings } from '$lib/server/db/actions/userSettings';
import { fail, redirect } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = async (event) => {
	const userId = event.locals.user.id;
	const userSettings = await getUserSettings(userId);

	return {
		userSettings: userSettings ?? {
			weekStart: 'sunday',
			timeZone: 'UTC',
			color: '#3b82f6',
			defaultView: 'dayView',
			syncEventsToFamilyCalendar: false
		}
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
		const syncEventsToFamilyCalendar = formData.get('syncEventsToFamilyCalendar') === 'on';

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
						syncEventsToFamilyCalendar
					});
				});
			} else {
				await updateUserSettings(userId, {
					weekStart,
					timeZone,
					color,
					defaultView,
					syncEventsToFamilyCalendar
				});
			}

			return { success: true, message: 'Settings saved successfully' };
		} catch (error) {
			console.error('Failed to save settings:', error);
			return fail(500, { success: false, message: 'Failed to save settings' });
		}
	}
};
