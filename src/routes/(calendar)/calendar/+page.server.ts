// Intl.DateTimeFormat().resolvedOptions().timeZone
import { getUserSettings } from '$lib/server/db/actions/userSettings';
import type { PageServerLoad } from './$types';
import { db } from '$lib/server/db';
import { events } from '$lib/server/db/schema';
import { formatDate } from '$lib/utils/dateUtils';

export const load: PageServerLoad = async (event) => {
	let userSettings = await getUserSettings(event.locals.user.id);
	const eventsData = await db.select().from(events).orderBy(events.start);
	const oneDay = 24 * 60 * 60 * 1000; // hours*minutes*seconds*milliseconds
	const events2 = eventsData.flatMap((e) => {
		e.start = new Date(e.start);
		e.end = new Date(e.end);
		if (e.start.getDate() === e.end.getDate()) {
			return {
				date: e.start,
				...e
			};
		}
		const diffDays = Math.round(Math.abs((e.start.getTime() - e.end.getTime()) / oneDay));
		const days = [];

		for (let i = 0; i <= diffDays; i++) {
			days.push({
				date: new Date(e.start.getTime() + oneDay * i),
				...e
			});
		}

		return days;
	});
	console.log(events2);

	return {
		events: events2,
		userSettings
	};
};
