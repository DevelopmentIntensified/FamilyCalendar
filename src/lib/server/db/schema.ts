import {
	timestamp,
	boolean,
	pgTable,
	text,
	primaryKey,
	integer,
	json,
	jsonb,
	serial,
	uniqueIndex
} from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';
import { generateId } from 'lucia';

export const users = pgTable('users', {
	id: text('id')
		.notNull()
		.primaryKey()
		.$defaultFn(() => generateId(15)),
	firstName: text('firstName').notNull(),
	lastName: text('lastName').notNull(),
	email: text('email').notNull().unique(),
	passwordHash: text('passwordhash'),
	emailVerified: boolean('emailVerified'),
	picture: text('picture'),
	roles: json('roles').default([]).$type<string[]>().notNull(),
	createdAt: timestamp('createdAt', { mode: 'date' }).defaultNow().notNull(),
	updatedAt: timestamp('updatedAt', { mode: 'date' })
		.defaultNow()
		.$onUpdate(() => new Date())
		.notNull(),
	phonenumber: text('phonenumber'),
	phonenumberVerified: boolean('phonenumberVerified'),
	lastLogin: timestamp('lastLogin', { mode: 'date' }).defaultNow().notNull()
});

export const userSettings = pgTable('userSettings', {
	id: text('id')
		.notNull()
		.primaryKey()
		.$defaultFn(() => generateId(15)),
	weekStart: text('weekStart').default('sunday'),
	timeZone: text('timeZone'),
	color: text('color'),
	syncEventsToFamilyCalendar: boolean(),
	showAdsAsEvents: boolean().default(true),
	showAdMarkers: boolean().default(true),
	personalizedAds: boolean().default(true),
	autoParseEventDetails: boolean().default(true),
	useCloudAI: boolean().default(true),
	useLocalAI: boolean().default(true),
	updatedAt: timestamp('updatedAt', { mode: 'date' })
		.defaultNow()
		.$onUpdate(() => new Date())
		.notNull(),
	defaultCalendarId: text('defaultCalendarId').references(() => calendars.id, {
		onDelete: 'set null'
	}),
	defaultView: text('defaultView').default('dayView'),
	userId: text('userId')
		.notNull()
		.references(() => users.id, { onDelete: 'cascade' })
});

export const discounts = pgTable('discounts', {
	id: text('id')
		.notNull()
		.primaryKey()
		.$defaultFn(() => generateId(15)),
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
		.$onUpdate(() => new Date())
		.notNull()
});

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

export const subscriptions = pgTable('activeSubscriptions', {
	id: text('id')
		.notNull()
		.primaryKey()
		.$defaultFn(() => generateId(15)),
	userId: text('userId')
		.notNull()
		.references(() => users.id, { onDelete: 'no action' }),
	createdAt: timestamp('createdAt', { mode: 'date' }).defaultNow().notNull(),
	updatedAt: timestamp('updatedAt', { mode: 'date' })
		.defaultNow()
		.$onUpdate(() => new Date())
		.notNull(),
	startDate: timestamp('startDate', { mode: 'date' })
		.$defaultFn(() => {
			const endOfDay = new Date();
			endOfDay.setUTCHours(23, 59, 59, 999);
			return endOfDay;
		})
		.notNull(),
	notificationMethods: jsonb('notificationMethods')
		.$type<{ email: boolean; sms: boolean }>()
		.notNull(),
	subscriptionTypeId: text('subscriptionTypeId').references(() => subscriptionTypes.id, {
		onDelete: 'restrict'
	}),
	endDate: timestamp('endDate', { mode: 'date' }).notNull(),
	familyLimitOverride: integer('familyLimitOverride'),
	retentionViewDaysOverride: integer('retentionViewDaysOverride'),
	archivedRetentionDaysOverride: integer('archivedRetentionDaysOverride'),
	attachmentLimitBytesOverride: integer('attachmentLimitBytesOverride')
});

export const subscriptionTypes = pgTable('subscriptionTypes', {
	id: text('id')
		.notNull()
		.primaryKey()
		.$defaultFn(() => generateId(15)),
	name: text('name').notNull(),
	tierName: text('tierName').notNull(),
	planType: text('planType').notNull().default('individual'),
	displayName: text('displayName').notNull(),
	createdAt: timestamp('createdAt', { mode: 'date' }).defaultNow().notNull(),
	updatedAt: timestamp('updatedAt', { mode: 'date' })
		.defaultNow()
		.$onUpdate(() => new Date())
		.notNull(),
	durationMonths: integer('durationMonths').notNull(),
	enabled: boolean('enabled').default(true).notNull(),
	familyLimit: integer('familyLimit').default(1).notNull(),
	retentionViewDays: integer('retentionViewDays').default(30).notNull(),
	archivedRetentionDays: integer('archivedRetentionDays').default(90).notNull(),
	attachmentLimitBytes: integer('attachmentLimitBytes').default(10485760).notNull(),
	aiEventCreationsPerMonth: integer('aiEventCreationsPerMonth').default(10).notNull(),
	exportImportEnabled: boolean('exportImportEnabled').default(true).notNull()
});

