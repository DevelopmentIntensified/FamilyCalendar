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
	uuid
} from 'drizzle-orm/pg-core';

export const users = pgTable('users', {
	id: text('id').notNull().primaryKey(),
	firstName: text('firstName').notNull(),
	lastName: text('lastName').notNull(),
	email: text('email').notNull(),
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

export const subscriptions = pgTable('activeSubscriptions', {
	id: serial('id').notNull().primaryKey(),
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
	endDate: timestamp('endDate', { mode: 'date' }).notNull()
});

export const subscriptionTypes = pgTable('subscriptionTypes', {
	id: text('id').notNull().primaryKey(),
	name: text('name').notNull(),
	createdAt: timestamp('createdAt', { mode: 'date' }).defaultNow().notNull(),
	updatedAt: timestamp('updatedAt', { mode: 'date' })
		.defaultNow()
		.$onUpdate(() => new Date())
		.notNull(),
	durationMonths: integer('durationMonths').notNull(),
	enabled: boolean('enabled').default(true).notNull()
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
});

export const sessions = pgTable('sessions', {
	id: text('id').notNull().primaryKey(),
	userId: text('user_id')
		.notNull()
		.references(() => users.id, { onDelete: 'cascade' }),
	expiresAt: timestamp('expires_at', { withTimezone: true, mode: 'date' }).notNull()
});

export const userFamilies = pgTable("userFamilies", {
	id: serial('id').notNull().primaryKey(),
	userId: text('user_id')
		.notNull()
		.references(() => users.id),
	familyId: text('family_id')
		.notNull()
		.references(() => families.id),
})

export const families = pgTable("families", {
	id: text('id').notNull().primaryKey(),
	createdAt: timestamp('created_at').defaultNow().notNull(),
})

export const calendars = pgTable("calendars", {
	id: text('id').notNull().primaryKey(),
	userId: text('user_id')
		.notNull()
		.references(() => users.id),
	createdAt: timestamp('created_at').defaultNow().notNull(),
})


export type Session = typeof sessions.$inferSelect;
export type Code = typeof codes.$inferSelect;

export type User = typeof users.$inferSelect;
export type Family = typeof families.$inferSelect;
