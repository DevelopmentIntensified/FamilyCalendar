/**
 * alerts repo: every query over `notifications`, `pushSubscriptions` and
 * `deviceTokens`, plus the declared foreign read/write of
 * `activeSubscriptions.notificationMethods` (rule R3, `FOREIGN_READS.alerts` in
 * scripts/arch/registry.mjs: billing owns the row and has no preference API
 * yet, so the preference switches read and update only that jsonb here).
 *
 * Each function takes `db: Db` first, contains no authorization and no
 * business rules (scoping to the caller, the page size, the push payload and
 * the prune decisions are the service's and the rules'), and never reads the
 * process clock (rule R5): every write that stamps a row takes the caller's
 * `now`, and no column default or `$onUpdate` decides a timestamp. A lookup
 * that can miss answers `null`.
 *
 * `notifications.readAt` / `createdAt` and `pushSubscriptions.createdAt` are
 * `mode: 'string'` columns, so the writes below hand them ISO strings and the
 * reads give back the driver's Postgres text render (`2026-03-04 10:00:00+00`).
 *
 * Doc: ./README.md#invariants
 */
import { and, desc, eq, gt, inArray, isNotNull, isNull, lt, sql } from 'drizzle-orm';
import type { Db } from '$lib/kernel/db/database.server';
import {
	deviceTokens,
	notifications,
	pushSubscriptions,
	subscriptions,
	type NotificationRow,
	type PushSubscriptionRow
} from '$lib/kernel/db/tables.server';
import type { AlertInput, AlertNotificationMethods, DevicePlatform } from './alerts.contract';

// --- Alerts -----------------------------------------------------------------

/** Store one Alert, stamped `now`, and return the row as the database wrote it. */
export async function insertAlert(db: Db, alert: AlertInput, now: Date): Promise<NotificationRow> {
	const [row] = await db
		.insert(notifications)
		.values({
			userId: alert.userId,
			type: alert.type,
			actorName: alert.actorName,
			message: alert.message,
			link: alert.link ?? null,
			createdAt: now.toISOString()
		})
		.returning();
	if (!row) throw new Error('insertAlert: insert returned no row');
	return row;
}

/** The caller's newest `limit` Alerts, newest `createdAt` first. */
export async function listAlerts(db: Db, userId: string, limit: number): Promise<NotificationRow[]> {
	return await db
		.select()
		.from(notifications)
		.where(eq(notifications.userId, userId))
		.orderBy(desc(notifications.createdAt))
		.limit(limit);
}

/** Every unread Alert the caller has, not just the ones in the newest window. */
export async function countUnreadAlerts(db: Db, userId: string): Promise<number> {
	const [row] = await db
		.select({ count: sql<number>`count(*)::int` })
		.from(notifications)
		.where(and(eq(notifications.userId, userId), isNull(notifications.readAt)));
	return row?.count ?? 0;
}

/**
 * Mark one of the caller's Alerts read at `now`. Scoped by `userId`, so another
 * person's id matches nothing. A row that is already read is stamped again:
 * the write has no `readAt IS NULL` leg (the page avoids the call for a read
 * row, and the retention cutoff then counts from the latest stamp).
 */
export async function markAlertRead(db: Db, userId: string, id: string, now: Date): Promise<void> {
	await db
		.update(notifications)
		.set({ readAt: now.toISOString() })
		.where(and(eq(notifications.id, id), eq(notifications.userId, userId)));
}

/** Mark every unread Alert of the caller read at `now`; rows already read keep their stamp. */
export async function markAllAlertsRead(db: Db, userId: string, now: Date): Promise<void> {
	await db
		.update(notifications)
		.set({ readAt: now.toISOString() })
		.where(and(eq(notifications.userId, userId), isNull(notifications.readAt)));
}

/** Delete the caller's read Alerts; unread ones are never touched. Returns how many went. */
export async function deleteReadAlerts(db: Db, userId: string): Promise<number> {
	const deleted = await db
		.delete(notifications)
		.where(and(eq(notifications.userId, userId), isNotNull(notifications.readAt)))
		.returning({ id: notifications.id });
	return deleted.length;
}

/**
 * Retention across every user: Alerts read before the cutoff are deleted.
 * Unread Alerts never match (an Alert nobody has read still asks something of
 * them). Returns how many went.
 */
export async function deleteReadAlertsBefore(db: Db, cutoff: Date): Promise<number> {
	const deleted = await db
		.delete(notifications)
		.where(and(isNotNull(notifications.readAt), lt(notifications.readAt, cutoff.toISOString())))
		.returning({ id: notifications.id });
	return deleted.length;
}

// --- Web Push subscriptions -------------------------------------------------

/** What a browser hands `subscribe`: the endpoint and its two keys. */
export type PushSubscriptionWrite = {
	readonly endpoint: string;
	readonly keys: { readonly p256dh: string; readonly auth: string };
};

