/**
 * Calendar tables: calendars, events (with their family-mirror origin),
 * per-occurrence exception overrides and event attendance/RSVP rows.
 *
 * Definitions moved verbatim out of the legacy `src/lib/server/db/schema.ts`
 * (task K-04); `calendar` owns them (scripts/arch/registry.mjs TABLE_OWNERS).
 * Ids come from the kernel id port (rule R5).
 *
 * Doc: src/lib/kernel/README.md#database
 */
import {
	boolean,
	index,
	integer,
	pgTable,
	text,
	timestamp,
	uniqueIndex
} from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';
import type { AnyPgColumn } from 'drizzle-orm/pg-core';
import { systemIds } from '$lib/kernel/ids/ids';
import { users } from './identity.tables.server';
import { families } from './family.tables.server';

export const calendars = pgTable('calendars', {
	id: text('id')
		.notNull()
		.primaryKey()
		.$defaultFn(() => systemIds.id()),
	ownerId: text('owner_id').references(() => users.id, { onDelete: 'cascade' }),
	familyId: text('family_id').references(() => families.id, { onDelete: 'cascade' }),
	createdAt: timestamp('created_at').defaultNow().notNull()
});

export type CalendarRow = typeof calendars.$inferSelect;
export type NewCalendarRow = typeof calendars.$inferInsert;

export const eventAttendance = pgTable(
	'eventAttendance',
	{
		id: text('id')
			.primaryKey()
			.$defaultFn(() => crypto.randomUUID())
			.default(sql`gen_random_uuid()::text`),
		eventId: text('event_id')
			.notNull()
			.references(() => events.id, { onDelete: 'cascade' }),
		userId: text('user_id').references(() => users.id, { onDelete: 'cascade' }),
		name: text('name'), // For non-user attendees
		status: text('status').default('undecided'),
		// Family invitations distinguish members who are expected to attend
		// (required) from those who may choose (optional). Guests are always
		// optional. Uninvited members have no row at all.
		inviteType: text('invite_type').default('optional')
	},
	(table) => ({
		// Unique constraint for user attendees
		userUnique: uniqueIndex('event_attendance_user_unique')
			.on(table.eventId, table.userId)
			.where(sql`user_id IS NOT NULL`),
		// Unique constraint for named attendees
		nameUnique: uniqueIndex('event_attendance_name_unique')
			.on(table.eventId, table.name)
			.where(sql`name IS NOT NULL`)
	})
);

export type EventAttendanceRow = typeof eventAttendance.$inferSelect;
export type NewEventAttendanceRow = typeof eventAttendance.$inferInsert;

export const events = pgTable(
	'events',
	{
		id: text('id')
			.notNull()
			.primaryKey()
			.$defaultFn(() => systemIds.id()),
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
		allDay: boolean('all_day').default(false).notNull(),
		recurrenceFrequency: text('recurrence_frequency'),
		recurrenceInterval: integer('recurrence_interval'),
		recurrenceByDay: text('recurrence_by_day').array(),
		recurrenceCount: integer('recurrence_count'),
		recurrenceUntil: timestamp('recurrence_until', {
			withTimezone: true,
			mode: 'string'
		}),
		reminderMinutes: integer('reminder_minutes'),
		// Family-mirror origin: set on the syncEventsToFamilyCalendar copy so the
		// master row can be found and propagated/deleted (issue 014). Nullable,
		// no default: inserts that omit it store NULL (masters + legacy rows).
		// Type-level optionality for writers comes from the CalendarEvent alias.
		mirrorOf: text('mirror_of').references((): AnyPgColumn => events.id, {
			onDelete: 'cascade'
		}),
		created_at: timestamp('created_at').defaultNow().notNull()
	},
	(table) => ({
		mirrorOfIdx: index('events_mirror_of_idx').on(table.mirrorOf),
		calendarIdIdx: index('events_calendar_id_idx').on(table.calendarId),
		calendarIdStartIdx: index('events_calendar_id_start_idx').on(table.calendarId, table.start)
	})
);

export type EventRow = typeof events.$inferSelect;
export type NewEventRow = typeof events.$inferInsert;

export const eventExceptions = pgTable('event_exceptions', {
	id: text('id')
		.notNull()
		.primaryKey()
		.$defaultFn(() => systemIds.id()),
	eventId: text('event_id')
		.notNull()
		.references(() => events.id, { onDelete: 'cascade' }),
	originalDate: timestamp('original_date', {
		withTimezone: true,
		mode: 'string'
	}).notNull(),
	isCancelled: boolean('is_cancelled').default(false).notNull(),
	title: text('title'),
	description: text('description'),
	location: text('location'),
	start: timestamp('start', {
		withTimezone: true,
		mode: 'string'
	}),
	end: timestamp('end', {
		withTimezone: true,
		mode: 'string'
	}),
	allDay: boolean('all_day'),
	createdAt: timestamp('created_at').defaultNow().notNull()
});

export type EventExceptionRow = typeof eventExceptions.$inferSelect;
export type NewEventExceptionRow = typeof eventExceptions.$inferInsert;
