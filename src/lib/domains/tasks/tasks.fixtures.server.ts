/**
 * Row builders for the tasks module's db tests: the Task, Family, category and
 * phone-session rows the goldens and service tests need, in one home (so a
 * schema change updates one file). Kernel seeds only users.
 * Doc: ./README.md#how-to-test
 */
import type { Db } from '$lib/kernel/db/database.server';
import {
	families,
	familyMembers,
	taskCategories,
	taskfocusSessions,
	tasks
} from '$lib/kernel/db/tables.server';

export async function seedFamily(db: Db, name = 'Home') {
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

export async function seedCategory(db: Db, userId: string, name: string) {
	const [row] = await db.insert(taskCategories).values({ userId, name }).returning();
	return row;
}

export async function seedSession(
	db: Db,
	values: Omit<typeof taskfocusSessions.$inferInsert, 'userId' | 'taskId'> & {
		userId: string;
		taskId: string;
	}
) {
	const [row] = await db.insert(taskfocusSessions).values(values).returning();
	return row;
}