/**
 * Save a browser subscription, deduplicated on `endpoint`: a new endpoint
 * inserts (stamped `now`); a known one is re-owned to `userId` and takes the
 * new keys, keeping its original `createdAt`.
 */
export async function upsertPushSubscription(
	db: Db,
	userId: string,
	subscription: PushSubscriptionWrite,
	now: Date
): Promise<void> {
	await db
		.insert(pushSubscriptions)
		.values({
			userId,
			endpoint: subscription.endpoint,
			p256dh: subscription.keys.p256dh,
			auth: subscription.keys.auth,
			createdAt: now.toISOString()
		})
		.onConflictDoUpdate({
			target: pushSubscriptions.endpoint,
			set: { userId, p256dh: subscription.keys.p256dh, auth: subscription.keys.auth }
		});
}

/** Delete only the caller's row for the endpoint; another person's row, or none, is a no-op. */
export async function deletePushSubscription(
	db: Db,
	userId: string,
	endpoint: string
): Promise<void> {
	await db
		.delete(pushSubscriptions)
		.where(and(eq(pushSubscriptions.userId, userId), eq(pushSubscriptions.endpoint, endpoint)));
}

/** Every browser subscription the user has. */
export async function listPushSubscriptions(
	db: Db,
	userId: string
): Promise<PushSubscriptionRow[]> {
	return await db.select().from(pushSubscriptions).where(eq(pushSubscriptions.userId, userId));
}

// --- Android device tokens --------------------------------------------------

/**
 * Register an FCM token, deduplicated on the token itself (it is globally
 * unique): a new token inserts, a known one is re-owned to `userId` and its
 * `lastSeenAt` refreshed to `now`.
 */
export async function upsertDeviceToken(
	db: Db,
	userId: string,
	token: string,
	platform: DevicePlatform,
	now: Date
): Promise<void> {
	await db
		.insert(deviceTokens)
		.values({ userId, token, platform, createdAt: now, lastSeenAt: now })
		.onConflictDoUpdate({
			target: deviceTokens.token,
			set: { userId, platform, lastSeenAt: now }
		});
}

/** Delete only the caller's row for the token; another person's row, or none, is a no-op. */
export async function deleteDeviceToken(db: Db, userId: string, token: string): Promise<void> {
	await db
		.delete(deviceTokens)
		.where(and(eq(deviceTokens.userId, userId), eq(deviceTokens.token, token)));
}

/** Delete a token FCM reported unregistered, whoever holds it. */
export async function deleteDeadDeviceToken(db: Db, token: string): Promise<void> {
	await db.delete(deviceTokens).where(eq(deviceTokens.token, token));
}

/** Every `(userId, token)` the given users hold; no users, no query. */
export async function listDeviceTokens(
	db: Db,
	userIds: readonly string[]
): Promise<{ userId: string; token: string }[]> {
	if (userIds.length === 0) return [];
	return await db
		.select({ userId: deviceTokens.userId, token: deviceTokens.token })
		.from(deviceTokens)
		.where(inArray(deviceTokens.userId, [...userIds]));
}

// --- Preference row (activeSubscriptions.notificationMethods) ----------------

/**
 * The user's newest unexpired `activeSubscriptions` row (`endDate > now`),
 * newest `createdAt` first so a renewal does not lose a saved preference.
 * Unlike billing's plan reads this does not require a tier: the card creates a
 * tierless row for an account that has none and must read its own write back.
 */
export async function findAlertPreferencesRow(
	db: Db,
	userId: string,
	now: Date
): Promise<{ id: string; notificationMethods: AlertNotificationMethods } | null> {
	const [row] = await db
		.select({ id: subscriptions.id, notificationMethods: subscriptions.notificationMethods })
		.from(subscriptions)
		.where(and(eq(subscriptions.userId, userId), gt(subscriptions.endDate, now)))
		.orderBy(desc(subscriptions.createdAt))
		.limit(1);
	return row ?? null;
}

/**
 * Create the tierless row a first toggle needs when the account has none:
 * `subscriptionTypeId` null (which keeps it out of every plan read), an
 * `endDate` of 9999-12-31 so it reads as unexpired, and the given
 * `notificationMethods`.
 */
export async function insertAlertPreferencesRow(
	db: Db,
	userId: string,
	notificationMethods: AlertNotificationMethods,
	now: Date
): Promise<void> {
	await db.insert(subscriptions).values({
		userId,
		startDate: now,
		endDate: new Date('9999-12-31T00:00:00.000Z'),
		subscriptionTypeId: null,
		notificationMethods,
		createdAt: now,
		updatedAt: now
	});
}

/** Replace one row's `notificationMethods`, stamping `updatedAt` with `now`. */
export async function updateAlertPreferencesRow(
	db: Db,
	id: string,
	notificationMethods: AlertNotificationMethods,
	now: Date
): Promise<void> {
	await db
		.update(subscriptions)
		.set({ notificationMethods, updatedAt: now })
		.where(eq(subscriptions.id, id));
}
