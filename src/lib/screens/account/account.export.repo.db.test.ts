/**
 * The export's reads against real Postgres: every slice filters to the
 * requester, the person row comes back whole (the hash is stripped later, by
 * the rules), and a member's tag/completion rows never ride along with someone
 * else's task.
 *
 * Seeds the owning domains' rows directly (this screen owns no tables).
 *
 * Doc: ./README.md#how-to-test
 */
import { describe, expect } from 'vitest';
import { userSettings } from '$lib/kernel/db/tables/identity.tables.server';
import { subscriptions } from '$lib/kernel/db/tables/billing.tables.server';
import { notifications } from '$lib/kernel/db/tables/alerts.tables.server';
import { taskCompletions, taskTags, tasks } from '$lib/kernel/db/tables/tasks.tables.server';
import { bills, receiptItems } from '$lib/kernel/db/tables/bills.tables.server';
import { groceryItems } from '$lib/kernel/db/tables/groceries.tables.server';
import type { Db } from '$lib/kernel/db/database.server';
import { seedUser } from '$lib/kernel/testing/seedRows.server';
import { rollbackTest } from '$lib/kernel/testing/testDb.server';
import {
	readExportBills,
	readExportGroceries,
	readExportNotifications,
	readExportPerson,
	readExportSettings,
	readExportSubscriptions,
	readExportTasks
} from './account.export.repo.server';

/** The caller's own settings row plus a stranger's, for the scoping assertions. */
async function seedTwoAccounts(db: Db) {
	const mine = await seedUser(db, { firstName: 'Ada' });
	const theirs = await seedUser(db, { firstName: 'Bob' });
	await db.insert(userSettings).values([{ userId: mine.id }, { userId: theirs.id }]);
	await db.insert(subscriptions).values([
		{
			userId: mine.id,
			endDate: new Date('2027-01-01T00:00:00.000Z'),
			notificationMethods: { email: true, sms: false }
		},
		{
			userId: theirs.id,
			endDate: new Date('2027-01-01T00:00:00.000Z'),
			notificationMethods: { email: false, sms: true }
		}
	]);
	return { mine, theirs };
}

describe('readExportPerson', () => {
	rollbackTest('answers the whole users row, credential included for the rules to strip', async (db) => {
		const person = await seedUser(db, { firstName: 'Ada', lastName: 'Lovelace' });
		expect(await readExportPerson(db, person.id)).toEqual(person);
	});

	rollbackTest('answers null when the row is gone', async (db) => {
		expect(await readExportPerson(db, 'missing-user')).toBeNull();
	});
});

describe('the requester-scoped slices', () => {
	rollbackTest('settings and subscriptions carry only the requester rows', async (db) => {
		const { mine, theirs } = await seedTwoAccounts(db);
		expect((await readExportSettings(db, mine.id)).map((row) => row.userId)).toEqual([mine.id]);
		expect((await readExportSubscriptions(db, mine.id)).map((row) => row.userId)).toEqual([mine.id]);
		expect(await readExportSettings(db, theirs.id)).toHaveLength(1);
	});

	rollbackTest('tasks carry what the requester owns or was assigned, with their tags and completions', async (db) => {
		const { mine, theirs } = await seedTwoAccounts(db);
		const [owned] = await db.insert(tasks).values({ title: 'Mine', userId: mine.id }).returning();
		const [handoff] = await db
			.insert(tasks)
			.values({ title: 'Handoff', userId: theirs.id, assignedTo: mine.id })
			.returning();
		const [stranger] = await db
			.insert(tasks)
			.values({ title: 'Theirs', userId: theirs.id })
			.returning();
		await db.insert(taskTags).values([
			{ taskId: owned.id, name: 'mine' },
			{ taskId: stranger.id, name: 'theirs' }
		]);
		await db
			.insert(taskCompletions)
			.values({ taskId: owned.id, userId: mine.id, actorId: mine.id });

		const slice = await readExportTasks(db, mine.id);
		expect(slice.taskRows.map((task) => task.id).sort()).toEqual([owned.id, handoff.id].sort());
		expect(slice.tagRows.map((tag) => tag.name)).toEqual(['mine']);
		expect(slice.completionRows.map((row) => row.taskId)).toEqual([owned.id]);
	});

	rollbackTest('bills carry their own receipt lines only', async (db) => {
		const { mine, theirs } = await seedTwoAccounts(db);
		const [myBill] = await db
			.insert(bills)
			.values({ title: 'Rent', amountCents: 1000, userId: mine.id })
			.returning();
		const [theirBill] = await db
			.insert(bills)
			.values({ title: 'Theirs', amountCents: 5, userId: theirs.id })
			.returning();
		await db.insert(receiptItems).values([
			{ billId: myBill.id, label: 'Milk', priceCents: 250 },
			{ billId: theirBill.id, label: 'Eggs', priceCents: 100 }
		]);

		const slice = await readExportBills(db, mine.id);
		expect(slice.billRows.map((bill) => bill.id)).toEqual([myBill.id]);
		expect(slice.receiptItemRows.map((row) => row.label)).toEqual(['Milk']);
	});

	rollbackTest('groceries and notifications carry only the requester rows', async (db) => {
		const { mine, theirs } = await seedTwoAccounts(db);
		await db.insert(groceryItems).values([
			{ userId: mine.id, name: 'Milk', nameKey: 'milk' },
			{ userId: theirs.id, name: 'Eggs', nameKey: 'eggs' }
		]);
		await db.insert(notifications).values([
			{ userId: mine.id, type: 'task_assigned', actorName: 'Bob', message: 'Mine' },
			{ userId: theirs.id, type: 'task_assigned', actorName: 'Ada', message: 'Theirs' }
		]);

		expect((await readExportGroceries(db, mine.id)).map((row) => row.name)).toEqual(['Milk']);
		expect((await readExportNotifications(db, mine.id)).map((row) => row.message)).toEqual([
			'Mine'
		]);
	});
});
