// Phone focus sessions (#293, TaskFocus #124): the FamilyPlanz phone's own
// focus log. One writer per field: the phone writes sessions here, never
// tasks.focusMinutes. The desktop absorbs CLOSED sessions (imports them,
// PUTs focusMinutes, then acks via absorb). Until absorbed, GET /api/tasks
// reports them separately as phoneFocusMinutes / phoneFocusStartedAt.

import { and, asc, eq, isNotNull, isNull } from 'drizzle-orm';
import { db } from '$lib/server/db';
import { tasks, taskfocusSessions, type TaskfocusSession } from '$lib/server/db/schema';
import { canMutateTask } from './tasks';

/** A start may be at most this far ahead of the server clock (phone skew). */
export const MAX_START_SKEW_MS = 5 * 60 * 1000;
/** A finished session may last at most this long. */
export const MAX_SESSION_MS = 12 * 60 * 60 * 1000;
/** GET ?unabsorbed=1 page size. */
export const UNABSORBED_LIMIT = 200;

/** `{session}` wire shape (POST / PATCH / absorb). */
export type SessionDto = {
	id: string;
	taskId: string;
	startedAt: string;
	endedAt: string | null;
	source: string;
	absorbedAt: string | null;
	createdAt: string;
};

/** GET ?unabsorbed=1 list item (contract: exactly these five fields). */
export type UnabsorbedSessionDto = Pick<
	SessionDto,
	'id' | 'taskId' | 'startedAt' | 'endedAt' | 'source'
>;

export function toSessionDto(row: TaskfocusSession): SessionDto {
	return {
		id: row.id,
		taskId: row.taskId,
		startedAt: row.startedAt.toISOString(),
		endedAt: row.endedAt ? row.endedAt.toISOString() : null,
		source: row.source,
		absorbedAt: row.absorbedAt ? row.absorbedAt.toISOString() : null,
		createdAt: row.createdAt.toISOString()
	};
}

export function toUnabsorbedDto(row: TaskfocusSession): UnabsorbedSessionDto {
	const { id, taskId, startedAt, endedAt, source } = toSessionDto(row);
	return { id, taskId, startedAt, endedAt, source };
}

type Parsed<T> = { ok: true; value: T } | { ok: false; error: string };

/** Strict-ish ISO timestamp: a string Date.parse accepts. */
// oxlint-disable-next-line anti-slop/no-unknown-parameters -- boundary parser: raw request-body field.
function parseInstant(raw: unknown, field: string): Parsed<Date> {
	// oxlint-disable-next-line anti-slop/no-runtime-typeof -- this IS the boundary parse of a raw body field.
	if (typeof raw !== 'string' || raw.trim() === '')
		return { ok: false, error: `${field} is required` };
	const ms = Date.parse(raw);
	if (Number.isNaN(ms)) return { ok: false, error: `Invalid ${field}` };
	return { ok: true, value: new Date(ms) };
}

/**
 * The contract's time rules: start ≤ now + 5 min; when ended, endedAt >
 * startedAt and endedAt − startedAt ≤ 12 h. Returns the error text or null.
 */
export function sessionTimesError(startedAt: Date, endedAt: Date | null, now: Date): string | null {
	if (startedAt.getTime() > now.getTime() + MAX_START_SKEW_MS) {
		return 'startedAt is more than 5 minutes in the future';
	}
	return endedAt ? durationError(startedAt, endedAt) : null;
}

/** endedAt > startedAt and the span is at most 12 h. */
function durationError(startedAt: Date, endedAt: Date): string | null {
	const ms = endedAt.getTime() - startedAt.getTime();
	if (ms <= 0) return 'endedAt must be after startedAt';
	if (ms > MAX_SESSION_MS) return 'Session is longer than 12 hours';
	return null;
}

/**
 * DB seam. Every read/write is scoped to `userId`. Writes that must not
 * touch an absorbed row carry `absorbed_at IS NULL` in their WHERE, so a
 * concurrent absorb wins cleanly. `insert` returns undefined when the
 * one-open-session-per-user partial unique index rejects it.
 */
