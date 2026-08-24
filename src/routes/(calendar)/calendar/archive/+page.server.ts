import { redirect } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import { db } from '$lib/server/db';
import { events, calendars } from '$lib/server/db/schema';
import { eq, and, gte, lte, isNull } from 'drizzle-orm';
import { getUserFamilyId } from '$lib/server/db/actions/families';
import { canViewArchive, getUserSubscriptionLimits } from '$lib/server/services/subscriptionService';

export const load: PageServerLoad = async ({ locals }) => {
	if (!locals.user) {
		throw redirect(302, '/login');
	}

	const userId = locals.user.id;
	const archiveCheck = await canViewArchive(userId);

	if (!archiveCheck.allowed) {
		return {
			events: [],
			archiveAllowed: false,
			reason: archiveCheck.reason,
			retentionDays: 30
		};
	}

	const limits = await getUserSubscriptionLimits(userId);
	const cutoffDate = new Date();
	cutoffDate.setDate(cutoffDate.getDate() - limits.retentionViewDays);

	const userCalendar = await db
		.select()
		.from(calendars)
		.where(and(eq(calendars.ownerId, userId), isNull(calendars.familyId)));

	const userCalendarEvents = userCalendar.length > 0
		? await db
			.select()
			.from(events)
			.where(
				and(
					eq(events.calendarId, userCalendar[0].id),
					lte(events.start, cutoffDate.toISOString())
				)
			)
			.orderBy(events.start)
		: [];

	const memberFamilyId = await getUserFamilyId(userId);

	let familyCalendarEvents: (typeof events.$inferSelect)[] = [];
	if (memberFamilyId) {
		const familyCalendars = await db
			.select()
			.from(calendars)
			.where(eq(calendars.familyId, memberFamilyId));

		if (familyCalendars.length > 0) {
			familyCalendarEvents = await db
				.select()
				.from(events)
				.where(
					and(
						eq(events.calendarId, familyCalendars[0].id),
						lte(events.start, cutoffDate.toISOString())
					)
				)
				.orderBy(events.start);
		}
	}

	const allEvents = [...userCalendarEvents, ...familyCalendarEvents].map(e => ({
		...e,
		start: new Date(e.start as unknown as string),
		end: new Date(e.end as unknown as string)
	}));

	return {
		events: allEvents,
		archiveAllowed: true,
		retentionDays: limits.retentionViewDays
	};
};