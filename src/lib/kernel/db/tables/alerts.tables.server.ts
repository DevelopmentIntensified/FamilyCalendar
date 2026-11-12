/**
 * Alerts tables: the in-app notification feed, web push subscriptions and the
 * Android FCM device tokens push fan-out writes to.
 *
 * Definitions moved verbatim out of the legacy `src/lib/server/db/schema.ts`
 * (task K-04); `alerts` owns them (scripts/arch/registry.mjs TABLE_OWNERS).
 * Ids come from the kernel id port (rule R5).
 *
 * Doc: src/lib/kernel/README.md#database
 */
import { index, pgTable, text, timestamp, uniqueIndex } from 'drizzle-orm/pg-core';
import { systemIds } from '../../ids/ids';
import { users } from './identity.tables.server';

/**
 * In-app notification for one user. Written on assignment outcomes and
 * completions by others; read once from the navbar bell.
 */
export const notifications = pgTable('notifications', {
	id: text('id')
		.notNull()
		.primaryKey()
		.$defaultFn(() => systemIds.id()),
	userId: text('userId')
		.notNull()
		.references(() => users.id, { onDelete: 'cascade' }),
	// The closed set lives in src/lib/utils/notificationTypes.ts — this comment
	// is a pointer, not a second copy. It was missing 'added_to_family', which
	// family/[familyId]/members/add/direct/+server.ts really does write.
	type: text('type').notNull(),
	actorName: text('actorName').notNull(),
	message: text('message').notNull(),
	link: text('link'),
	readAt: timestamp('readAt', { withTimezone: true, mode: 'string' }),
	createdAt: timestamp('createdAt', { withTimezone: true, mode: 'string' }).defaultNow().notNull()
});

export type NotificationRow = typeof notifications.$inferSelect;
export type NewNotificationRow = typeof notifications.$inferInsert;

/**
 * Web Push (VAPID) subscriptions — no Firebase. One row per
 * browser/device; endpoint is unique per subscription.
 */
export const pushSubscriptions = pgTable(
	'pushSubscriptions',
	{
		id: text('id')
			.notNull()
			.primaryKey()
			.$defaultFn(() => systemIds.id()),
		userId: text('userId')
			.notNull()
			.references(() => users.id, { onDelete: 'cascade' }),
		endpoint: text('endpoint').notNull(),
		p256dh: text('p256dh').notNull(),
		auth: text('auth').notNull(),
		createdAt: timestamp('createdAt', { withTimezone: true, mode: 'string' }).defaultNow().notNull()
	},
	(table) => ({
		endpointIdx: uniqueIndex('push_subscriptions_endpoint_idx').on(table.endpoint)
	})
);

export type PushSubscriptionRow = typeof pushSubscriptions.$inferSelect;
export type NewPushSubscriptionRow = typeof pushSubscriptions.$inferInsert;

/**
 * FCM registration tokens for the Android app (#272, migration 023). Token is
 * globally unique: a token re-registered by another account is re-owned.
 */
export const deviceTokens = pgTable(
	'device_tokens',
	{
		id: text('id')
			.notNull()
			.primaryKey()
			.$defaultFn(() => systemIds.id()),
		userId: text('user_id')
			.notNull()
			.references(() => users.id, { onDelete: 'cascade' }),
		token: text('token').notNull().unique(),
		platform: text('platform').notNull().default('android'),
		createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' }).defaultNow().notNull(),
		lastSeenAt: timestamp('last_seen_at', { withTimezone: true, mode: 'date' })
			.defaultNow()
			.notNull()
	},
	(table) => ({
		userIdx: index('device_tokens_user_id_idx').on(table.userId)
	})
);

export type DeviceTokenRow = typeof deviceTokens.$inferSelect;
export type NewDeviceTokenRow = typeof deviceTokens.$inferInsert;
