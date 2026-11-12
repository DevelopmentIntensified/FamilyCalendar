/**
 * alerts — row builders for this module's db tests. Kernel seeds only users;
 * these write the tables the goldens and repo tests read back.
 *
 * They insert directly instead of calling the module's services because a real
 * Alert write fires push, and no test may contact a push service.
 * Doc: ./README.md#how-to-test
 */
import { deviceTokens, notifications, subscriptions } from '$lib/kernel/db/tables.server';
import { testDb } from '$lib/kernel/testing/testDb.server';

type NewAlert = typeof notifications.$inferInsert;
type AlertRow = typeof notifications.$inferSelect;
type NotificationMethods = typeof subscriptions.$inferInsert.notificationMethods;

/** One Alert row, with the common type/actor/message unless overridden. */
export async function seedAlert(
	overrides: Partial<NewAlert> & { userId: string }
): Promise<AlertRow> {
	const [row] = await testDb()
		.insert(notifications)
		.values({
			type: 'task_completed',
			actorName: 'Sam',
			message: 'completed the bins',
			...overrides
		})
		.returning();
	return row;
}

/** One registered FCM token for a user. */
export async function seedDeviceToken(userId: string, token: string): Promise<void> {
	await testDb().insert(deviceTokens).values({ userId, token });
}

/**
 * One `activeSubscriptions` row, i.e. the billing row the preference switches
 * read: tierless and unexpired unless the test overrides either.
 */
export async function seedAlertPreferencesRow(
	userId: string,
	notificationMethods: NotificationMethods,
	overrides: Partial<typeof subscriptions.$inferInsert> = {}
): Promise<void> {
	await testDb()
		.insert(subscriptions)
		.values({
			userId,
			notificationMethods,
			subscriptionTypeId: null,
			endDate: new Date('9999-12-31T00:00:00.000Z'),
			...overrides
		});
}
