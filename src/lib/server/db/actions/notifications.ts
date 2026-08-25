import { db } from '$lib/server/db';
import { notifications, type Notification } from '$lib/server/db/schema';
import { sendPushToUser } from '$lib/server/services/pushService';
import { and, desc, eq, isNull, sql } from 'drizzle-orm';

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

export async function getNotifications(userId: string, limit = 20): Promise<Notification[]> {
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
