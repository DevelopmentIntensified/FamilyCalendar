// Families list — every Family the user is a Family Member of, with the one
// stat that answers "is this family actually in use" and the plan usage the
// pill reads (issue 098: this loader used to answer with the member's FIRST
// `familyMembers` row, so a two-family user only ever saw one of them).
import { getUserFamilyMemberships } from '$lib/server/db/actions/families';
import { getUserSubscriptionLimits } from '$lib/server/services/subscriptionService';
import { db } from '$lib/server/db';
import { tasks } from '$lib/server/db/schema';
import { and, count, inArray, isNull } from 'drizzle-orm';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals }) => {
	const memberships = await getUserFamilyMemberships(locals.user.id);
	const familyIds = memberships.map((m) => m.family.id);

	// The card's stat: open Family Tasks per family — ONE grouped query for the
	// whole page, never one query per card (issue 078). "Open" is the Family
	// Task Board's own definition: not completed, not archived. Tasks are one
	// row each (Recurring Tasks included — no occurrence expansion), so the
	// count is honest rather than a raw event-row artefact.
	const openTaskRows = familyIds.length
		? await db
				.select({ familyId: tasks.familyId, openTasks: count() })
				.from(tasks)
				.where(
					and(
						inArray(tasks.familyId, familyIds),
						isNull(tasks.completedAt),
						isNull(tasks.archivedAt)
					)
				)
				.groupBy(tasks.familyId)
		: [];
	const openTasksByFamily = new Map(openTaskRows.map((row) => [row.familyId, row.openTasks]));

	// Plan usage for the pill — the same familyLimit the create gate enforces,
	// counted the same way (family Memberships, not families created).
	const { familyLimit } = await getUserSubscriptionLimits(locals.user.id);

	return {
		families: memberships.map((m) => ({
			...m.family,
			memberCount: m.memberCount,
			openTasks: openTasksByFamily.get(m.family.id) ?? 0
		})),
		plan: { used: familyIds.length, limit: familyLimit }
	};
};
