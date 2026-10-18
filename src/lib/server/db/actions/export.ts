import { eq, inArray, or } from 'drizzle-orm';
import { db } from '$lib/server/db';
import {
	bills,
	eventAttendance,
	eventExceptions,
	events,
	families,
	familyMembers,
	groceryItems,
	notifications,
	receiptItems,
	subscriptions,
	taskCompletions,
	taskTags,
	tasks,
	users,
	userSettings
} from '$lib/server/db/schema';
import type { Family, FamilyMember, User } from '$lib/server/db/schema';

/**
 * GDPR export (#189): assembles every table that stores data the requester
 * owns or their family exposes to them, as one plain JSON-shaped document.
 *
 * Scope decisions (see docs/guides/data-retention.md):
 * - `users.passwordHash` is never selected — a credential, not user data.
 * - Other family members appear as names only (id/firstName/lastName):
 *   the minimum needed to identify who shares calendars/tasks with you.
 * - Auth-mechanical tables are excluded: `auth_session`, `auth_account`,
 *   `apiTokens`,
 *   `pushSubscriptions`, `claimTokens`, `codes`; also `adConsentRecords` and
 *   `aiUsageTracking` (consent/usage rows, no user content).
 */

const EXPORT_VERSION = 1 as const;

/** Exported family context: my membership row, family basics, and the other
 * members' names only. */
export interface ExportedFamily {
	family: Pick<Family, 'id' | 'name' | 'color' | 'createdAt'>;
	membership: FamilyMember;
	otherMembers: Pick<User, 'id' | 'firstName' | 'lastName'>[];
}

/** Everything the export route streams for one user, keyed by table. */
export interface UserDataExport {
	version: typeof EXPORT_VERSION;
	generatedAt: string;
	account: Omit<User, 'passwordHash'>;
	settings: (typeof userSettings.$inferSelect)[];
	subscriptions: (typeof subscriptions.$inferSelect)[];
	families: ExportedFamily[];
	events: (typeof events.$inferSelect)[];
	eventAttendance: (typeof eventAttendance.$inferSelect)[];
	eventExceptions: (typeof eventExceptions.$inferSelect)[];
	tasks: (typeof tasks.$inferSelect)[];
	taskTags: (typeof taskTags.$inferSelect)[];
	taskCompletions: (typeof taskCompletions.$inferSelect)[];
	bills: (typeof bills.$inferSelect)[];
	receiptItems: (typeof receiptItems.$inferSelect)[];
	groceryItems: (typeof groceryItems.$inferSelect)[];
	notifications: (typeof notifications.$inferSelect)[];
}

