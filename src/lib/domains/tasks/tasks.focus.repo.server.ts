/**
 * tasks focus repo: the TaskFocus device command FIFO and the phone focus
 * sessions.
 *
 * Every read and write is scoped to the caller's `userId`; another user's id
 * is indistinguishable from an unknown one. Writes that must not touch an
 * absorbed row carry `absorbed_at IS NULL`, so a concurrent absorb wins
 * cleanly, and an insert that loses the one-open-session race answers `null`
 * (the partial unique index).
 *
 * Writes take the caller's `now` (rule R5); every session/command timestamp is
 * a `Date` (`mode:'date'`).
 *
 * Doc: ./README.md#invariants
 */
import { and, asc, eq, isNotNull, isNull, lt } from 'drizzle-orm';
import type { Db } from '$lib/kernel/db/database.server';
import {
	type NewTaskfocusCommandRow,
	type NewTaskfocusSessionRow,
	taskfocusCommands,
	type TaskfocusCommandRow,
	taskfocusSessions,
	type TaskfocusSessionRow
} from '$lib/kernel/db/tables.server';

// --- Commands ---------------------------------------------------------------

/** Enqueue one device command. */
export async function insertCommand(
	db: Db,
	values: NewTaskfocusCommandRow
): Promise<TaskfocusCommandRow> {
	const [row] = await db.insert(taskfocusCommands).values(values).returning();
	if (!row) throw new Error('insertCommand: insert returned no row');
	return row;
}

/** Hygiene: drop the caller's commands issued before `cutoff`. Returns the count. */
export async function deleteStaleCommands(
	db: Db,
	values: { readonly userId: string; readonly cutoff: Date }
): Promise<number> {
	const removed = await db
		.delete(taskfocusCommands)
		.where(
			and(
				eq(taskfocusCommands.userId, values.userId),
				lt(taskfocusCommands.issuedAt, values.cutoff)
			)
		)
		.returning({ id: taskfocusCommands.id });
	return removed.length;
}

/** The caller's queue, oldest first, capped by `limit`. */
export async function listCommands(
	db: Db,
	values: { readonly userId: string; readonly limit: number }
): Promise<TaskfocusCommandRow[]> {
	return await db
		.select()
		.from(taskfocusCommands)
		.where(eq(taskfocusCommands.userId, values.userId))
		.orderBy(asc(taskfocusCommands.issuedAt), asc(taskfocusCommands.id))
		.limit(values.limit);
}

/** Ack one command; an unknown or foreign id removes nothing. Returns the count. */
export async function ackCommand(
	db: Db,
	values: { readonly userId: string; readonly id: string }
): Promise<number> {
	const removed = await db
		.delete(taskfocusCommands)
		.where(
			and(eq(taskfocusCommands.id, values.id), eq(taskfocusCommands.userId, values.userId))
		)
		.returning({ id: taskfocusCommands.id });
	return removed.length;
}

// --- Sessions ---------------------------------------------------------------

/** True for a Postgres unique violation (raw or drizzle-wrapped). */
function isUniqueViolation(error: unknown): boolean {
	for (let e: unknown = error; e && typeof e === 'object'; e = 'cause' in e ? e.cause : undefined) {
		if ('code' in e && e.code === '23505') return true;
	}
	return false;
}

/**
 * Open or record a phone session. `null` when the one-open-session index
 * rejected a second open start (the caller reports the running session id).
 */
export async function insertSession(
	db: Db,
	values: NewTaskfocusSessionRow
): Promise<TaskfocusSessionRow | null> {
	try {
		const [row] = await db.insert(taskfocusSessions).values(values).returning();
		return row ?? null;
	} catch (error) {
		if (isUniqueViolation(error)) return null;
		throw error;
	}
}

/** One of the caller's sessions by id. */
export async function findSession(
	db: Db,
	values: { readonly userId: string; readonly id: string }
): Promise<TaskfocusSessionRow | null> {
	const [row] = await db
		.select()
		.from(taskfocusSessions)
		.where(
			and(eq(taskfocusSessions.id, values.id), eq(taskfocusSessions.userId, values.userId))
		);
	return row ?? null;
}

/** The caller's currently running session, if any (at most one). */
export async function findOpenSession(
	db: Db,
	userId: string
): Promise<TaskfocusSessionRow | null> {
	const [row] = await db
		.select()
		.from(taskfocusSessions)
		.where(and(eq(taskfocusSessions.userId, userId), isNull(taskfocusSessions.endedAt)));
	return row ?? null;
}

/**
 * Close a session (or overwrite an already-closed one's end). `null` when the
 * row was absorbed between the read and this write.
 */
export async function setSessionEndedAt(
	db: Db,
	values: { readonly userId: string; readonly id: string; readonly endedAt: Date }
): Promise<TaskfocusSessionRow | null> {
	const [row] = await db
		.update(taskfocusSessions)
		.set({ endedAt: values.endedAt })
		.where(
			and(
				eq(taskfocusSessions.id, values.id),
				eq(taskfocusSessions.userId, values.userId),
				isNull(taskfocusSessions.absorbedAt)
			)
		)
		.returning();
	return row ?? null;
}

/** Discard an unabsorbed session (open or closed). Returns whether it existed. */
export async function deleteUnabsorbedSession(
	db: Db,
	values: { readonly userId: string; readonly id: string }
): Promise<boolean> {
	const removed = await db
		.delete(taskfocusSessions)
		.where(
			and(
				eq(taskfocusSessions.id, values.id),
				eq(taskfocusSessions.userId, values.userId),
				isNull(taskfocusSessions.absorbedAt)
			)
		)
		.returning({ id: taskfocusSessions.id });
	return removed.length > 0;
}

/**
 * The desktop's absorb ack: stamp `absorbedAt` on a CLOSED, not-yet-absorbed
 * session. `null` when it is open or already absorbed (the service tells the
 * two apart by re-reading).
 */
export async function absorbSession(
	db: Db,
	values: { readonly userId: string; readonly id: string; readonly absorbedAt: Date }
): Promise<TaskfocusSessionRow | null> {
	const [row] = await db
		.update(taskfocusSessions)
		.set({ absorbedAt: values.absorbedAt })
		.where(
			and(
				eq(taskfocusSessions.id, values.id),
				eq(taskfocusSessions.userId, values.userId),
				isNull(taskfocusSessions.absorbedAt),
				isNotNull(taskfocusSessions.endedAt)
			)
		)
		.returning();
	return row ?? null;
}

/** Closed + unabsorbed sessions, oldest first, capped (the desktop's pull). */
export async function listClosedUnabsorbedSessions(
	db: Db,
	values: { readonly userId: string; readonly limit: number }
): Promise<TaskfocusSessionRow[]> {
	return await db
		.select()
		.from(taskfocusSessions)
		.where(
			and(
				eq(taskfocusSessions.userId, values.userId),
				isNull(taskfocusSessions.absorbedAt),
				isNotNull(taskfocusSessions.endedAt)
			)
		)
		.orderBy(asc(taskfocusSessions.startedAt), asc(taskfocusSessions.id))
		.limit(values.limit);
}

/**
 * Every unabsorbed row (closed and open) — the `GET /api/tasks` overlay.
 * Unordered: the overlay sums and takes the earliest start, so the store
 * claims no order.
 */
export async function listUnabsorbedSessions(
	db: Db,
	userId: string
): Promise<TaskfocusSessionRow[]> {
	return await db
		.select()
		.from(taskfocusSessions)
		.where(and(eq(taskfocusSessions.userId, userId), isNull(taskfocusSessions.absorbedAt)));
}
