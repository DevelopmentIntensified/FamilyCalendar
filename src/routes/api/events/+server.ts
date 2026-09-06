import { json } from '@sveltejs/kit';
import { apiError } from '$lib/server/utils/apiError';
import type { RequestHandler } from './$types';
import { createEvent } from '$lib/server/db/actions/events';
import { db } from '$lib/server/db';
import { calendars } from '$lib/server/db/schema';
import { eq } from 'drizzle-orm';
import { ensurePersonalCalendar } from '$lib/server/db/actions/calendar';
import { getAccessibleCalendarIds } from '$lib/server/db/actions/calendarScope';
import { getUserFamilyId } from '$lib/server/db/actions/families';
import { getUserSettings } from '$lib/server/db/actions/userSettings';
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

	if (body.calendarId) {
		const accessibleCalIds = await getAccessibleCalendarIds(userId);
		if (!accessibleCalIds.includes(body.calendarId)) {
			return json({ error: 'Calendar not accessible' }, { status: 403 });
		}
	}

	try {
		// Event + creator RSVP + invites + family mirror commit as ONE
		// transaction — a failed mirror write used to leave half-synced state
		// (and a failed invite write left a half-written event).
		const created = await db.transaction(async (tx) => {
			let calendarId: string | undefined = body.calendarId;
			if (!calendarId) {
				const personalCal = await ensurePersonalCalendar(userId, tx);
				if (!personalCal) {
					throw new Error('No personal calendar available');
				}
				calendarId = personalCal.id;
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
				reminderMinutes: body.reminderMinutes ?? null,
				...normalizeEventRecurrence(body)
			};

			const createdEvent = await createEvent(eventData, userId, invites, tx);

			// syncEventsToFamilyCalendar: mirror personal-calendar creations
			// onto the family calendar so everyone sees them. mirrorOf marks
			// the copy so later master edits/deletes propagate to it.
			const settings = await getUserSettings(userId);
			if (settings?.syncEventsToFamilyCalendar) {
				const memberFamilyId = await getUserFamilyId(userId);
				if (memberFamilyId) {
					const familyCals = await tx
						.select()
						.from(calendars)
						.where(eq(calendars.familyId, memberFamilyId));
					const familyCal = familyCals[0];
					if (familyCal && familyCal.id !== calendarId) {
						await createEvent(
							{ ...eventData, calendarId: familyCal.id, mirrorOf: createdEvent.id },
							userId,
							invites,
							tx
						);
					}
				}
			}

			return createdEvent;
		});

		return json({ success: true, event: created }, { status: 201 });
	} catch (error) {
		console.error('Failed to create event:', error);
		return apiError(
			new URL(request.url).pathname,
			500,
			'Failed to create event',
			locals.user?.id ?? null
		);
	}
};