export type TaskfocusSessionStore = {
	canSeeTask(userId: string, taskId: string): Promise<boolean>;
	findById(userId: string, id: string): Promise<TaskfocusSession | undefined>;
	findOpen(userId: string): Promise<TaskfocusSession | undefined>;
	insert(row: {
		userId: string;
		taskId: string;
		startedAt: Date;
		endedAt: Date | null;
	}): Promise<TaskfocusSession | undefined>;
	setEndedAt(userId: string, id: string, endedAt: Date): Promise<TaskfocusSession | undefined>;
	deleteUnabsorbed(userId: string, id: string): Promise<boolean>;
	markAbsorbed(userId: string, id: string, at: Date): Promise<TaskfocusSession | undefined>;
	/** Closed + unabsorbed, oldest first. */
	listClosedUnabsorbed(userId: string, limit: number): Promise<TaskfocusSession[]>;
	/** Every unabsorbed row (closed and open) — the GET /api/tasks overlay. */
	listUnabsorbed(userId: string): Promise<TaskfocusSession[]>;
};

/** True for a Postgres unique violation (raw or drizzle-wrapped). */
// oxlint-disable-next-line anti-slop/no-unknown-parameters -- walks a thrown value's cause chain (same as taskCategories).
function isUniqueViolation(err: unknown): boolean {
	// oxlint-disable-next-line anti-slop/no-runtime-typeof -- narrowing a caught value before reading .code.
	for (let e: unknown = err; e && typeof e === 'object'; e = 'cause' in e ? e.cause : undefined) {
		if ('code' in e && e.code === '23505') return true;
	}
	return false;
}

const mine = (userId: string, id: string) =>
	and(eq(taskfocusSessions.id, id), eq(taskfocusSessions.userId, userId));

export const drizzleTaskfocusSessionStore: TaskfocusSessionStore = {
	async canSeeTask(userId, taskId) {
		// Same access check as PUT /api/tasks/[id]: owner, live assignee,
		// or (family task) any member of its family. Archived = gone.
		const [task] = await db.select().from(tasks).where(eq(tasks.id, taskId));
		if (!task || task.archivedAt) return false;
		return canMutateTask(task, userId);
	},
	async findById(userId, id) {
		const [row] = await db.select().from(taskfocusSessions).where(mine(userId, id));
		return row;
	},
	async findOpen(userId) {
		const [row] = await db
			.select()
			.from(taskfocusSessions)
			.where(and(eq(taskfocusSessions.userId, userId), isNull(taskfocusSessions.endedAt)));
		return row;
	},
	async insert(row) {
		try {
			const [created] = await db.insert(taskfocusSessions).values(row).returning();
			return created;
		} catch (err) {
			if (isUniqueViolation(err)) return undefined;
			throw err;
		}
	},
	async setEndedAt(userId, id, endedAt) {
		const [row] = await db
			.update(taskfocusSessions)
			.set({ endedAt })
			.where(and(mine(userId, id), isNull(taskfocusSessions.absorbedAt)))
			.returning();
		return row;
	},
	async deleteUnabsorbed(userId, id) {
		const rows = await db
			.delete(taskfocusSessions)
			.where(and(mine(userId, id), isNull(taskfocusSessions.absorbedAt)))
			.returning({ id: taskfocusSessions.id });
		return rows.length > 0;
	},
	async markAbsorbed(userId, id, at) {
		const [row] = await db
			.update(taskfocusSessions)
			.set({ absorbedAt: at })
			.where(
				and(
					mine(userId, id),
					isNull(taskfocusSessions.absorbedAt),
					isNotNull(taskfocusSessions.endedAt)
				)
			)
			.returning();
		return row;
	},
	async listClosedUnabsorbed(userId, limit) {
		return db
			.select()
			.from(taskfocusSessions)
			.where(
				and(
					eq(taskfocusSessions.userId, userId),
					isNull(taskfocusSessions.absorbedAt),
					isNotNull(taskfocusSessions.endedAt)
				)
			)
			.orderBy(asc(taskfocusSessions.startedAt), asc(taskfocusSessions.id))
			.limit(limit);
	},
	async listUnabsorbed(userId) {
		return db
			.select()
			.from(taskfocusSessions)
			.where(and(eq(taskfocusSessions.userId, userId), isNull(taskfocusSessions.absorbedAt)));
	}
};

