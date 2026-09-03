import { fail } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import { db } from '$lib/server/db';
import { calendars, events } from '$lib/server/db/schema';
import { eq, and, or } from 'drizzle-orm';
import { getUserFamilyId } from '$lib/server/db/actions/families';
import { parseIcs } from '$lib/server/services/icsImportService';
import { createEvent } from '$lib/server/db/actions/events';

export const load: PageServerLoad = async (event) => {
	if (!event.locals.user) {
		return { calendars: [] };
	}
	const userId = event.locals.user.id;
	const userCals = await db.select().from(calendars).where(eq(calendars.ownerId, userId));
	let list = userCals.map((c) => ({ id: c.id, name: 'Personal Calendar' }));

	const memberFamilyId = await getUserFamilyId(userId);
	if (memberFamilyId) {
		const famCals = await db.select().from(calendars).where(eq(calendars.familyId, memberFamilyId));
		list = [...list, ...famCals.map((c) => ({ id: c.id, name: 'Family Calendar' }))];
	}

	return { calendars: list };
};

const MAX_FILE_BYTES = 5 * 1024 * 1024;

export const actions: Actions = {
	default: async ({ request, locals }) => {
		if (!locals.user) return fail(401, { error: 'Not signed in' });
		const userId = locals.user.id;

		const formData = await request.formData();
		const file = formData.get('file');
		const calendarId = formData.get('calendarId') as string;

		if (!calendarId) return fail(400, { error: 'Choose a calendar to import into.' });
		if (!(file instanceof File) || file.size === 0) {
			return fail(400, { error: 'Choose an .ics file to import.' });
		}
		if (file.size > MAX_FILE_BYTES) {
			return fail(400, { error: 'File is larger than 5 MB.' });
		}

		// Ownership check: calendar must belong to the user or their family.
		const memberFamilyId = await getUserFamilyId(userId);
		const [targetCal] = await db
			.select()
			.from(calendars)
			.where(
				and(
					eq(calendars.id, calendarId),
					memberFamilyId
						? or(eq(calendars.ownerId, userId), eq(calendars.familyId, memberFamilyId))
						: eq(calendars.ownerId, userId)
				)
			);
		if (!targetCal) return fail(403, { error: 'That calendar is not yours to import into.' });

		let text: string;
		try {
			text = await file.text();
		} catch {
			return fail(400, { error: 'Could not read that file.' });
		}

		const drafts = parseIcs(text);
		if (drafts.length === 0) {
			return fail(400, { error: 'No events found in that file. Is it a valid .ics export?' });
		}

		// Dedupe against what is already in this calendar (title + exact start).
		const existingRows = await db
			.select({ title: events.title, start: events.start })
			.from(events)
			.where(eq(events.calendarId, calendarId));
		const existingKeys = new Set(existingRows.map((r) => `${r.title.toLowerCase()}|${new Date(r.start).toISOString()}`));

		const seenInFile = new Set<string>();
		let imported = 0;
		let skippedDuplicates = 0;
		for (const draft of drafts) {
			const key = `${draft.title.toLowerCase()}|${draft.startIso}`;
			if (existingKeys.has(key) || seenInFile.has(key)) {
				skippedDuplicates++;
				continue;
			}
			seenInFile.add(key);
			try {
				await createEvent({
					calendarId,
					ownerId: userId,
					title: draft.title,
					start: draft.startIso,
					end: draft.endIso,
					description: draft.description,
					location: draft.location,
					allDay: draft.allDay,
					recurrenceFrequency: draft.recurrenceFrequency,
					recurrenceInterval: draft.recurrenceInterval,
					recurrenceByDay: draft.recurrenceByDay,
					recurrenceCount: draft.recurrenceCount
				}, userId);
				imported++;
			} catch (e) {
				console.error('Failed to import event:', e);
			}
		}

		return { success: true, imported, skippedDuplicates, parsed: drafts.length };
	}
};
