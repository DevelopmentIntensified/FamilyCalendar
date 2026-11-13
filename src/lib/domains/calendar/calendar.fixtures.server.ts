/**
 * calendar — row builders for this module's db tests. Kernel seeds only users;
 * these write the four tables calendar owns (`calendars`, `events`,
 * `event_exceptions`, `eventAttendance`) so the goldens and the repo tests can
 * never disagree about a row's shape. Family, settings and user rows stay with
 * their owners' fixtures.
 *
 * Names carry this module's noun where a bare name would collide inside
 * `src/lib/domains/*` (R11): `calendar` already means "a row in `calendars`" to
 * `identity.fixtures.server.ts`.
 *
 * Doc: ./README.md#how-to-test
 */
import {
	calendars,
	eventAttendance,
	eventExceptions,
	events
} from '$lib/kernel/db/tables.server';
import { testDb } from '$lib/kernel/testing/testDb.server';

/** One Event row as a test writes it; omitted columns keep the table defaults. */
export type CalendarEventSeed = typeof events.$inferInsert;

/** One row of `event_exceptions`; `originalDate` and `eventId` are required. */
export type CalendarExceptionSeed = typeof eventExceptions.$inferInsert;

/** One row of `eventAttendance`: a member (`userId`) or a guest (`name`). */
export type CalendarAttendanceSeed = typeof eventAttendance.$inferInsert;

/** A calendar: the viewer's own (`ownerId`) or a family's (`familyId`). */
export async function seedCalendarRow(
	id: string,
	input: { ownerId?: string | null; familyId?: string | null } = {}
) {
	const [row] = await testDb()
		.insert(calendars)
		.values({ id, ownerId: input.ownerId ?? null, familyId: input.familyId ?? null })
		.returning();
	return row;
}

/** One Event row, exactly as given (a one-off, a master or a family mirror). */
export async function seedEventRow(seed: CalendarEventSeed) {
	const [row] = await testDb().insert(events).values(seed).returning();
	return row;
}

/**
 * A weekly series anchored at `start`, interval 1, `count` occurrences. The
 * anchor is the recurrence slot every occurrence id is keyed from, so tests
 * read the series' shape here rather than in five column lists.
 */
export async function seedRecurringEventRow(
	seed: CalendarEventSeed & { count?: number | null }
) {
	const { count, ...columns } = seed;
	const [row] = await testDb()
		.insert(events)
		.values({
			recurrenceFrequency: 'weekly',
			recurrenceInterval: 1,
			recurrenceCount: count ?? null,
			...columns
		})
		.returning();
	return row;
}

/** One Exception Override row (cancelled or edited), keyed by its slot. */
export async function seedExceptionRow(seed: CalendarExceptionSeed) {
	const [row] = await testDb().insert(eventExceptions).values(seed).returning();
	return row;
}

/** Attendance rows: a member invite (`userId`) or a named guest. */
export async function seedAttendanceRow(
	seed: CalendarAttendanceSeed | CalendarAttendanceSeed[]
) {
	const rows = Array.isArray(seed) ? seed : [seed];
	return await testDb().insert(eventAttendance).values(rows).returning();
}