export const accounts = pgTable(
	'accounts',
	{
		userId: text('userId')
			.notNull()
			.references(() => users.id, { onDelete: 'cascade' }),
		// type: text("type").$type().notNull(),
		provider: text('provider').notNull(),
		providerAccountId: text('providerAccountId').notNull(),
		refresh_token: text('refresh_token'),
		access_token: text('access_token'),
		expires_at: integer('expires_at'),
		token_type: text('token_type'),
		scope: text('scope'),
		id_token: text('id_token'),
		session_state: text('session_state')
	},
	(account) => ({
		compoundKey: primaryKey({ columns: [account.provider, account.providerAccountId] })
	})
);

export const codes = pgTable('codes', {
	code: text('code').notNull().unique(),
	expiresAt: timestamp('expiresAt', { withTimezone: true, mode: 'date' }).notNull(),
	email: text('email').notNull(),
	firstName: text('firstName'),
	lastName: text('lastName'),
	emailId: text('emailId'),
	type: text('type').default('signup'),
	pendingEmail: text('pendingEmail')
});

export const sessions = pgTable('sessions', {
	id: text('id').notNull().primaryKey(),
	userId: text('user_id')
		.notNull()
		.references(() => users.id, { onDelete: 'cascade' }),
	expiresAt: timestamp('expires_at', { withTimezone: true, mode: 'date' }).notNull()
});

export const familyMembers = pgTable(
	'familyMembers',
	{
		userId: text('user_id')
			.notNull()
			.references(() => users.id, { onDelete: 'cascade' }),
		familyId: text('family_id')
			.notNull()
			.references(() => families.id, { onDelete: 'cascade' }),
		role: text('role').default('member')
	},
	(userFamily) => ({
		compoundKey: primaryKey({ columns: [userFamily.userId, userFamily.familyId] })
	})
);

export const familyInviteCodes = pgTable('familyInviteCodes', {
	code: text('code').notNull().primaryKey(),
	familyId: text('familyId')
		.notNull()
		.references(() => families.id),
	expiresAt: timestamp('expiresAt', { withTimezone: true, mode: 'date' }).notNull(),
	maxUses: integer('maxUses').default(1),
	useCount: integer('useCount').default(0),
	createdBy: text('createdBy').references(() => users.id)
});

export const familyGroups = pgTable(
	'familyGroups',
	{
		groupId: text('group_id')
			.notNull()
			.references(() => groups.id),
		familyId: text('family_id')
			.notNull()
			.references(() => families.id)
	},
	(familyGroup) => ({
		compoundKey: primaryKey({ columns: [familyGroup.groupId, familyGroup.familyId] })
	})
);

export const groups = pgTable('groups', {
	id: text('id')
		.notNull()
		.primaryKey()
		.$defaultFn(() => generateId(15)),
	color: text('color'),
	createdAt: timestamp('created_at').defaultNow().notNull()
});

export const userGroups = pgTable(
	'userGroups',
	{
		userId: text('user_id')
			.notNull()
			.references(() => users.id),
		groupId: text('group_id')
			.notNull()
			.references(() => groups.id)
	},
	(familyGroup) => ({
		compoundKey: primaryKey({ columns: [familyGroup.groupId, familyGroup.userId] })
	})
);

export const families = pgTable('families', {
	id: text('id')
		.notNull()
		.primaryKey()
		.$defaultFn(() => generateId(15)),
	name: text('name').notNull(),
	color: text('color'),
	createdAt: timestamp('created_at').defaultNow().notNull()
});

export const calendars = pgTable('calendars', {
	id: text('id')
		.notNull()
		.primaryKey()
		.$defaultFn(() => generateId(15)),
	ownerId: text('owner_id').references(() => users.id, { onDelete: 'cascade' }),
	familyId: text('family_id').references(() => families.id, { onDelete: 'cascade' }),
	createdAt: timestamp('created_at').defaultNow().notNull()
});

