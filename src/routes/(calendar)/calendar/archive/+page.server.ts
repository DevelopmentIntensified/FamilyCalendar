import { redirect } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import { db } from '$lib/server/db';
import { events, calendars } from '$lib/server/db/schema';
import { eq, and, lte, isNull } from 'drizzle-orm';
import { getUserFamilyId, getUserFamilyMemberships } from '$lib/server/db/actions/families';
import {
	canViewArchive,
	getUserSubscriptionLimits,
	getSubscriptionStatus
} from '$lib/server/services/subscriptionService';

export const load: PageServerLoad = async ({ locals }) => {
	if (!locals.user) {
		throw redirect(302, '/login');
	}

	const userId = locals.user.id;
	// 125: read the plan's windows ONCE, before the gate branch. The gated
	// branch used to hand back a hardcoded `retentionDays: 30`, which the page
	// printed as "Events from 30 days ago" — a number no plan ever produced.
	// A gate that misreports its own size is not a gate, it is a rumour.
	// 094: the plan NAME and the family count ride along too — the approved
	// page states the gate as "On the Family plan · 1 family", so the gate can
	// be told which plan it is rather than only how big it is.
	const [limits, archiveCheck, subscription] = await Promise.all([
		getUserSubscriptionLimits(userId),
		canViewArchive(userId),
		// Display-only, like everywhere else on the account page: a failure
		// here must not take the archive down with it.
		getSubscriptionStatus(userId).catch((error) => {
			console.error('Failed to load plan name for the archive gate:', error);
			return null;
		})
	]);
	const planName = subscription?.tier?.displayName ?? 'Free';
	// The gate's family count is THIS user's families, so the memberships are
	// the count — `getFamiliesCount()` counts every family in the database and
	// would put a stranger's families on the pill.
	const [familyId, memberships] = await Promise.all([
		getUserFamilyId(userId),
		getUserFamilyMemberships(userId).catch((error) => {
			console.error('Failed to load family memberships for the archive gate:', error);
			return [];
		})
	]);

	const gate = {
		planName,
		familyCount: memberships.length,
		retentionDays: limits.retentionViewDays,
		archivedRetentionDays: limits.archivedRetentionDays
	};

	if (!archiveCheck.allowed) {
		return {
			events: [],
			archiveAllowed: false,
			reason: archiveCheck.reason,
			...gate
		};
	}

	const cutoffDate = new Date();
	cutoffDate.setDate(cutoffDate.getDate() - limits.retentionViewDays);

	const userCalendar = await db
		.select()
		.from(calendars)
		.where(and(eq(calendars.ownerId, userId), isNull(calendars.familyId)));

	const userCalendarEvents =
		userCalendar.length > 0
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

	const memberFamilyId = familyId;

	let familyCalendarEvents: (typeof events.$inferSelect)[] = [];
	let familyCalendars: (typeof calendars.$inferSelect)[] = [];
	if (memberFamilyId) {
		familyCalendars = await db
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

	// 094: the approved row badges which calendar an event came from. The
	// `calendars` table carries no name and no colour - only ownerId and
	// familyId - so both are derived here exactly as the account page derives
	// them, rather than read from columns that do not exist. A badge with no
	// colour falls back to neutral styling on the page.
	const familyNameById = new Map(memberships.map((m) => [m.family.id, m.family.name]));
	const calendarLabel = new Map<string, string>(
		[...userCalendar, ...familyCalendars].map((c) => [
			c.id,
			c.familyId
				? (familyNameById.get(c.familyId) ?? 'Family calendar')
				: 'Personal calendar'
		])
	);

	const allEvents = [...userCalendarEvents, ...familyCalendarEvents].map((e) => ({
		...e,
		start: new Date(e.start),
		end: e.end === null ? new Date(0) : new Date(e.end),
		// A row with no calendarId at all is real (the column is nullable), and
		// it gets no badge rather than one guessed from the row next to it.
		calendar: e.calendarId ? (calendarLabel.get(e.calendarId) ?? null) : null
	}));

	return {
		events: allEvents,
		archiveAllowed: true,
		...gate
	};
};
