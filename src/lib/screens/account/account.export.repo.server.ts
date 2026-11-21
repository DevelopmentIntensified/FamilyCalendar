/**
 * The data export's reads (#189).
 *
 * Legacy assembled the document in `src/server/db/actions/export.ts`, reading
 * every table itself. The design (Q-078 A) is one slice service per owning
 * domain, composed here — but no domain exports one yet, and a screen owns no
 * tables (rule R3). Until each slice lands (report ASK), these are the legacy
 * selects, verbatim in scope and order, kept in one file so the day a slice
 * arrives it is a deletion here and a call there.
 *
 * The scope decisions the selects carry (and `account.export.rules.ts` enforces
 * again): the requester's rows only, `users.passwordHash` never selected, other
 * family members as names only, auth-mechanical tables never read.
 *
 * `db` is the first argument (rule R3); time and ids are the caller's.
 *
 * Doc: ./README.md#invariants
 */
import { eq, inArray, or } from 'drizzle-orm';
import type { Db } from '$lib/kernel/db/database.server';
import { users, userSettings } from '$lib/kernel/db/tables/identity.tables.server';
import { subscriptions } from '$lib/kernel/db/tables/billing.tables.server';
import { families, familyMembers } from '$lib/kernel/db/tables/family.tables.server';
import { groceryItems } from '$lib/kernel/db/tables/groceries.tables.server';
import { notifications } from '$lib/kernel/db/tables/alerts.tables.server';
import { taskCompletions, taskTags, tasks } from '$lib/kernel/db/tables/tasks.tables.server';
import { eventAttendance, eventExceptions, events } from '$lib/kernel/db/tables/calendar.tables.server';
import { bills, receiptItems } from '$lib/kernel/db/tables/bills.tables.server';

/** The requester's own person row, or null when the row is gone. */
export async function readExportPerson(db: Db, userId: string) {
	const [person] = await db.select().from(users).where(eq(users.id, userId));
	return person ?? null;
}

/** The requester's settings rows (legacy: every `user_settings` row of theirs). */
export async function readExportSettings(db: Db, userId: string) {
	return await db.select().from(userSettings).where(eq(userSettings.userId, userId));
}

/** The requester's subscription rows. */
export async function readExportSubscriptions(db: Db, userId: string) {
	return await db.select().from(subscriptions).where(eq(subscriptions.userId, userId));
}

/** The requester's own membership rows, then the families and rosters they point at. */
export async function readExportFamilies(db: Db, userId: string) {
	const memberships = await db.select().from(familyMembers).where(eq(familyMembers.userId, userId));
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
	// Names only: even if this projection were widened later, richer fields
	// must not leak into the export.
	const otherMemberRows = otherMemberIds.length
		? await db
				.select({ id: users.id, firstName: users.firstName, lastName: users.lastName })
				.from(users)
				.where(inArray(users.id, otherMemberIds))
		: [];
	return { memberships, familyRows, allMemberRows, otherMemberRows };
}

/**
 * Tasks the requester created OR was assigned, the completions they are
 * attributed to (owner or actor), and those tasks' tags.
 */
export async function readExportTasks(db: Db, userId: string) {
	const taskRows = await db
		.select()
		.from(tasks)
		.where(or(eq(tasks.userId, userId), eq(tasks.assignedTo, userId)));
	const completionRows = await db
		.select()
		.from(taskCompletions)
		.where(or(eq(taskCompletions.userId, userId), eq(taskCompletions.actorId, userId)));
	const tagRows = taskRows.length
		? await db
				.select()
				.from(taskTags)
				.where(
					inArray(
						taskTags.taskId,
						taskRows.map((task) => task.id)
					)
				)
		: [];
	return { taskRows, completionRows, tagRows };
}

/**
 * The requester's attendance rows, then the events they own or are pointed at,
 * then those events' exceptions. `eventIds` starts as attendance ∪ the exported
 * tasks' events (an empty `IN` list is not a query, hence the two shapes).
 */
export async function readExportEvents(
	db: Db,
	userId: string,
	taskEventIds: readonly string[]
) {
	const attendanceRows = await db
		.select()
		.from(eventAttendance)
		.where(eq(eventAttendance.userId, userId));

	const eventIds = new Set<string>(taskEventIds);
	for (const attendance of attendanceRows) {
		if (attendance.eventId) eventIds.add(attendance.eventId);
	}

	const eventRows = eventIds.size
		? await db
				.select()
				.from(events)
				.where(
					or(
						eq(events.ownerId, userId),
						inArray(events.id, [...eventIds])
					)
				)
		: await db.select().from(events).where(eq(events.ownerId, userId));

	for (const event of eventRows) eventIds.add(event.id);

	const exceptionRows = eventIds.size
		? await db
				.select()
				.from(eventExceptions)
				.where(inArray(eventExceptions.eventId, [...eventIds]))
		: [];
	return { attendanceRows, eventRows, exceptionRows };
}

/** The requester's bills and their receipt lines. */
export async function readExportBills(db: Db, userId: string) {
	const billRows = await db.select().from(bills).where(eq(bills.userId, userId));
	const receiptItemRows = billRows.length
		? await db
				.select()
				.from(receiptItems)
				.where(
					inArray(
						receiptItems.billId,
						billRows.map((bill) => bill.id)
					)
				)
		: [];
	return { billRows, receiptItemRows };
}

/** The requester's grocery items. */
export async function readExportGroceries(db: Db, userId: string) {
	return await db.select().from(groceryItems).where(eq(groceryItems.userId, userId));
}

/** The requester's notifications. */
export async function readExportNotifications(db: Db, userId: string) {
	return await db.select().from(notifications).where(eq(notifications.userId, userId));
}