export type CreateResult =
	| { kind: 'created'; session: TaskfocusSession }
	| { kind: 'invalid'; error: string }
	| { kind: 'task_not_found' }
	| { kind: 'open_exists'; openSessionId: string };

/**
 * POST: `{taskId, startedAt, endedAt?}`. Without endedAt the session is
 * open (running); a user may have only one open session — a second open
 * POST is refused with the open session's id (the phone stops it first).
 * With endedAt it is a finished session recorded offline, never refused
 * for an open one.
 */
export async function createPhoneSession(
	userId: string,
	// oxlint-disable-next-line anti-slop/no-unsafe-dictionary-type -- raw JSON request body; this function IS its boundary parser.
	body: Record<string, unknown>,
	now: Date = new Date(),
	store: TaskfocusSessionStore = drizzleTaskfocusSessionStore
): Promise<CreateResult> {
	// oxlint-disable-next-line anti-slop/no-runtime-typeof -- boundary parse of the raw taskId field.
	if (typeof body.taskId !== 'string' || body.taskId.trim() === '') {
		return { kind: 'invalid', error: 'taskId is required' };
	}
	const started = parseInstant(body.startedAt, 'startedAt');
	if (!started.ok) return { kind: 'invalid', error: started.error };
	let endedAt: Date | null = null;
	if (body.endedAt !== undefined && body.endedAt !== null) {
		const ended = parseInstant(body.endedAt, 'endedAt');
		if (!ended.ok) return { kind: 'invalid', error: ended.error };
		endedAt = ended.value;
	}
	const timesError = sessionTimesError(started.value, endedAt, now);
	if (timesError) return { kind: 'invalid', error: timesError };

	if (!(await store.canSeeTask(userId, body.taskId))) return { kind: 'task_not_found' };

	if (!endedAt) {
		const open = await store.findOpen(userId);
		if (open) return { kind: 'open_exists', openSessionId: open.id };
	}
	const session = await store.insert({
		userId,
		taskId: body.taskId,
		startedAt: started.value,
		endedAt
	});
	if (!session) {
		// Lost a race with a concurrent open POST (partial unique index).
		const open = await store.findOpen(userId);
		return { kind: 'open_exists', openSessionId: open?.id ?? '' };
	}
	return { kind: 'created', session };
}

export type EndResult =
	| { kind: 'ended'; session: TaskfocusSession }
	| { kind: 'invalid'; error: string }
	| { kind: 'not_found' }
	| { kind: 'absorbed' };

/**
 * PATCH `{endedAt}`: closes an open session. Re-PATCHing a closed but
 * unabsorbed session overwrites endedAt (a retried stop succeeds). Same
 * time rules as POST, measured from the stored startedAt.
 */
export async function endPhoneSession(
	userId: string,
	id: string,
	// oxlint-disable-next-line anti-slop/no-unsafe-dictionary-type -- raw JSON request body; this function IS its boundary parser.
	body: Record<string, unknown>,
	store: TaskfocusSessionStore = drizzleTaskfocusSessionStore
): Promise<EndResult> {
	const ended = parseInstant(body.endedAt, 'endedAt');
	if (!ended.ok) return { kind: 'invalid', error: ended.error };
	const existing = await store.findById(userId, id);
	if (!existing) return { kind: 'not_found' };
	if (existing.absorbedAt) return { kind: 'absorbed' };
	const timesError = durationError(existing.startedAt, ended.value);
	if (timesError) return { kind: 'invalid', error: timesError };
	const session = await store.setEndedAt(userId, id, ended.value);
	// Absorbed between the read and the write.
	if (!session) return { kind: 'absorbed' };
	return { kind: 'ended', session };
}