export async function buildUserDataExport(userId: string): Promise<UserDataExport> {
	// Destructuring strips the password hash from the user row in one place —
	// the credential must not reach the response body.
	const [self] = await db.select().from(users).where(eq(users.id, userId));
	if (!self) {
		throw new Error(`Export requested for missing user ${userId}`);
	}
	const { passwordHash: _dropped, ...account } = self;
	void _dropped;

	const [settings, subscriptionRows, memberships, groceryRows, notificationRows] =
		await Promise.all([
			db.select().from(userSettings).where(eq(userSettings.userId, userId)),
			db.select().from(subscriptions).where(eq(subscriptions.userId, userId)),
			db.select().from(familyMembers).where(eq(familyMembers.userId, userId)),
			db.select().from(groceryItems).where(eq(groceryItems.userId, userId)),
			db.select().from(notifications).where(eq(notifications.userId, userId))
		]);

	// Tasks the user created OR was assigned. Completions count when the user
	// is the attributed owner or the acting user (actorId).
	const taskRows = await db
		.select()
		.from(tasks)
		.where(or(eq(tasks.userId, userId), eq(tasks.assignedTo, userId)));

	const myCompletionRows = await db
		.select()
		.from(taskCompletions)
		.where(or(eq(taskCompletions.userId, userId), eq(taskCompletions.actorId, userId)));

	const taskTagRows = taskRows.length
		? await db
				.select()
				.from(taskTags)
				.where(inArray(taskTags.taskId, taskRows.map((task) => task.id)))
		: [];

	// Attendance rows: my own (userId set). Events: the ones I own or that
	// appear in my attendance rows plus any event my exported tasks point at.
	const myAttendanceRows = await db
		.select()
		.from(eventAttendance)
		.where(eq(eventAttendance.userId, userId));

	const eventIds = new Set<string>();
	for (const attendance of myAttendanceRows) if (attendance.eventId) eventIds.add(attendance.eventId);
	for (const task of taskRows) if (task.eventId) eventIds.add(task.eventId);

	// inArray forbids empty arrays — no attended/task events means owner-only.
	const eventRows = eventIds.size
		? await db
				.select()
				.from(events)
				.where(or(eq(events.ownerId, userId), inArray(events.id, [...eventIds])))
		: await db.select().from(events).where(eq(events.ownerId, userId));

	for (const event of eventRows) if (event.id) eventIds.add(event.id);

	const exceptionRows = eventIds.size
		? await db
				.select()
				.from(eventExceptions)
				.where(inArray(eventExceptions.eventId, [...eventIds]))
		: [];

	// Family basics for each of my memberships; sibling members come as names.
	const familyIds = [...new Set(memberships.map((membership) => membership.familyId))];
	const familyRows = familyIds.length
		? await db.select().from(families).where(inArray(families.id, familyIds))
		: [];

	const allMemberRows = familyIds.length
		? await db
				.select()
				.from(familyMembers)
				.where(inArray(familyMembers.familyId, familyIds))
		: [];
	const otherMemberIds = [
		...new Set(
			allMemberRows.filter((member) => member.userId !== userId).map((member) => member.userId)
		)
	];
	const otherMemberRows = otherMemberIds.length
		? await db
				.select({
					id: users.id,
					firstName: users.firstName,
					lastName: users.lastName
				})
				.from(users)
				.where(inArray(users.id, otherMemberIds))
		: [];
	const nameById = new Map(otherMemberRows.map((member) => [member.id, member]));
	// Names only, enforced here too: even if the SELECT projection were
	// widened later, richer fields must not leak into the export.
	const toNamesOnly = (member: Pick<User, 'id' | 'firstName' | 'lastName'>) => ({
		id: member.id,
		firstName: member.firstName,
		lastName: member.lastName
	});

	const exportedFamilies: ExportedFamily[] = familyRows.map((family) => {
		const membership = memberships.find((row) => row.familyId === family.id) ?? memberships[0];
		return {
			family: {
				id: family.id,
				name: family.name,
				color: family.color,
				createdAt: family.createdAt
			},
			membership,
			otherMembers: allMemberRows
				.filter((member) => member.familyId === family.id && member.userId !== userId)
				.flatMap((member) => {
					const named = nameById.get(member.userId);
					return named ? [toNamesOnly(named)] : [];
				})
		};
	});

	// Receipt line items belong to my bills only.
	const billRows = await db.select().from(bills).where(eq(bills.userId, userId));
	const receiptItemRows = billRows.length
		? await db
				.select()
				.from(receiptItems)
				.where(inArray(receiptItems.billId, billRows.map((bill) => bill.id)))
		: [];

	return {
		version: EXPORT_VERSION,
		generatedAt: new Date().toISOString(),
		account,
		settings,
		subscriptions: subscriptionRows,
		families: exportedFamilies,
		events: eventRows,
		eventAttendance: myAttendanceRows,
		eventExceptions: exceptionRows,
		tasks: taskRows,
		taskTags: taskTagRows,
		taskCompletions: myCompletionRows,
		bills: billRows,
		receiptItems: receiptItemRows,
		groceryItems: groceryRows,
		notifications: notificationRows
	};
}
