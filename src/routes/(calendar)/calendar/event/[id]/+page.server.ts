import type { PageServerLoad } from './$types';
import { db } from '$lib/server/db';
import { events } from '$lib/server/db/schema';
import { eq } from 'drizzle-orm';

export const load: PageServerLoad = async (e) => {
	//get the event data
	const eventsData = await db
		.select()
		.from(events)
		.where(eq(events.id, e.params.id))
		.orderBy(events.start);

	//change to js date
	return {
		event: eventsData.map((e) => ({
			date: new Date(e.start),
			...e,
			start: new Date(e.start),
			end: new Date(e.end)
		}))[0]
	};
};
