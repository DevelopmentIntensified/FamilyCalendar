import { createEvent } from '$lib/server/db/actions/events';
import { fail, redirect } from '@sveltejs/kit';
import type { Actions } from './$types';
import { DateTime } from 'luxon';
import type { PageServerLoad } from './$types';
import { calendars, families, familyMembers } from '$lib/server/db/schema';
import { eq } from 'drizzle-orm';
import { db } from '$lib/server/db';
import { getUserFamilies } from '$lib/server/db/actions/families';
import { getUserCalendar, createUserCalendar } from '$lib/server/db/actions/calendar';
import { getUserSettings } from '$lib/server/db/actions/userSettings';
import { canUploadAttachment, getUserSubscriptionLimits } from '$lib/server/services/subscriptionService';

// get the possible calendar ids for the current user
export const load: PageServerLoad = async (event) => {
	if (!event.locals.user) {
		return redirect(302, '/login');
	}
	let calendarIds: { id: string; name: string }[] = [];
	let userId = event.locals.user.id;
	const userFamily = await getUserFamilies(userId);

	const limits = await getUserSubscriptionLimits(userId);

	let familyCalendar: any[] = [];
	if (userFamily?.familyMembers?.familyId) {
		familyCalendar = await db
			.select()
			.from(calendars)
			.where(eq(calendars.familyId, userFamily.familyMembers.familyId));
		if (familyCalendar.length > 0) {
			calendarIds.push({ id: familyCalendar[0].id, name: 'Family Calendar' });
		}
	}
	let userCalendar = await getUserCalendar(userId);
	if (!userCalendar) {
		userCalendar = await createUserCalendar(userId);
	}
	if (userCalendar) {
		calendarIds.push({ id: userCalendar.id, name: 'User Calendar' });
	}

	const userSettings = await getUserSettings(userId);

	return {
		calendarIds,
		user: { id: userId },
		userSettings,
		attachmentLimit: limits.attachmentLimitBytes
	};
};

export const actions: Actions = {
	createEvent: async ({ request, locals }) => {
		const formData = await request.formData();
		const title = formData.get('title');
		const start = formData.get('start');
		const end = formData.get('end');
		const location = formData.get('location');
		const calendarId = formData.get('calendarId');
		const description = formData.get('description') as string;
		const ownerId = formData.get('ownerId') as string;
		const attachment = formData.get('attachment') as File | null;

		if (!locals.user) {
			throw redirect(302, '/login');
		}

		if (attachment && attachment.size > 0) {
			const attachmentCheck = await canUploadAttachment(locals.user.id, attachment.size);
			if (!attachmentCheck.allowed) {
				return fail(403, {
					message: attachmentCheck.reason,
					upgradeRequired: true
				});
			}
		}

		// Only title and start are required; end defaults to start if not provided
		if (!title || !start) {
			return fail(400, { message: 'Title and start date are required' });
		}

		const userSettings = await getUserSettings(locals.user.id);
		const userTimeZone = userSettings?.timeZone || 'UTC';

		const startDateTime = DateTime.fromISO(start.replace(' ', 'T'), { zone: userTimeZone });
		const endDateTime = DateTime.fromISO(end.replace(' ', 'T'), { zone: userTimeZone });

		if (!startDateTime.isValid || !endDateTime.isValid) {
			return fail(400, { message: 'Invalid date/time format' });
		}

		// Default end to start if not provided
		const finalEndDateTime = endDateTime.isValid ? endDateTime : startDateTime.plus({ hours: 1 });

		// Default to user's first calendar if none specified
		let finalCalendarId = calendarId?.toString() || '';
		if (!finalCalendarId && locals.user) {
			const userCalendar = await getUserCalendar(locals.user.id);
			if (userCalendar) {
				finalCalendarId = userCalendar.id;
			} else {
				// Create default calendar if none exists
				const newCal = await createUserCalendar(locals.user.id);
				finalCalendarId = newCal.id;
			}
		}

		const newEvent = await createEvent({
			description: description || null,
			title: title.toString(),
			start: startDateTime.toString(),
			end: finalEndDateTime.toString(),
			location: location?.toString() || null,
			calendarId: finalCalendarId,
			ownerId
		});

		if (newEvent) {
			throw redirect(302, '/calendar');
		} else {
			return fail(500, { message: 'Failed to create event' });
		}
	}
};
