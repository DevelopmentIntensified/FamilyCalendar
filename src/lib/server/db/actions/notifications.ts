import { db } from '$lib/server/db';
import { notifications, type Notification } from '$lib/server/db/schema';
import { sendPushToUser } from '$lib/server/services/pushService';
import { and, desc, eq, isNotNull, isNull, sql } from 'drizzle-orm';

export async function createNotification(data: {
	userId: string;
	type: string;
	actorName: string;
	message: string;
	link?: string | null;
}): Promise<void> {
	try {
		await db.insert(notifications).values({
			userId: data.userId,
			type: data.type,
			actorName: data.actorName,
			message: data.message,
			link: data.link ?? null
		});
		void sendPushToUser(data.userId, {
			title: data.actorName,
			body: data.message,
			link: data.link ?? '/calendar/tasks'
		});
	} catch (error) {
		console.error('Failed to create notification:', error);
	}
}

/**
 * One feed, one window. The nav bell (GET /api/notifications) and the Alerts
 * page used to read 20 and 50 rows, so the same user could see two different
 * feeds and the bell could show rows the page had already dropped (issue 073).
 * 50 is the number the page already used — it is the surface the bell
 * deep-links into, so truncating the destination below the source is what
 * makes "mark all read" and the unread filter lie about what is on screen.
 */
export const NOTIFICATION_PAGE_SIZE = 50;

export async function getNotifications(
	userId: string,
	limit = NOTIFICATION_PAGE_SIZE
): Promise<Notification[]> {
	return db
		.select()
		.from(notifications)
		.where(eq(notifications.userId, userId))
		.orderBy(desc(notifications.createdAt))
		.limit(limit);
}

export async function getUnreadCount(userId: string): Promise<number> {
	const [row] = await db
		.select({ count: sql<number>`count(*)::int` })
		.from(notifications)
		.where(and(eq(notifications.userId, userId), isNull(notifications.readAt)));
	return row?.count ?? 0;
}

export async function markNotificationRead(userId: string, id: string): Promise<void> {
	await db
		.update(notifications)
		.set({ readAt: new Date().toISOString() })
		.where(and(eq(notifications.id, id), eq(notifications.userId, userId)));
}

export async function markAllNotificationsRead(userId: string): Promise<void> {
	await db
		.update(notifications)
		.set({ readAt: new Date().toISOString() })
		.where(and(eq(notifications.userId, userId), isNull(notifications.readAt)));
}

/**
 * Prune the read rows — the delete path the feed had no way to reach (issue
 * 073 left it unbuilt; the prototype calls it out as the reason "mark all read"
 * hides the problem instead of solving it). Unread rows are never touched: an
 * alert nobody has read is the one still asking something of them.
 */
export async function deleteReadNotifications(userId: string): Promise<number> {
	const deleted = await db
		.delete(notifications)
		.where(and(eq(notifications.userId, userId), isNotNull(notifications.readAt)))
		.returning({ id: notifications.id });
	return deleted.length;
}
