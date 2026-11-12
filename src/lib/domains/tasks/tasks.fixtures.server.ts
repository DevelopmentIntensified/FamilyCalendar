/**
 * Row builders for the tasks module's db tests: the Task, Family, category,
 * tag, completion, command, phone-session and user-zone rows the goldens and
 * service tests need, in one home (so a schema change updates one file).
 * Kernel seeds only users; a test never inserts one of this module's rows
 * directly. Doc: ./README.md#how-to-test
 */
import type { Db } from '$lib/kernel/db/database.server';
import {
	families,
	familyMembers,
	taskCategories,
	taskCompletions,
	taskfocusCommands,
	taskfocusSessions,
	tasks,
	taskTags,
	userSettings
} from '$lib/kernel/db/tables.server';

export async function seedTaskFamily(db: Db, name = 'Home') {
	const [row] = await db.insert(families).values({ name }).returning();
	return row;
}

export async function addMember(
	db: Db,
	userId: string,
	familyId: string,
	role = 'member',
	memberType = 'member'
) {
	await db.insert(familyMembers).values({ userId, familyId, role, memberType });
}

export async function seedTask(
	db: Db,
	values: Omit<typeof tasks.$inferInsert, 'title' | 'userId'> & { title: string; userId: string }
) {
	const [row] = await db.insert(tasks).values(values).returning();
	return row;
}

export async function seedTaskCategory(db: Db, userId: string, name: string) {
	const [row] = await db.insert(taskCategories).values({ userId, name }).returning();
	return row;
}

/** A task's tag rows, inserted in the order given (so a test can prove the
 *  wire sorts them rather than echoing the write order). */
export async function seedTaskTags(db: Db, taskId: string, names: readonly string[]) {
	if (names.length === 0) return;
	await db.insert(taskTags).values(names.map((name) => ({ taskId, name })));
}

/** One completion-history row; `completedAt` is explicit in every test that
 *  reads it back, because the column defaults to now(). */
export async function seedTaskCompletion(
	db: Db,
	values: Omit<typeof taskCompletions.$inferInsert, 'taskId' | 'userId'> & {
		taskId: string;
		userId: string;
	}
) {
	const [row] = await db.insert(taskCompletions).values(values).returning();
	return row;
}

export async function seedTaskFocusSession(
	db: Db,
	values: Omit<typeof taskfocusSessions.$inferInsert, 'userId' | 'taskId'> & {
		userId: string;
		taskId: string;
	}
) {
	const [row] = await db.insert(taskfocusSessions).values(values).returning();
	return row;
}

/** Queued device commands, inserted in the order given (the FIFO read sorts
 *  by `issuedAt`, not by insert order). */
export async function seedTaskFocusCommands(
	db: Db,
	rows: readonly (typeof taskfocusCommands.$inferInsert)[]
) {
	if (rows.length === 0) return;
	await db.insert(taskfocusCommands).values([...rows]);
}

/** The caller's stored time zone (identity's `userSettings` row), which the
 *  cursor pin and the cursor advance read. */
export async function seedUserZone(db: Db, userId: string, timeZone: string) {
	await db.insert(userSettings).values({ userId, timeZone });
}
