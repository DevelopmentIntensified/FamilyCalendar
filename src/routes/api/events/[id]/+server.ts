import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { db } from '$lib/server/db';
import { eventExceptions } from '$lib/server/db/schema';
import { updateEventById, deleteEventById, getEvent, upsertException } from '$lib/server/db/actions/events';
import { resolveEventInvites } from '$lib/server/utils/eventInvites';
import { getAccessibleCalendarIds } from '$lib/server/utils/calendarScope';
import { toDateTime } from '$lib/server/utils/eventTimes';
import { eq } from 'drizzle-orm';

interface EventScopeRef {
	ownerId: string;
	calendarId: string | null;
	recurrenceFrequency: string | null;
}

function isAccessibleEvent(event: EventScopeRef, userId: string, accessibleCalIds: string[]) {
	return event.ownerId === userId || (!!event.calendarId && accessibleCalIds.includes(event.calendarId));
}

/** Normalize any timestamp shape into the exact UTC ISO form
 *  expandEventsForUser keys exceptions by (`{eventId}~{occ.toISOString()}`). */
function normalizeOccurrence(value: unknown): string | null {
	return toDateTime(value)?.toUTC().toISO() ?? null;
}

export const PUT: RequestHandler = async ({ request, locals, params }) => {
	if (!locals.user) {
		return json({ error: 'Unauthorized' }, { status: 401 });
	}

	const userId = locals.user.id;
	const body = await request.json();
	// Display events (expandEventsForUser) carry a composite VIRTUAL id of the
	// form `${masterId}~${occurrenceISO}` — including for non-recurring events.
	// The events table only knows the real id, so resolve to the master before
	// any DB lookup or the row is never found ("Event not found").
	const id = params.id.split('~')[0];
	// Only touch invitations when the caller actually sent attendee data.
	const hasInvites = Array.isArray(body.attendees) || Array.isArray(body.attendants);
	const invites = hasInvites
		? await resolveEventInvites(userId, Array.isArray(body.attendees) ? body.attendees : body.attendants)
		: undefined;

	try {
		const [existing, accessibleCalIds] = await Promise.all([
			getEvent(id),
			getAccessibleCalendarIds(userId)
		]);
		if (!existing) {
			return json({ error: 'Event not found' }, { status: 404 });
		}

		if (body.scope === 'this' && existing.recurrenceFrequency) {
			if (!isAccessibleEvent(existing, userId, accessibleCalIds)) {
				return json({ error: 'Event not accessible' }, { status: 403 });
			}
			const originalDate = normalizeOccurrence(body.occurrenceDate);
			if (!originalDate) {
				return json({ error: 'A valid occurrenceDate is required' }, { status: 400 });
			}
			await upsertException({
				eventId: id,
				originalDate,
				isCancelled: false,
				title: body.title,
				description: body.description,
				location: body.location,
				start: body.start,
				end: body.end,
				allDay: body.allDay
			});
			return json({ success: true });
		}

		let calendarId = existing.calendarId;
		if (body.calendarId) {
			if (!accessibleCalIds.includes(body.calendarId)) {
				return json({ error: 'Calendar not accessible' }, { status: 403 });
			}
			calendarId = body.calendarId;
		}

		const eventData = {
			title: body.title,
			start: body.start,
			end: body.end || null,
			description: body.description || null,
			location: body.location || null,
			allDay: body.allDay || false,
			calendarId
		};

		const updated = await updateEventById(id, eventData, userId, invites, accessibleCalIds);
		if (!updated) {
			return json({ error: 'Event not found' }, { status: 404 });
		}
		return json({ success: true, event: updated });
	} catch (error) {
		console.error('Failed to update event:', error);
		return json({ error: 'Failed to update event' }, { status: 500 });
	}
};

export const DELETE: RequestHandler = async ({ request, locals, params }) => {
	if (!locals.user) {
		return json({ error: 'Unauthorized' }, { status: 401 });
	}

	const userId = locals.user.id;
	const body = await request.json().catch(() => ({}));
	const scope = body.scope === 'this' ? 'this' : 'all';
	// Resolve composite display id (`${masterId}~${iso}`) to the real id.
	const id = params.id.split('~')[0];

	try {
		if (scope === 'this') {
			const [existing, accessibleCalIds] = await Promise.all([
				getEvent(id),
				getAccessibleCalendarIds(userId)
			]);
			if (!existing) {
				return json({ error: 'Event not found' }, { status: 404 });
			}
			if (!isAccessibleEvent(existing, userId, accessibleCalIds)) {
				return json({ error: 'Event not accessible' }, { status: 403 });
			}

			if (!existing.recurrenceFrequency) {
				const deletedCount = await deleteEventById(id, userId);
				if (deletedCount === 0) {
					return json({ error: 'Event not found' }, { status: 404 });
				}
				return json({ success: true });
			}

			const originalDate = normalizeOccurrence(body.occurrenceDate);
			if (!originalDate) {
				return json({ error: 'A valid occurrenceDate is required' }, { status: 400 });
			}
			await upsertException({
				eventId: id,
				originalDate,
				isCancelled: true
			});
			return json({ success: true });
		}

		const deletedCount = await deleteEventById(id, userId);
		if (deletedCount === 0) {
			return json({ error: 'Event not found' }, { status: 404 });
		}
		await db.delete(eventExceptions).where(eq(eventExceptions.eventId, id));
		return json({ success: true });
	} catch (error) {
		console.error('Failed to delete event:', error);
		return json({ error: 'Failed to delete event' }, { status: 500 });
	}
};
