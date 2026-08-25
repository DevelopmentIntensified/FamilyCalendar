import { createRequire } from 'node:module';
import { and, eq } from 'drizzle-orm';
import { db } from '$lib/server/db';
import { pushSubscriptions } from '$lib/server/db/schema';

interface WebPushModule {
	sendNotification(
		subscription: { endpoint: string; keys: { p256dh: string; auth: string } },
		payload?: string | null,
		options?: {
			vapidDetails?: { subject: string; publicKey: string; privateKey: string };
		}
	): Promise<void>;
}

const webpush = createRequire(import.meta.url)('web-push') as WebPushModule;

export function getVapidPublicKey(): string | null {
	return process.env.VAPID_PUBLIC_KEY ?? null;
}

interface PushSubscriptionInput {
	endpoint: string;
	keys: { p256dh: string; auth: string };
}

function isVapidConfigured(): boolean {
	return Boolean(process.env.VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY);
}

export async function saveSubscription(userId: string, subscription: PushSubscriptionInput): Promise<void> {
	await db
		.insert(pushSubscriptions)
		.values({
			userId,
			endpoint: subscription.endpoint,
			p256dh: subscription.keys.p256dh,
			auth: subscription.keys.auth
		})
		.onConflictDoUpdate({
			target: pushSubscriptions.endpoint,
			set: {
				userId,
				p256dh: subscription.keys.p256dh,
				auth: subscription.keys.auth
			}
		});
}

export async function removeSubscription(endpoint: string): Promise<void> {
	await db.delete(pushSubscriptions).where(eq(pushSubscriptions.endpoint, endpoint));
}

export async function sendPushToUser(
	userId: string,
	payload: { title: string; body: string; link?: string }
): Promise<void> {
	if (!isVapidConfigured()) return;

	try {
		const subscriptions = await db
			.select()
			.from(pushSubscriptions)
			.where(eq(pushSubscriptions.userId, userId));

		const payloadJson = JSON.stringify(payload);

		await Promise.all(
			subscriptions.map(async (sub) => {
				try {
					await webpush.sendNotification(
						{
							endpoint: sub.endpoint,
							keys: { p256dh: sub.p256dh, auth: sub.auth }
						},
						payloadJson,
						{
							vapidDetails: {
								subject: process.env.VAPID_SUBJECT ?? 'mailto:admin@familyplanz.com',
								publicKey: process.env.VAPID_PUBLIC_KEY!,
								privateKey: process.env.VAPID_PRIVATE_KEY!
							}
						}
					);
				} catch (error) {
					const statusCode = (error as { statusCode?: number }).statusCode;
					if (statusCode === 404 || statusCode === 410) {
						await db
							.delete(pushSubscriptions)
							.where(and(eq(pushSubscriptions.endpoint, sub.endpoint), eq(pushSubscriptions.userId, userId)));
					} else {
						console.error('Failed to send push notification:', error);
					}
				}
			})
		);
	} catch (error) {
		console.error('Failed to send push notifications for user:', error);
	}
}
