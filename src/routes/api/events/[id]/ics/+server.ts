import { apiError } from '$lib/server/utils/apiError';
import type { RequestHandler } from './$types';
import { getEvent, findException } from '$lib/server/db/actions/events';
import { canTouchEvent } from '$lib/server/db/actions/calendarScope';
import { resolveOccurrenceId } from '$lib/server/utils/eventIds';
import {
	buildIcsCalendar,
	buildIcsEvent,
	icsFilename,
	type IcsEventInput,
	type IcsRecurrence
} from '$lib/utils/ics';

/**
 * GET /api/events/[id]/ics — download a single event as an .ics attachment
 * (issue 028). `id` may be a master id or the composite display id
 * (`master~occurrenceISO`): for a scope-'this' exception the exception
 * instance's fields are exported as one VEVENT; otherwise the series (or
 * the lone event) is exported with its RRULE. Any viewer who can see the
 * event can export it — read-only semantics for family events.
 */
export const GET: RequestHandler = async ({ locals, params }) => {
	if (!locals.user) {
		return new Response('Unauthorized', { status: 401 });
	}

	const resolved = resolveOccurrenceId(params.id);
	if (!resolved) {
		return new Response('Invalid event id', { status: 400 });
	}
	const id = resolved.masterId;

	try {
		const [event, access] = await Promise.all([getEvent(id), canTouchEvent(locals.user.id, id)]);
		if (!event || access === 'not-found') {
			return new Response('Event not found', { status: 404 });
		}
		if (access === 'forbidden') {
			return new Response('Event not accessible', { status: 403 });
		}

		const recurrence: IcsRecurrence = {
			recurrenceFrequency: event.recurrenceFrequency,
			recurrenceInterval: event.recurrenceInterval,
			recurrenceByDay: event.recurrenceByDay,
			recurrenceCount: event.recurrenceCount,
			recurrenceUntil: event.recurrenceUntil
		};

		let input: IcsEventInput = {
			id: event.id,
			title: event.title,
			start: event.start,
			end: event.end,
			allDay: event.allDay,
			description: event.description,
			location: event.location,
			recurrence: event.recurrenceFrequency ? recurrence : null
		};

		// Composite occurrence id on a recurring series: an explicit
		// scope-'this' exception overrides the series fields (single VEVENT);
		// a cancelled occurrence has nothing to export.
		if (resolved.occurrenceIso && event.recurrenceFrequency) {
			const exception = await findException(id, resolved.occurrenceIso);
			if (exception?.isCancelled) {
				return new Response('Event not found', { status: 404 });
			}
			if (exception) {
				input = {
					id: event.id,
					title: exception.title ?? event.title,
					start: exception.start ?? event.start,
					end: exception.end ?? event.end,
					allDay: exception.allDay ?? event.allDay,
					description: exception.description ?? event.description,
					location: exception.location ?? event.location,
					recurrence: null
				};
			}
		}

		const body = buildIcsCalendar([buildIcsEvent(input)]);
		return new Response(body, {
			headers: {
				'Content-Type': 'text/calendar; charset=utf-8',
				'Content-Disposition': `attachment; filename="${icsFilename(event.title)}"`
			}
		});
	} catch (error) {
		console.error('Failed to build ICS export:', error);
		return apiError(`/api/events/${id}/ics`, 500, 'Failed to export event', locals.user.id);
	}
};
