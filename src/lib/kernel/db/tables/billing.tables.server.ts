/**
 * Billing tables: discounts and who holds them, the subscription row that
 * entitles an account, the plan catalogue it points at, and the monthly AI
 * usage meter.
 *
 * Definitions moved verbatim out of the legacy `src/lib/server/db/schema.ts`
 * (task K-04); `billing` owns them (scripts/arch/registry.mjs TABLE_OWNERS).
 * Ids come from the kernel id port, "now" from the kernel clock (rule R5).
 *
 * Doc: src/lib/kernel/README.md#database
 */
import { boolean, integer, jsonb, pgTable, primaryKey, text, timestamp } from 'drizzle-orm/pg-core';
import { systemIds } from '$lib/kernel/ids/ids';
import { systemClock } from '$lib/kernel/time/clock';
import { users } from './identity.tables.server';

export const discounts = pgTable('discounts', {
	id: text('id')
		.notNull()
		.primaryKey()
		.$defaultFn(() => systemIds.id()),
	name: text('name').notNull(),
	description: text('description'),
	eligibleRole: text('eligibleRole'),
	minFamilyMembers: integer('minFamilyMembers'),
	discountRate: integer('discountRate').notNull(),
	durationMonths: integer('durationMonths'),
	appliesToMonthly: boolean('appliesToMonthly').default(false).notNull(),
	appliesToAnnual: boolean('appliesToAnnual').default(false).notNull(),
	appliesToLifetime: boolean('appliesToLifetime').default(false).notNull(),
	stackable: boolean('stackable').default(false).notNull(),
	enabled: boolean('enabled').default(true).notNull(),
	createdAt: timestamp('createdAt', { mode: 'date' }).defaultNow().notNull(),
	updatedAt: timestamp('updatedAt', { mode: 'date' })
		.defaultNow()
		.$onUpdate(() => systemClock.now())
		.notNull()
});

export type DiscountRow = typeof discounts.$inferSelect;
export type NewDiscountRow = typeof discounts.$inferInsert;

export const userDiscounts = pgTable(
	'userDiscounts',
	{
		userId: text('userId')
			.notNull()
			.references(() => users.id, { onDelete: 'cascade' }),
		discountId: text('discountId')
			.notNull()
			.references(() => discounts.id, { onDelete: 'cascade' }),
		appliedAt: timestamp('appliedAt', { mode: 'date' }).defaultNow().notNull(),
		expiresAt: timestamp('expiresAt', { mode: 'date' })
	},
	(userDiscount) => ({
		compoundKey: primaryKey({ columns: [userDiscount.userId, userDiscount.discountId] })
	})
);

export type UserDiscountRow = typeof userDiscounts.$inferSelect;
export type NewUserDiscountRow = typeof userDiscounts.$inferInsert;

export const subscriptions = pgTable('activeSubscriptions', {
	id: text('id')
		.notNull()
		.primaryKey()
		.$defaultFn(() => systemIds.id()),
	userId: text('userId')
		.notNull()
		.references(() => users.id, { onDelete: 'no action' }),
	createdAt: timestamp('createdAt', { mode: 'date' }).defaultNow().notNull(),
	updatedAt: timestamp('updatedAt', { mode: 'date' })
		.defaultNow()
		.$onUpdate(() => systemClock.now())
		.notNull(),
	startDate: timestamp('startDate', { mode: 'date' })
		.$defaultFn(() => {
			const endOfDay = systemClock.now();
			endOfDay.setUTCHours(23, 59, 59, 999);
			return endOfDay;
		})
		.notNull(),
	// One JSON column, two jobs. `email`/`sms` are the billing half that was
	// here first and every row written before the Notifications card carries
	// only those. `preferences` is the sibling key the account page's four
	// switches write — optional precisely so a legacy `{ email, sms }` row
	// still satisfies this type without a migration. See
	// `src/lib/components/account/accountNotifications.ts`.
	notificationMethods: jsonb('notificationMethods')
		.$type<{
			email: boolean;
			sms: boolean;
			preferences?: {
				taskAssigned: boolean;
				taskCompleted: boolean;
				familyJoined: boolean;
				aiSuggestions: boolean;
			};
		}>()
		.notNull(),
	subscriptionTypeId: text('subscriptionTypeId').references(() => subscriptionTypes.id, {
		onDelete: 'restrict'
	}),
	endDate: timestamp('endDate', { mode: 'date' }).notNull(),
	familyLimitOverride: integer('familyLimitOverride'),
	memberLimitOverride: integer('memberLimitOverride'),
	retentionViewDaysOverride: integer('retentionViewDaysOverride'),
	archivedRetentionDaysOverride: integer('archivedRetentionDaysOverride'),
	attachmentLimitBytesOverride: integer('attachmentLimitBytesOverride')
});

export type SubscriptionRow = typeof subscriptions.$inferSelect;
export type NewSubscriptionRow = typeof subscriptions.$inferInsert;

export const subscriptionTypes = pgTable('subscriptionTypes', {
	id: text('id')
		.notNull()
		.primaryKey()
		.$defaultFn(() => systemIds.id()),
	name: text('name').notNull(),
	tierName: text('tierName').notNull(),
	planType: text('planType').notNull().default('individual'),
	displayName: text('displayName').notNull(),
	createdAt: timestamp('createdAt', { mode: 'date' }).defaultNow().notNull(),
	updatedAt: timestamp('updatedAt', { mode: 'date' })
		.defaultNow()
		.$onUpdate(() => systemClock.now())
		.notNull(),
	durationMonths: integer('durationMonths').notNull(),
	enabled: boolean('enabled').default(true).notNull(),
	familyLimit: integer('familyLimit').default(1).notNull(),
	/** Max members allowed IN one family (the creator's tier decides). */
	memberLimit: integer('memberLimit').default(6).notNull(),
	retentionViewDays: integer('retentionViewDays').default(30).notNull(),
	archivedRetentionDays: integer('archivedRetentionDays').default(90).notNull(),
	attachmentLimitBytes: integer('attachmentLimitBytes').default(10485760).notNull(),
	aiEventCreationsPerMonth: integer('aiEventCreationsPerMonth').default(10).notNull(),
	exportImportEnabled: boolean('exportImportEnabled').default(true).notNull()
});

export type SubscriptionTypeRow = typeof subscriptionTypes.$inferSelect;
export type NewSubscriptionTypeRow = typeof subscriptionTypes.$inferInsert;

export const aiUsageTracking = pgTable(
	'aiUsageTracking',
	{
		userId: text('userId')
			.notNull()
			.references(() => users.id, { onDelete: 'cascade' }),
		month: integer('month').notNull(),
		year: integer('year').notNull(),
		aiEventCreationsUsed: integer('aiEventCreationsUsed').default(0).notNull(),
		createdAt: timestamp('createdAt', { mode: 'date' }).defaultNow().notNull(),
		updatedAt: timestamp('updatedAt', { mode: 'date' })
			.defaultNow()
			.$onUpdate(() => systemClock.now())
			.notNull()
	},
	(table) => ({
		compoundKey: primaryKey({ columns: [table.userId, table.month, table.year] })
	})
);

export type AiUsageTrackingRow = typeof aiUsageTracking.$inferSelect;
export type NewAiUsageTrackingRow = typeof aiUsageTracking.$inferInsert;
