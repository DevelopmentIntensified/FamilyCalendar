import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { createEvent } from '$lib/server/db/actions/events';
import { db } from '$lib/server/db';
import { calendars, events } from '$lib/server/db/schema';
import { eq } from 'drizzle-orm';
import { ensurePersonalCalendar } from '$lib/server/db/actions/calendar';
import { getAccessibleCalendarIds } from '$lib/server/db/actions/calendarScope';
import { getUserFamilyId } from '$lib/server/db/actions/families';
import { resolveEventInvites } from '$lib/server/utils/eventInvites';
import { normalizeEventRecurrence } from '$lib/server/services/eventRecurrence';

export const POST: RequestHandler = async ({ request, locals }) => {
	if (!locals.user) {
		return json({ error: 'Unauthorized' }, { status: 401 });
	}

	const userId = locals.user.id;
	const body = await request.json();

	// Structured `attendees` (members + guests with inviteType) are preferred;
	// legacy `attendants: string[]` (guest names) still work.
	const invites = await resolveEventInvites(
		userId,
		Array.isArray(body.attendees) ? body.attendees : body.attendants
	);

	let calendarId = body.calendarId;
	if (!calendarId) {
		const personalCal = await ensurePersonalCalendar(userId);
		if (!personalCal) {
			return json({ error: 'Failed to create event' }, { status: 500 });
		}
		calendarId = personalCal.id;
	} else {
		const accessibleCalIds = await getAccessibleCalendarIds(userId);
		if (!accessibleCalIds.includes(calendarId)) {
			return json({ error: 'Calendar not accessible' }, { status: 403 });
		}
	}

	const eventData = {
		calendarId,
		ownerId: userId,
		title: body.title,
		start: body.start,
		end: body.end || null,
		description: body.description || null,
		location: body.location || null,
		allDay: body.allDay || false,
		...normalizeEventRecurrence(body)
	};

	try {
		const created = await createEvent(eventData, userId, invites);

		// syncEventsToFamilyCalendar: mirror personal-calendar creations
		// onto the family calendar so everyone sees them.
		try {
			const { getUserSettings } = await import('$lib/server/db/actions/userSettings');
			const settings = await getUserSettings(userId);
			if (settings?.syncEventsToFamilyCalendar) {
				const memberFamilyId = await getUserFamilyId(userId);
				if (memberFamilyId) {
					const familyCals = await db
						.select()
						.from(calendars)
						.where(eq(calendars.familyId, memberFamilyId));
					const familyCal = familyCals[0];
					if (familyCal && familyCal.id !== calendarId) {
						await createEvent(
							{ ...eventData, calendarId: familyCal.id },
							userId,
							invites
						);
					}
				}
			}
		} catch (mirrorError) {
			console.error('Family sync mirror failed (event still created):', mirrorError);
		}

		return json({ success: true, event: created }, { status: 201 });
	} catch (error) {
		console.error('Failed to create event:', error);
		return json({ error: 'Failed to create event' }, { status: 500 });
	}
};
