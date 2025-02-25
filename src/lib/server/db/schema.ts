import { pgTable, serial, text, integer, timestamp } from 'drizzle-orm/pg-core';

export const user = pgTable('user', {
	id: text('id').primaryKey(),
	createdAt: timestamp('created_at').defaultNow().notNull(),
});

export const session = pgTable('session', {
	id: text('id').primaryKey(),
	createdAt: timestamp('created_at').defaultNow().notNull(),
	userId: text('user_id')
		.notNull()
		.references(() => user.id),
	expiresAt: timestamp('expires_at', { withTimezone: true, mode: 'date' }).notNull()
});

export const userFamilies = pgTable("userFamilies", {
	id: text('id').primaryKey(),
	userId: text('user_id')
		.notNull()
		.references(() => user.id),
	familyId: text('family_id')
		.notNull()
		.references(() => families.id),
})

export const families = pgTable("families", {
	id: text('id').primaryKey(),
	createdAt: timestamp('created_at').defaultNow().notNull(),
})

export const calendars = pgTable("calendars", {
	id: text('id').primaryKey(),
	userId: text('user_id')
		.notNull()
		.references(() => user.id),
	createdAt: timestamp('created_at').defaultNow().notNull(),
})


export type Session = typeof session.$inferSelect;

export type User = typeof user.$inferSelect;
export type Family = typeof families.$inferSelect;
