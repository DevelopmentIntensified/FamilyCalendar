import { db } from '$lib/server/db';
import { subscriptions } from '$lib/server/db/schema';
import { and, desc, eq, isNull, or, sql } from 'drizzle-orm';
import {
	notificationPreferencesFrom,
	withNotificationPreference,
	type NotificationPreferenceId,
	type NotificationPreferences
} from '$lib/components/account/accountNotifications';

/**
 * The account page's Notifications card, persisted.
 *
 * Storage is `activeSubscriptions.notificationMethods` — the `jsonb` column the
 * approved page's note names, which needs no migration because the preferences
 * ride in the sibling `preferences` key beside the billing half. One read, one
 * write; both answer in terms of the four switches so the card never reads the
 * raw column.
 *
 * Which row: the user's newest unexpired one, the same seam
 * `subscriptionService.getActiveSubscriptionRow` uses — newest first, so a
 * renewal does not lose a saved preference. Unlike that helper this does NOT
 * require a tier, because this card creates a tierless row for an account that
 * has none and must be able to read its own write back.
 */
async function findNotificationMethodsRow(
	userId: string
): Promise<{ id: string; notificationMethods: unknown } | null> {
	const [row] = await db
		.select({ id: subscriptions.id, notificationMethods: subscriptions.notificationMethods })
		.from(subscriptions)
		.where(
			and(
				eq(subscriptions.userId, userId),
				or(sql`${subscriptions.endDate} > NOW()`, isNull(subscriptions.endDate))
			)
		)
		.orderBy(desc(subscriptions.createdAt))
		.limit(1);
	return row ?? null;
}

/**
 * The four switches as they should render.
 *
 * Read-only by contract: an account that has never opened this card has no
 * preferences key (or no row at all), and gets the approved defaults without a
 * write. The first toggle is what persists a value.
 */
export async function getNotificationPreferences(
	userId: string
): Promise<NotificationPreferences> {
	const row = await findNotificationMethodsRow(userId);
	return notificationPreferencesFrom(row?.notificationMethods);
}

/**
 * Set one switch, leaving the other three and the billing half alone.
 *
 * Creates a tierless row when the account has none — nothing else in the app
 * writes this table, so an account without a paid plan has no row to write, and
 * a switch that cannot save is a switch that lies. `email`/`sms` are written
 * `false` rather than a guessed `true`: a row this card created must not assert
 * that the account consented to a channel it never chose. `subscriptionTypeId`
 * stays null, which is what keeps this row out of every plan read (see
 * `findNotificationMethodsRow`).
 */
export async function setNotificationPreference(
	userId: string,
	preference: NotificationPreferenceId,
	value: boolean
): Promise<void> {
	const row = await findNotificationMethodsRow(userId);

	if (row) {
		await db
			.update(subscriptions)
			.set({
				notificationMethods: withNotificationPreference(
					row.notificationMethods,
					preference,
					value
				)
			})
			.where(eq(subscriptions.id, row.id));
		return;
	}

	await db.insert(subscriptions).values({
		userId,
		startDate: new Date(),
		// Preferences are not a term. Far future so the row reads as unexpired;
		// the null tier is what keeps it out of the plan reads.
		endDate: new Date('9999-12-31T00:00:00.000Z'),
		subscriptionTypeId: null,
		notificationMethods: withNotificationPreference(undefined, preference, value)
	});
}