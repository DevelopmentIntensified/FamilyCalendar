import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { createEvent, updateEventById, deleteEventById, upsertException } from '$lib/server/db/actions/events';
import { db } from '$lib/server/db';
import { calendars, events, familyMembers } from '$lib/server/db/schema';
import { eq } from 'drizzle-orm';

const VALID_FREQUENCIES = ['daily', 'weekly', 'monthly', 'yearly'];

function normalizeRecurrence(body: { recurrenceFrequency?: string | null; recurrenceInterval?: number | null }) {
	const frequency = VALID_FREQUENCIES.includes(body.recurrenceFrequency || '')
		? body.recurrenceFrequency
		: null;
	const interval = frequency ? Math.max(1, Math.floor(body.recurrenceInterval ?? 1)) : null;
	return { recurrenceFrequency: frequency, recurrenceInterval: interval };
}

export const POST: RequestHandler = async ({ request, locals }) => {
	if (!locals.user) {
		return json({ error: 'Unauthorized' }, { status: 401 });
	}

	const userId = locals.user.id;
	const body = await request.json();

	const attendantNames: string[] = Array.isArray(body.attendants) ? body.attendants : [];

	let calendarId = body.calendarId;
	if (!calendarId) {
		let userCalendar = await db.select().from(calendars).where(eq(calendars.ownerId, userId));
		if (userCalendar.length === 0) {
			const [newCal] = await db.insert(calendars).values({ ownerId: userId }).returning();
			calendarId = newCal.id;
		} else {
			calendarId = userCalendar[0].id;
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
		const created = await createEvent(eventData, userId, attendantNames);

		// syncEventsToFamilyCalendar: mirror personal-calendar creations
		// onto the family calendar so everyone sees them.
		try {
			const { getUserSettings } = await import('$lib/server/db/actions/userSettings');
			const settings = await getUserSettings(userId);
			if (settings?.syncEventsToFamilyCalendar) {
				const [member] = await db
					.select()
					.from(familyMembers)
					.where(eq(familyMembers.userId, userId));
				if (member?.familyId) {
					const familyCals = await db
						.select()
						.from(calendars)
						.where(eq(calendars.familyId, member.familyId));
					const familyCal = familyCals[0];
					if (familyCal && familyCal.id !== calendarId) {
						await createEvent(
							{ ...eventData, calendarId: familyCal.id },
							userId,
							attendantNames
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

export const PUT: RequestHandler = async ({ request, locals, url }) => {
	if (!locals.user) {
		return json({ error: 'Unauthorized' }, { status: 401 });
	}

	const userId = locals.user.id;
	const eventId = url.pathname.split('/').pop();

	if (!eventId) {
		return json({ error: 'Event ID required' }, { status: 400 });
	}

	const body = await request.json();
	const attendantNames: string[] = Array.isArray(body.attendants) ? body.attendants : [];

	const eventData = {
		title: body.title,
		start: body.start,
		end: body.end || null,
		description: body.description || null,
		location: body.location || null,
		allDay: body.allDay || false,
		calendarId: body.calendarId || null,
		...normalizeRecurrence(body)
	};

	try {
		// Exception Override: scope=this edits a single occurrence of a
		// Recurring Event without altering the schedule.
		if (body.scope === 'this' && body.occurrenceDate) {
			await upsertException({
				eventId: eventId,
				originalDate: body.occurrenceDate,
				title: eventData.title,
				description: eventData.description,
				location: eventData.location,
				start: eventData.start,
				end: eventData.end,
				allDay: eventData.allDay
			});
			return json({ success: true, scopedToOccurrence: true });
		}

		const updated = await updateEventById(eventId, eventData, userId, attendantNames);
		if (!updated) {
			return json({ error: 'Event not found' }, { status: 404 });
		}
		return json({ success: true, event: updated });
	} catch (error) {
		console.error('Failed to update event:', error);
		return json({ error: 'Failed to update event' }, { status: 500 });
	}
};

export const DELETE: RequestHandler = async ({ request, locals, url }) => {
	if (!locals.user) {
		return json({ error: 'Unauthorized' }, { status: 401 });
	}

	const userId = locals.user.id;
	const eventId = url.pathname.split('/').pop();

	if (!eventId) {
		return json({ error: 'Event ID required' }, { status: 400 });
	}

	try {
		// Exception Override: cancel a single occurrence.
		let scope: string | null = null;
		let occurrenceDate: string | null = null;
		try {
			const body = await request.json();
			scope = body?.scope ?? null;
			occurrenceDate = body?.occurrenceDate ?? null;
		} catch {
			// no body provided
		}

		if (scope === 'this' && occurrenceDate) {
			await upsertException({
				eventId,
				originalDate: occurrenceDate,
				isCancelled: true
			});
			return json({ success: true, cancelledOccurrence: true });
		}

		await deleteEventById(eventId, userId);
		return json({ success: true }, { status: 200 });
	} catch (error) {
		console.error('Failed to delete event:', error);
		return json({ error: 'Failed to delete event' }, { status: 500 });
	}
};
