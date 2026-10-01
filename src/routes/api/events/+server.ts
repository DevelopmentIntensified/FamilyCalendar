import { json } from '@sveltejs/kit';
import { apiError } from '$lib/server/utils/apiError';
import type { RequestHandler } from './$types';
import { createEvent } from '$lib/server/db/actions/events';
import { db } from '$lib/server/db';
import { calendars, events } from '$lib/server/db/schema';
import { and, eq, gte, isNotNull, isNull, lte, or } from 'drizzle-orm';
import { ensurePersonalCalendar } from '$lib/server/db/actions/calendar';
import { eventAccessFilter, getAccessibleCalendarIds } from '$lib/server/db/actions/calendarScope';
import { getUserFamilyId } from '$lib/server/db/actions/families';
import { getUserSettings } from '$lib/server/db/actions/userSettings';
import { resolveEventInvites } from '$lib/server/utils/eventInvites';
import { normalizeEventRecurrence } from '$lib/server/services/eventRecurrence';
import {
	attachAttendanceSummaries,
	attachCreatorNames,
	attachRsvpStatus,
	expandEventsForUser,
	monthGridWindow,
	parseEvents
} from '$lib/server/services/eventDisplayService';
import { getUserZone } from '$lib/server/utils/userTimezone';
import { resolveEventRange } from '$lib/server/services/eventRange';

/**
 * GET /api/events?from=&to= — the ranged read (issue 082).
 *
 * The calendar loads the month it is shown, so navigating to a month with no
 * data used to show an empty grid; an imported event landing in a future month
 * was on the database and invisible. This is the same pipeline the page load
 * uses — recurring masters expanded, exceptions applied, RSVP + attendance +
 * creator attached — read through the same accessible-calendar scope, so it is
 * not a second dialect of the same query.
 */
export const GET: RequestHandler = async ({ url, locals }) => {
	if (!locals.user) {
		return json({ error: 'Unauthorized' }, { status: 401 });
	}
	const userId = locals.user.id;

	const range = resolveEventRange(url.searchParams);
	if ('error' in range) {
		return json({ error: range.error }, { status: 400 });
	}

	// The visible-month window, but built from the RANGE's end so a fetch for
	// October expands October (plus the grid's week of padding), never today.
	const window = monthGridWindow(range.to);
	const accessibleCalIds = await getAccessibleCalendarIds(userId);

	const rows = await db
		.select()
		.from(events)
		.where(
			and(
				eventAccessFilter(userId, accessibleCalIds),
				or(
					isNotNull(events.recurrenceFrequency),
					and(
						lte(events.start, window.endIso),
						or(
							gte(events.end, window.startIso),
							and(isNull(events.end), gte(events.start, window.startIso))
						)
					)
				)
			)
		)
		.orderBy(events.start);

	const zone = (await getUserZone(userId)) ?? 'utc';
	const expanded = await parseEvents(await expandEventsForUser(rows, window), zone);
	const withRsvp = await attachRsvpStatus(userId, expanded);
	const withAttendance = await attachAttendanceSummaries(withRsvp);

	return json({ window: range, events: await attachCreatorNames(withAttendance) });
};

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