export type DeleteResult = 'deleted' | 'not_found' | 'absorbed';

/** DELETE: discards an unabsorbed session (open or closed). */
export async function deletePhoneSession(
	userId: string,
	id: string,
	store: TaskfocusSessionStore = drizzleTaskfocusSessionStore
): Promise<DeleteResult> {
	if (await store.deleteUnabsorbed(userId, id)) return 'deleted';
	const existing = await store.findById(userId, id);
	return existing ? 'absorbed' : 'not_found';
}

export type AbsorbResult =
	| { kind: 'absorbed'; session: TaskfocusSession }
	| { kind: 'not_found' }
	| { kind: 'open' };

/** absorb: idempotent desktop ack. Only closed sessions can be absorbed. */
export async function absorbPhoneSession(
	userId: string,
	id: string,
	now: Date = new Date(),
	store: TaskfocusSessionStore = drizzleTaskfocusSessionStore
): Promise<AbsorbResult> {
	const marked = await store.markAbsorbed(userId, id, now);
	if (marked) return { kind: 'absorbed', session: marked };
	const existing = await store.findById(userId, id);
	if (!existing) return { kind: 'not_found' };
	if (existing.absorbedAt) return { kind: 'absorbed', session: existing };
	return { kind: 'open' };
}

export async function listUnabsorbedSessions(
	userId: string,
	store: TaskfocusSessionStore = drizzleTaskfocusSessionStore
): Promise<TaskfocusSession[]> {
	return store.listClosedUnabsorbed(userId, UNABSORBED_LIMIT);
}

export type PhoneFocus = { phoneFocusMinutes: number; phoneFocusStartedAt: Date | null };

/**
 * Per-task overlay from the caller's UNABSORBED rows: closed ones sum into
 * whole minutes (floor of the summed duration, not per session); an open
 * one sets phoneFocusStartedAt. Absorbed rows must not be passed in (the
 * store filters them) but are ignored defensively.
 */
export function summarizePhoneFocus(rows: TaskfocusSession[]): Map<string, PhoneFocus> {
	const ms = new Map<string, number>();
	const open = new Map<string, Date>();
	for (const r of rows) {
		if (r.absorbedAt) continue;
		if (r.endedAt) {
			const d = Math.max(0, r.endedAt.getTime() - r.startedAt.getTime());
			ms.set(r.taskId, (ms.get(r.taskId) ?? 0) + d);
		} else {
			const prev = open.get(r.taskId);
			if (!prev || r.startedAt < prev) open.set(r.taskId, r.startedAt);
		}
	}
	const out = new Map<string, PhoneFocus>();
	for (const taskId of new Set([...ms.keys(), ...open.keys()])) {
		out.set(taskId, {
			phoneFocusMinutes: Math.floor((ms.get(taskId) ?? 0) / 60000),
			phoneFocusStartedAt: open.get(taskId) ?? null
		});
	}
	return out;
}

/**
 * Attaches phoneFocusMinutes (0 when none) and phoneFocusStartedAt (null)
 * to every task row, from the CALLER's sessions only. focusMinutes and
 * focusStartedAt are left untouched (desktop-owned).
 */
export async function withPhoneFocus<T extends { id: string }>(
	userId: string,
	rows: T[],
	store: TaskfocusSessionStore = drizzleTaskfocusSessionStore
): Promise<(T & PhoneFocus)[]> {
	const summary = rows.length ? summarizePhoneFocus(await store.listUnabsorbed(userId)) : new Map();
	return rows.map((r) => ({
		...r,
		phoneFocusMinutes: summary.get(r.id)?.phoneFocusMinutes ?? 0,
		phoneFocusStartedAt: summary.get(r.id)?.phoneFocusStartedAt ?? null
	}));
}
