/**
 * Tasks tables: tasks themselves, their tag join, the completion log, the
 * per-user category list, and the TaskFocus device command/phone-session
 * channel.
 *
 * Definitions moved verbatim out of the legacy `src/lib/server/db/schema.ts`
 * (task K-04); `tasks` owns them (scripts/arch/registry.mjs TABLE_OWNERS). Ids
 * come from the kernel id port (rule R5).
 *
 * Doc: src/lib/kernel/README.md#database
 */
import {
	index,
	integer,
	pgTable,
	primaryKey,
	text,
	timestamp,
	uniqueIndex
} from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';
import { systemIds } from '$lib/kernel/ids/ids';
import { users } from './identity.tables.server';
import { families } from './family.tables.server';
import { events } from './calendar.tables.server';

/**
 * TaskFocus device command channel (021): a phone enqueues start/stop; the
 * desktop pulls FIFO (oldest first) and acks by DELETE (idempotent). task_id
 * is nullable — "stop" may target whatever is running.
 */
export const taskfocusCommands = pgTable(
	'taskfocus_commands',
	{
		id: text('id')
			.notNull()
			.primaryKey()
			.$defaultFn(() => systemIds.id()),
		userId: text('user_id')
			.notNull()
			.references(() => users.id, { onDelete: 'cascade' }),
		// 'start' | 'stop'
		command: text('command').notNull(),
		taskId: text('task_id').references(() => tasks.id, { onDelete: 'cascade' }),
		issuedAt: timestamp('issued_at', { withTimezone: true, mode: 'date' })
			.defaultNow()
			.notNull()
	},
	(table) => ({
		userQueueIdx: index('taskfocus_commands_user_queue_idx').on(table.userId, table.issuedAt)
	})
);

export type TaskfocusCommandRow = typeof taskfocusCommands.$inferSelect;
export type NewTaskfocusCommandRow = typeof taskfocusCommands.$inferInsert;

/**
 * Phone focus sessions (#293, TaskFocus #124): the phone's own focus log.
 * The phone never writes tasks.focusMinutes; the desktop absorbs closed
 * sessions into its history, PUTs the new total, then acks (absorbed_at).
 * Until then GET /api/tasks reports them as phoneFocusMinutes /
 * phoneFocusStartedAt. ended_at null = running; at most one running
 * session per user (partial unique index).
 */
export const taskfocusSessions = pgTable(
	'taskfocus_sessions',
	{
		id: text('id')
			.notNull()
			.primaryKey()
			.$defaultFn(() => systemIds.id()),
		userId: text('user_id')
			.notNull()
			.references(() => users.id, { onDelete: 'cascade' }),
		taskId: text('task_id')
			.notNull()
			.references(() => tasks.id, { onDelete: 'cascade' }),
		startedAt: timestamp('started_at', { withTimezone: true, mode: 'date' }).notNull(),
		endedAt: timestamp('ended_at', { withTimezone: true, mode: 'date' }),
		source: text('source').notNull().default('phone'),
		absorbedAt: timestamp('absorbed_at', { withTimezone: true, mode: 'date' }),
		createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' }).defaultNow().notNull()
	},
	(table) => ({
		userAbsorbedStartedIdx: index('taskfocus_sessions_user_absorbed_started_idx').on(
			table.userId,
			table.absorbedAt,
			table.startedAt
		),
		userOpenUnique: uniqueIndex('taskfocus_sessions_user_open_unique')
			.on(table.userId)
			.where(sql`${table.endedAt} IS NULL`)
	})
);

export type TaskfocusSessionRow = typeof taskfocusSessions.$inferSelect;
export type NewTaskfocusSessionRow = typeof taskfocusSessions.$inferInsert;

