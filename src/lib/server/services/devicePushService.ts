import { and, eq, inArray } from 'drizzle-orm';
import { db } from '$lib/server/db';
import { deviceTokens } from '$lib/server/db/schema';
import {
	eventsChangedMessage,
	getFcmSender,
	notificationMessage,
	type FcmMessage,
	type FcmSender
} from './fcmService';

/**
 * Device-token store + FCM fan-out (#272). The Android app registers its FCM
 * token via `/api/devices`; every send here loops that user's tokens through
 * the FCM transport and prunes the ones FCM reports dead.
 */

export const MAX_DEVICE_TOKEN_LENGTH = 4096;
export const DEVICE_PLATFORMS = ['android'] as const;
export type DevicePlatform = (typeof DEVICE_PLATFORMS)[number];

/** Upsert: refresh last_seen_at and re-own the token to the caller. */
export async function registerDeviceToken(
	userId: string,
	token: string,
	platform: DevicePlatform
): Promise<void> {
	const now = new Date();
	await db
		.insert(deviceTokens)
		.values({ userId, token, platform, lastSeenAt: now })
		.onConflictDoUpdate({
			target: deviceTokens.token,
			set: { userId, platform, lastSeenAt: now }
		});
}

/** Deletes only the caller's row for the token. */
export async function removeDeviceToken(userId: string, token: string): Promise<void> {
	await db
		.delete(deviceTokens)
		.where(and(eq(deviceTokens.userId, userId), eq(deviceTokens.token, token)));
}

export interface DevicePushDeps {
	sender: () => Pick<FcmSender, 'send'> | null;
	listTokens: (userIds: string[]) => Promise<{ userId: string; token: string }[]>;
	pruneToken: (token: string) => Promise<void>;
}

const defaultDeps: DevicePushDeps = {
	sender: () => getFcmSender(),
	listTokens: (userIds) =>
		db
			.select({ userId: deviceTokens.userId, token: deviceTokens.token })
			.from(deviceTokens)
			.where(inArray(deviceTokens.userId, userIds)),
	pruneToken: async (token) => {
		await db.delete(deviceTokens).where(eq(deviceTokens.token, token));
	}
};

/** Send one message to every token of `userIds`; never throws. */
async function fanOut(userIds: string[], message: FcmMessage, deps: DevicePushDeps): Promise<void> {
	const unique = [...new Set(userIds)];
	if (unique.length === 0) return;
	const sender = deps.sender();
	if (!sender) return;
	try {
		const rows = await deps.listTokens(unique);
		const tokens = [...new Set(rows.map((r) => r.token))];
		await Promise.all(
			tokens.map(async (token) => {
				const result = await sender.send(token, message);
				if (result === 'unregistered') {
					await deps.pruneToken(token).catch((error: unknown) => {
						console.error('Failed to prune FCM token:', error);
					});
				}
			})
		);
	} catch (error) {
		console.error('Failed to send FCM messages:', error);
	}
}

/** The Android leg of `sendPushToUser`: a visible notification on every device. */
export function sendNotificationToDevices(
	userId: string,
	payload: { title: string; body: string; link?: string },
	deps: DevicePushDeps = defaultDeps
): Promise<void> {
	return fanOut([userId], notificationMessage(payload), deps);
}

/**
 * Data-only (silent) message to every device of every user. `events_changed`
 * is the sync nudge: the phone refetches events and reschedules reminders.
 */
export function sendDataToUsers(
	userIds: string[],
	// The only data message today; widen the union (and add a builder) for more.
	_data: { type: 'events_changed' },
	deps: DevicePushDeps = defaultDeps
): Promise<void> {
	return fanOut(userIds, eventsChangedMessage(), deps);
}
