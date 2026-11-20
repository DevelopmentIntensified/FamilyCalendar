/**
 * alerts — row builders for this module's db tests. Kernel seeds only users;
 * these write the tables the goldens and repo tests read back.
 *
 * They insert directly instead of calling the module's services because a real
 * Alert write fires push, and no test may contact a push service.
 *
 * The last parameter is the `Db` to write through. It defaults to the committed
 * test database (what the golden `alerts.http.db.test.ts` runs on); a
 * `rollbackTest` passes its own transaction.
 *
 * Doc: ./README.md#how-to-test
 */
import type { Db } from '$lib/kernel/db/database.server';
import {
	deviceTokens,
	notifications,
	pushSubscriptions,
	subscriptions,
	type DeviceTokenRow,
	type NotificationRow,
	type PushSubscriptionRow
} from '$lib/kernel/db/tables.server';
import { testDb } from '$lib/kernel/testing/testDb.server';

type NewAlert = typeof notifications.$inferInsert;
type NewPushSubscription = typeof pushSubscriptions.$inferInsert;
type NewDeviceToken = typeof deviceTokens.$inferInsert;
type NotificationMethods = typeof subscriptions.$inferInsert.notificationMethods;

/** One Alert row, with the common type/actor/message unless overridden. */
export async function seedAlert(
	overrides: Partial<NewAlert> & { userId: string },
	db: Db = testDb()
): Promise<NotificationRow> {
	const [row] = await db
		.insert(notifications)
		.values({
			type: 'task_completed',
			actorName: 'Sam',
			message: 'completed the bins',
			...overrides
		})
		.returning();
	if (!row) throw new Error('seedAlert: insert returned no row');
	return row;
}

/** One registered FCM token for a user; `overrides` set the platform or the stamps. */
export async function seedDeviceToken(
	userId: string,
	token: string,
	overrides: Partial<NewDeviceToken> = {},
	db: Db = testDb()
): Promise<DeviceTokenRow> {
	const [row] = await db
		.insert(deviceTokens)
		.values({ userId, token, ...overrides })
		.returning();
	if (!row) throw new Error('seedDeviceToken: insert returned no row');
	return row;
}

/** One Web Push subscription for a user, with readable default keys. */
export async function seedPushSubscription(
	userId: string,
	endpoint: string,
	overrides: Partial<NewPushSubscription> = {},
	db: Db = testDb()
): Promise<PushSubscriptionRow> {
	const [row] = await db
		.insert(pushSubscriptions)
		.values({ userId, endpoint, p256dh: 'p256dh-key', auth: 'auth-key', ...overrides })
		.returning();
	if (!row) throw new Error('seedPushSubscription: insert returned no row');
	return row;
}

/**
 * One `activeSubscriptions` row, i.e. the billing row the preference switches
 * read: tierless and unexpired unless the test overrides either. Returns its id.
 */
export async function seedAlertPreferencesRow(
	userId: string,
	notificationMethods: NotificationMethods,
	overrides: Partial<typeof subscriptions.$inferInsert> = {},
	db: Db = testDb()
): Promise<string> {
	const [row] = await db
		.insert(subscriptions)
		.values({
			userId,
			notificationMethods,
			subscriptionTypeId: null,
			endDate: new Date('9999-12-31T00:00:00.000Z'),
			...overrides
		})
		.returning({ id: subscriptions.id });
	if (!row) throw new Error('seedAlertPreferencesRow: insert returned no row');
	return row.id;
}