export const eventAttendance = pgTable('eventAttendance', {
	id: text('id').primaryKey(),
	eventId: text('event_id')
		.notNull()
		.references(() => events.id, { onDelete: 'cascade' }),
	userId: text('user_id')
		.references(() => users.id, { onDelete: 'cascade' }),
	name: text('name'), // For non-user attendees
	status: text('status').default('undecided')
}, (table) => ({
	// Unique constraint for user attendees
	userUnique: uniqueIndex('event_attendance_user_unique')
		.on(table.eventId, table.userId)
		.where(sql`user_id IS NOT NULL`),
	// Unique constraint for named attendees
	nameUnique: uniqueIndex('event_attendance_name_unique')
		.on(table.eventId, table.name)
		.where(sql`name IS NOT NULL`)
}));

export const aiUsageTracking = pgTable('aiUsageTracking', {
	userId: text('userId')
		.notNull()
		.references(() => users.id, { onDelete: 'cascade' }),
	month: integer('month').notNull(),
	year: integer('year').notNull(),
	aiEventCreationsUsed: integer('aiEventCreationsUsed').default(0).notNull(),
	createdAt: timestamp('createdAt', { mode: 'date' }).defaultNow().notNull(),
	updatedAt: timestamp('updatedAt', { mode: 'date' })
		.defaultNow()
		.$onUpdate(() => new Date())
		.notNull()
}, (table) => ({
	compoundKey: primaryKey({ columns: [table.userId, table.month, table.year] })
}));

export const events = pgTable('events', {
	id: text('id')
		.notNull()
		.primaryKey()
		.$defaultFn(() => generateId(15)),
	calendarId: text('calendar_id').references(() => calendars.id, { onDelete: 'cascade' }),
	ownerId: text('owner_id')
		.notNull()
		.references(() => users.id, { onDelete: 'cascade' }),
	title: text('title').notNull(),
	start: timestamp('start', {
		withTimezone: true,
		mode: 'string'
	}).notNull(),
	end: timestamp('end', {
		withTimezone: true,
		mode: 'string'
	}),
	description: text('description'),
	location: text('location'),
	created_at: timestamp('created_at').defaultNow().notNull()
});

export type Session = typeof sessions.$inferSelect;
export type Code = typeof codes.$inferSelect;
export type CalendarEvent = typeof events.$inferSelect;
export type Calendar = typeof calendars.$inferSelect;

export type User = typeof users.$inferSelect;
export type Account = typeof accounts.$inferSelect;
export type UserSettings = typeof userSettings.$inferSelect;
export const adEvents = pgTable('adEvents', {
	id: text('id')
		.notNull()
		.primaryKey()
		.$defaultFn(() => generateId(15)),
	sponsorName: text('sponsorName').notNull(),
	message: text('message').notNull(),
	ctaText: text('ctaText'),
	ctaLink: text('ctaLink'),
	targetPlan: text('targetPlan'),
	deadline: timestamp('deadline', { mode: 'date' }),
	scheduledFor: timestamp('scheduledFor', { mode: 'date' }).notNull(),
	expiresAt: timestamp('expiresAt', { mode: 'date' }),
	impressions: integer('impressions').default(0).notNull(),
	clicks: integer('clicks').default(0).notNull(),
	conversions: integer('conversions').default(0).notNull(),
	createdAt: timestamp('createdAt', { mode: 'date' }).defaultNow().notNull()
});

export const userAdConsent = pgTable(
	'userAdConsent',
	{
		userId: text('userId')
			.notNull()
			.references(() => users.id, { onDelete: 'cascade' }),
		showAdsAsEvents: boolean('showAdsAsEvents').default(true),
		showAdMarkers: boolean('showAdMarkers').default(true),
		personalizedAds: boolean('personalizedAds').default(true),
		updatedAt: timestamp('updatedAt', { mode: 'date' }).defaultNow()
	},
	(userAdConsent) => ({
		compoundKey: primaryKey({ columns: [userAdConsent.userId] })
	})
);

export const waitlist = pgTable('waitlist', {
	id: text('id')
		.notNull()
		.primaryKey()
		.$defaultFn(() => generateId(15)),
	email: text('email').notNull(),
	firstName: text('firstName'),
	lastName: text('lastName'),
	region: text('region'),
	consentedAt: timestamp('consentedAt', { mode: 'date' }),
	preferences: jsonb('preferences').$type<{ marketing: boolean; updates: boolean }>(),
	optedInAt: timestamp('optedInAt', { mode: 'date' }),
	status: text('status').default('pending').notNull(),
	createdAt: timestamp('createdAt', { mode: 'date' }).defaultNow().notNull()
});

export type Family = typeof families.$inferSelect;
export type FamilyInviteCode = typeof familyInviteCodes.$inferSelect;
export type Discount = typeof discounts.$inferSelect;
export type UserDiscount = typeof userDiscounts.$inferSelect;
export type AdEvent = typeof adEvents.$inferSelect;
export type WaitlistEntry = typeof waitlist.$inferSelect;
