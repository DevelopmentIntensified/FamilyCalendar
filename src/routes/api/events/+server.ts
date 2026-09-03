import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { createEvent } from '$lib/server/db/actions/events';
import { db } from '$lib/server/db';
import { calendars, events } from '$lib/server/db/schema';
import { eq, and, isNull } from 'drizzle-orm';
import { getAccessibleCalendarIds } from '$lib/server/db/actions/calendarScope';
import { getUserFamilyId } from '$lib/server/db/actions/families';
import { resolveEventInvites } from '$lib/server/utils/eventInvites';

const VALID_FREQUENCIES = ['daily', 'weekly', 'monthly', 'yearly'];

function normalizeRecurrence(body: {
	recurrenceFrequency?: string | null;
	recurrenceInterval?: number | null;
	recurrenceByDay?: string[] | null;
	recurrenceCount?: number | null;
	recurrenceUntil?: string | null;
}) {
	const frequency = VALID_FREQUENCIES.includes(body.recurrenceFrequency || '')
		? body.recurrenceFrequency ?? null
		: null;
	const interval = frequency ? Math.max(1, Math.floor(body.recurrenceInterval ?? 1)) : null;
	// Only keep BYDAY/COUNT/UNTIL when a recurring frequency is present; they
	// are meaningless on a one-off event. Sanitize BYDAY to plain weekday codes.
	const VALID_BYDAY = new Set(['MO', 'TU', 'WE', 'TH', 'FR', 'SA', 'SU']);
	const byDay = frequency
		? (Array.isArray(body.recurrenceByDay)
				? body.recurrenceByDay.filter((d) => typeof d === 'string' && VALID_BYDAY.has(d.toUpperCase()))
				: null) || null
		: null;
	const count = frequency && typeof body.recurrenceCount === 'number' && body.recurrenceCount > 0
		? Math.floor(body.recurrenceCount)
		: null;
	const until = frequency && typeof body.recurrenceUntil === 'string' && body.recurrenceUntil
		? body.recurrenceUntil
		: null;
	return {
		recurrenceFrequency: frequency,
		recurrenceInterval: interval,
		recurrenceByDay: byDay?.length ? byDay : null,
		recurrenceCount: count,
		recurrenceUntil: until
	};
}

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
		let userCalendar = await db
			.select()
			.from(calendars)
			.where(and(eq(calendars.ownerId, userId), isNull(calendars.familyId)));
		if (userCalendar.length === 0) {
			const [newCal] = await db.insert(calendars).values({ ownerId: userId }).returning();
			calendarId = newCal.id;
		} else {
			calendarId = userCalendar[0].id;
		}
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
		...normalizeRecurrence(body)
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