export const tasks = pgTable('tasks', {
	id: text('id')
		.notNull()
		.primaryKey()
		.$defaultFn(() => systemIds.id()),
	title: text('title').notNull(),
	notes: text('notes'),
	dueDate: timestamp('due_date', { withTimezone: true, mode: 'string' }),
	completedAt: timestamp('completed_at', { withTimezone: true, mode: 'string' }),
	// Filled when a completed task is cleared/removed. The row survives so
	// task stats and completion history (streaks) aren't wiped by clearing.
	archivedAt: timestamp('archived_at', { withTimezone: true, mode: 'string' }),
	recurrenceFrequency: text('recurrence_frequency'),
	recurrenceInterval: integer('recurrence_interval'),
	// Times a Recurring Task occurrence has been checked off.
	completionCount: integer('completion_count').default(0).notNull(),
	assignedTo: text('assigned_to').references(() => users.id, { onDelete: 'set null' }),
	assignmentStatus: text('assignment_status').default('none'),
	// Task Priority (low | normal | high) — drives the Top-3 Priorities
	// dashboard card. Kept as plain text, consistent with recurrence/status.
	priority: text('priority').notNull().default('normal'),
	// Task scoping (issue 019): 'public' | 'private'. Plain text, consistent
	// with priority/assignmentStatus. Public personal tasks are family-readable
	// (read-only); private ones only reach owner + assignee via the section
	// queries. Default 'public' for new rows.
	visibility: text('visibility').notNull().default('public'),
	userId: text('user_id')
		.notNull()
		.references(() => users.id, { onDelete: 'cascade' }),
	familyId: text('family_id').references(() => families.id, { onDelete: 'cascade' }),
	eventId: text('event_id').references(() => events.id, { onDelete: 'cascade' }),
	// TaskFocus: whole focus minutes accrued by the desktop clock. One writer
	// (the desktop push); the phone only reads. Null = no time yet — a PUT
	// without the field never resets it (021 / device-channel spec).
	focusMinutes: integer('focus_minutes'),
	// TaskFocus: when the current focus began, null when idle. Desktop-written;
	// unlike focusMinutes an explicit null on PUT clears it ("stopped") (022).
	focusStartedAt: timestamp('focus_started_at', { withTimezone: true }),
	// Task category (#280): a NAME shared with TaskFocus (its rule-sets stay
	// desktop-side). Null = uncategorized. <= 80 chars, trimmed; setting one
	// auto-adds it to the caller's taskCategories list (024).
	category: text('category'),
	createdAt: timestamp('created_at').defaultNow().notNull()
});

export type TaskRow = typeof tasks.$inferSelect;
export type NewTaskRow = typeof tasks.$inferInsert;

/**
 * Per-user task category list (#280), synced by name with TaskFocus.
 * Unique per user, case-insensitive (lower(name)). Renames/deletes
 * propagate to the user's tasks (owned or assigned) carrying the name.
 */
export const taskCategories = pgTable(
	'task_categories',
	{
		id: text('id')
			.notNull()
			.primaryKey()
			.$defaultFn(() => systemIds.id()),
		userId: text('user_id')
			.notNull()
			.references(() => users.id, { onDelete: 'cascade' }),
		name: text('name').notNull(),
		createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' }).defaultNow().notNull(),
		updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'date' }).defaultNow().notNull()
	},
	(table) => ({
		userNameUnique: uniqueIndex('task_categories_user_name_unique').on(
			table.userId,
			sql`lower(${table.name})`
		)
	})
);
export type TaskCategoryRow = typeof taskCategories.$inferSelect;
export type NewTaskCategoryRow = typeof taskCategories.$inferInsert;

/**
 * Task scoping (issue 019) — visibility of a personal task to the rest of
 * the owner's family. 'public' = family-readable (read-only), 'private' =
 * owner + assignee only. Plain-text enum, same style as BILL_CATEGORIES.
 */
export const TASK_VISIBILITIES = ['public', 'private'] as const;

export type TaskVisibility = (typeof TASK_VISIBILITIES)[number];

/**
 * Task tags — many-to-many-ish join keyed by task + lowercase tag name.
 * Kept as plain text (matching priority/recurrence), deduped on write.
 * Circle back: a task's tags render as chips and drive tag search/filter.
 */
export const taskTags = pgTable(
	'taskTags',
	{
		taskId: text('taskId')
			.notNull()
			.references(() => tasks.id, { onDelete: 'cascade' }),
		name: text('name').notNull()
	},
	(taskTag) => ({
		compoundKey: primaryKey({ columns: [taskTag.taskId, taskTag.name] })
	})
);

export type TaskTagRow = typeof taskTags.$inferSelect;
export type NewTaskTagRow = typeof taskTags.$inferInsert;

/**
 * One row per Recurring Task check-off (and per one-off completion).
 * Powers streaks and completion history — tasks.completionCount alone
 * can't answer "when".
 */
export const taskCompletions = pgTable('taskCompletions', {
	id: text('id')
		.notNull()
		.primaryKey()
		.$defaultFn(() => systemIds.id()),
	taskId: text('taskId')
		.notNull()
		.references(() => tasks.id, { onDelete: 'cascade' }),
	// Who the completion is attributed to by default (the task owner for
	// legacy rows; see actorId below).
	userId: text('userId')
		.notNull()
		.references(() => users.id, { onDelete: 'cascade' }),
	// The ACTING user who checked the task off (nullable — additive in #013;
	// legacy rows have no actor and fall back to userId attribution).
	actorId: text('actorId').references(() => users.id, { onDelete: 'set null' }),
	familyId: text('familyId').references(() => families.id, { onDelete: 'cascade' }),
	completedAt: timestamp('completedAt', { withTimezone: true, mode: 'string' })
		.defaultNow()
		.notNull()
});

export type TaskCompletionRow = typeof taskCompletions.$inferSelect;
export type NewTaskCompletionRow = typeof taskCompletions.$inferInsert;
