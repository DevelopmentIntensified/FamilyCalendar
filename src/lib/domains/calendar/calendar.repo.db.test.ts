/**
 * The calendar repo against real Postgres: every query that filters, orders,
 * joins, upserts or cuts off. Each test runs in `rollbackTest`, so the rows it
 * seeds vanish afterwards; fixtures take the transaction's `db` for that.
 *
 * Expected values come from the legacy query each function ports (its WHERE /
 * ORDER BY) and the README Invariants, never from running the code.
 *
 * Doc: ./README.md#how-to-test
 */
import { describe, expect } from 'vitest';
import type { Db } from '$lib/kernel/db/database.server';
import { seedUser } from '$lib/kernel/testing/seedRows.server';
import { rollbackTest } from '$lib/kernel/testing/testDb.server';
import { seedFamily } from '$lib/domains/family/family.fixtures.server';
import {
	seedAttendanceRow,
	seedCalendarRow,
	seedEventRow,
	seedExceptionRow,
	seedRecurringEventRow
} from './calendar.fixtures.server';
import {
	attendanceSummaries,
	deleteEventRow,
	deleteExceptionsForEvent,
	deleteImportedRows,
	deleteMirrorRows,
	ensurePersonalCalendarRow,
	findAccessibleCalendarIds,
	findCalendar,
	findEvent,
	findException,
	findExceptions,
	findOwnedCalendarIds,
	findWindowEventRows,
	insertEventRow,
	listAttendance,
	listCreatorNames,
	listEventsByCalendar,
	listExistingDedupeKeys,
	listFamilyCalendars,
	listGuestNames,
	listOwnedCalendars,
	listRsvpStatuses,
	listUndoCandidates,
	replaceInvites,
	updateEventRow,
	updateExceptionRow,
	upsertExceptionRow,
	upsertRsvp
} from './calendar.repo.server';

const PERSONAL = 'calpersonal001';
const FAMILY_CAL = 'calfamily0001';
const OTHER_FAMILY_CAL = 'calfamily0002';
const STRANGER_CAL = 'calstranger01';

const sortedIds = (rows: readonly { id: string }[]) => rows.map((row) => row.id).sort();

/** A stored timestamptz in its one comparable form (the rows arrive text-rendered). */
const storedIso = (value: unknown): string => new Date(String(value)).toISOString();

/** A family row then its calendar (calendars.familyId is a real FK). */
async function seedFamilyCalendar(calendarId: string, familyId: string, db: Db) {
	await seedFamily(familyId, {}, db);
	return seedCalendarRow(calendarId, { familyId }, db);
}

describe('calendar scope', () => {
	rollbackTest('findAccessibleCalendarIds adds every family calendar the viewer belongs to, not just the first', async (db) => {
		const viewer = await seedUser(db, { firstName: 'Mia' });
		const partner = await seedUser(db, { firstName: 'Sam' });
		await seedCalendarRow(PERSONAL, { ownerId: viewer.id }, db);
		await seedFamilyCalendar(FAMILY_CAL, 'famone000001', db);
		await seedFamilyCalendar(OTHER_FAMILY_CAL, 'famtwo000001', db);
		await seedCalendarRow(STRANGER_CAL, { ownerId: partner.id }, db);

		const ids = await findAccessibleCalendarIds(db, viewer.id, ['famone000001', 'famtwo000001']);

		expect([...ids].sort()).toEqual([PERSONAL, FAMILY_CAL, OTHER_FAMILY_CAL].sort());
	});

	rollbackTest('findAccessibleCalendarIds with no family stays personal-only', async (db) => {
		const viewer = await seedUser(db);
		await seedCalendarRow(PERSONAL, { ownerId: viewer.id }, db);
		await seedFamilyCalendar(FAMILY_CAL, 'famone000001', db);

		expect(await findAccessibleCalendarIds(db, viewer.id, [])).toEqual([PERSONAL]);
	});

	rollbackTest('findOwnedCalendarIds returns owned calendars only, never a family calendar', async (db) => {
		const viewer = await seedUser(db);
		await seedCalendarRow(PERSONAL, { ownerId: viewer.id }, db);
		await seedFamilyCalendar(FAMILY_CAL, 'famone000001', db);

		expect(await findOwnedCalendarIds(db, viewer.id)).toEqual([PERSONAL]);
	});

	rollbackTest('ensurePersonalCalendarRow creates one with the given now and is idempotent', async (db) => {
		const viewer = await seedUser(db);
		const now = new Date('2026-10-01T09:00:00.000Z');

		const first = await ensurePersonalCalendarRow(db, viewer.id, now);
		const second = await ensurePersonalCalendarRow(db, viewer.id, now);

		expect(first?.ownerId).toBe(viewer.id);
		expect(first?.familyId).toBeNull();
		expect(first?.createdAt).toEqual(now);
		expect(second?.id).toBe(first?.id);
		});

	rollbackTest('ensurePersonalCalendarRow ignores a family calendar the viewer owns', async (db) => {
		const viewer = await seedUser(db);
		await seedFamily('famone000001', {}, db);
		await seedCalendarRow(FAMILY_CAL, { ownerId: viewer.id, familyId: 'famone000001' }, db);

		const personal = await ensurePersonalCalendarRow(
			db,
			viewer.id,
			new Date('2026-10-01T09:00:00.000Z')
		);

		expect(personal?.id).not.toBe(FAMILY_CAL);
		expect(personal?.familyId).toBeNull();
	});

	rollbackTest('listOwnedCalendars and listFamilyCalendars filter on their own leg', async (db) => {
		const viewer = await seedUser(db);
		const partner = await seedUser(db);
		await seedCalendarRow(PERSONAL, { ownerId: viewer.id }, db);
		await seedCalendarRow(STRANGER_CAL, { ownerId: partner.id }, db);
		await seedFamilyCalendar(FAMILY_CAL, 'famone000001', db);

		expect(sortedIds(await listOwnedCalendars(db, viewer.id))).toEqual([PERSONAL]);
		expect(sortedIds(await listFamilyCalendars(db, 'famone000001'))).toEqual([FAMILY_CAL]);
		expect((await findCalendar(db, FAMILY_CAL))?.familyId).toBe('famone000001');
		expect(await findCalendar(db, 'calmissing001')).toBeNull();
	});
});

describe('event reads', () => {
	rollbackTest('findEvent returns the row or null', async (db) => {
		const viewer = await seedUser(db);
		await seedCalendarRow(PERSONAL, { ownerId: viewer.id }, db);
		await seedEventRow(
			{
				id: 'evtoneoff001',
				ownerId: viewer.id,
				calendarId: PERSONAL,
				title: 'Dentist',
				start: '2026-10-07T13:00:00.000Z'
			},
			db
		);

		expect((await findEvent(db, 'evtoneoff001'))?.title).toBe('Dentist');
		expect(await findEvent(db, 'evtmissing001')).toBeNull();
	});

	rollbackTest(
		'findWindowEventRows keeps every recurring master, the overlapping one-offs and the scope, ordered by start',
		async (db) => {
			const viewer = await seedUser(db);
			const stranger = await seedUser(db);
			await seedCalendarRow(PERSONAL, { ownerId: viewer.id }, db);
			await seedFamilyCalendar(FAMILY_CAL, 'famone000001', db);
			await seedCalendarRow(STRANGER_CAL, { ownerId: stranger.id }, db);

			await seedRecurringEventRow(
				{
					id: 'evtrecurring1',
					ownerId: viewer.id,
					calendarId: PERSONAL,
					title: 'Piano',
					start: '2020-01-01T18:00:00.000Z',
					count: null
				},
				db
			);
			// Started before the window and ends inside it: overlap (#217).
			await seedEventRow(
				{
					id: 'evtoverlap001',
					ownerId: viewer.id,
					calendarId: PERSONAL,
					title: 'Trip',
					start: '2026-09-05T09:00:00.000Z',
					end: '2026-10-03T09:00:00.000Z'
				},
				db
			);
			// Endless and before the window: not in it.
			await seedEventRow(
				{
					id: 'evtendless001',
					ownerId: viewer.id,
					calendarId: PERSONAL,
					title: 'Old',
					start: '2026-09-25T09:00:00.000Z'
				},
				db
			);
			// Finished before the window starts.
			await seedEventRow(
				{
					id: 'evtfinished01',
					ownerId: viewer.id,
					calendarId: PERSONAL,
					title: 'Past',
					start: '2026-09-01T09:00:00.000Z',
					end: '2026-09-02T09:00:00.000Z'
				},
				db
			);
			// Inside the window on a family calendar the viewer can see.
			await seedEventRow(
				{
					id: 'evtfaminside1',
					ownerId: stranger.id,
					calendarId: FAMILY_CAL,
					title: 'Family dinner',
					start: '2026-10-05T18:00:00.000Z'
				},
				db
			);
			// Inside the window on a stranger's own calendar: hidden.
			await seedEventRow(
				{
					id: 'evtstranger01',
					ownerId: stranger.id,
					calendarId: STRANGER_CAL,
					title: 'Private',
					start: '2026-10-06T18:00:00.000Z'
				},
				db
			);

			const rows = await findWindowEventRows(db, {
				userId: viewer.id,
				accessibleCalendarIds: [PERSONAL, FAMILY_CAL],
				startIso: '2026-10-01T00:00:00.000Z',
				endIso: '2026-10-31T23:59:59.999Z'
			});

			expect(rows.map((row) => row.id)).toEqual([
				'evtrecurring1',
				'evtoverlap001',
				'evtfaminside1'
			]);
		}
	);

	rollbackTest('listEventsByCalendar filters one calendar and orders by start', async (db) => {
		const viewer = await seedUser(db);
		await seedCalendarRow(PERSONAL, { ownerId: viewer.id }, db);
		await seedFamilyCalendar(FAMILY_CAL, 'famone000001', db);
		await seedEventRow(
			{
				id: 'evtlater0001',
				ownerId: viewer.id,
				calendarId: PERSONAL,
				title: 'Later',
				start: '2026-10-09T09:00:00.000Z'
			},
			db
		);
		await seedEventRow(
			{
				id: 'evtearlier01',
				ownerId: viewer.id,
				calendarId: PERSONAL,
				title: 'Earlier',
				start: '2026-10-02T09:00:00.000Z'
			},
			db
		);
		await seedEventRow(
			{
				id: 'evtfamily001',
				ownerId: viewer.id,
				calendarId: FAMILY_CAL,
				title: 'Elsewhere',
				start: '2026-10-01T09:00:00.000Z'
			},
			db
		);

		const rows = await listEventsByCalendar(db, PERSONAL);
		expect(rows.map((row) => row.id)).toEqual(['evtearlier01', 'evtlater0001']);
	});
});

describe('event writes', () => {
	rollbackTest('insert, update and delete report the row they touched', async (db) => {
		const viewer = await seedUser(db);
		await seedCalendarRow(PERSONAL, { ownerId: viewer.id }, db);

		const created = await insertEventRow(db, {
			id: 'evtwritten01',
			ownerId: viewer.id,
			calendarId: PERSONAL,
			title: 'Dentist',
			start: '2026-10-07T13:00:00.000Z'
		});
		expect(created.title).toBe('Dentist');

		const updated = await updateEventRow(db, created.id, { title: 'Dentist (moved)' });
		expect(updated?.title).toBe('Dentist (moved)');
		expect(await updateEventRow(db, 'evtmissing001', { title: 'x' })).toBeNull();

		expect(await deleteEventRow(db, created.id)).toBe(1);
		expect(await deleteEventRow(db, created.id)).toBe(0);
		expect(await findEvent(db, created.id)).toBeNull();
	});

	rollbackTest('deleteMirrorRows removes only the copies of that master', async (db) => {
		const viewer = await seedUser(db);
		await seedCalendarRow(PERSONAL, { ownerId: viewer.id }, db);
		await seedFamilyCalendar(FAMILY_CAL, 'famone000001', db);
		await seedEventRow(
			{
				id: 'evtmaster001',
				ownerId: viewer.id,
				calendarId: PERSONAL,
				title: 'Dentist',
				start: '2026-10-07T13:00:00.000Z'
			},
			db
		);
		await seedEventRow(
			{
				id: 'evtmirror001',
				ownerId: viewer.id,
				calendarId: FAMILY_CAL,
				title: 'Dentist',
				start: '2026-10-07T13:00:00.000Z',
				mirrorOf: 'evtmaster001'
			},
			db
		);

		expect(await deleteMirrorRows(db, 'evtmaster001')).toBe(1);
		expect(await findEvent(db, 'evtmaster001')).not.toBeNull();
		expect(await findEvent(db, 'evtmirror001')).toBeNull();
	});
});

describe('Exception Overrides', () => {
	async function seedSeries(db: Db) {
		const viewer = await seedUser(db);
		await seedCalendarRow(PERSONAL, { ownerId: viewer.id }, db);
		await seedRecurringEventRow(
			{
				id: 'evtseries001',
				ownerId: viewer.id,
				calendarId: PERSONAL,
				title: 'Piano',
				start: '2026-10-06T15:00:00.000Z',
				count: 3
			},
			db
		);
		return viewer;
	}

	rollbackTest('findExceptions filters by master ids and tolerates an empty list', async (db) => {
		await seedSeries(db);
		await seedExceptionRow(
			{ eventId: 'evtseries001', originalDate: '2026-10-13T15:00:00.000Z', isCancelled: true },
			db
		);

		expect(await findExceptions(db, [])).toEqual([]);
		const rows = await findExceptions(db, ['evtseries001']);
		expect(rows).toHaveLength(1);
		expect(rows[0]?.isCancelled).toBe(true);
		expect(await findExceptions(db, ['evtother0001'])).toEqual([]);
	});

	rollbackTest('findException normalizes an offset input to the shared UTC rendering', async (db) => {
		await seedSeries(db);
		await seedExceptionRow(
			{
				eventId: 'evtseries001',
				originalDate: '2026-10-13T15:00:00.000Z',
				title: 'Piano (moved)'
			},
			db
		);

		const row = await findException(db, 'evtseries001', '2026-10-13T17:00:00.000+02:00');
		expect(row?.title).toBe('Piano (moved)');
		expect(await findException(db, 'evtseries001', '2026-10-20T15:00:00.000Z')).toBeNull();
	});

	rollbackTest('upsertExceptionRow defaults isCancelled and merges only defined fields', async (db) => {
		await seedSeries(db);

		const created = await upsertExceptionRow(db, {
			eventId: 'evtseries001',
			originalDate: '2026-10-13T17:00:00.000+02:00',
			title: 'Piano (moved)',
			start: '2026-10-13T17:00:00.000Z'
		});
		expect(created.isCancelled).toBe(false);
		expect(created.location).toBeNull();

		const merged = await upsertExceptionRow(db, {
			eventId: 'evtseries001',
			originalDate: '2026-10-13T15:00:00.000Z',
			location: 'Hall'
		});
		expect(merged.id).toBe(created.id);
		expect(merged.title).toBe('Piano (moved)');
		expect(storedIso(merged.start)).toBe('2026-10-13T17:00:00.000Z');
		expect(merged.location).toBe('Hall');
		expect(merged.isCancelled).toBe(false);

		const cancelled = await upsertExceptionRow(db, {
			eventId: 'evtseries001',
			originalDate: '2026-10-13T15:00:00.000Z',
			isCancelled: true
		});
		expect(cancelled.isCancelled).toBe(true);
		expect(cancelled.title).toBe('Piano (moved)');

		const shifted = await updateExceptionRow(db, cancelled.id, {
			originalDate: '2026-10-14T15:00:00.000Z',
			start: '2026-10-14T17:00:00.000Z'
		});
		expect(storedIso(shifted?.originalDate)).toBe('2026-10-14T15:00:00.000Z');
		expect(storedIso(shifted?.start)).toBe('2026-10-14T17:00:00.000Z');
	});

	rollbackTest('deleteExceptionsForEvent removes that master’s overrides only', async (db) => {
		await seedSeries(db);
		await seedExceptionRow(
			{ eventId: 'evtseries001', originalDate: '2026-10-13T15:00:00.000Z' },
			db
		);

		expect(await deleteExceptionsForEvent(db, 'evtseries001')).toBe(1);
		expect(await findExceptions(db, ['evtseries001'])).toEqual([]);
	});
});

describe('attendance', () => {
	async function seedInvitedEvent(db: Db) {
		const viewer = await seedUser(db, { firstName: 'Mia', lastName: 'Rivera' });
		const partner = await seedUser(db, { firstName: 'Sam', lastName: 'Rivera' });
		await seedCalendarRow(PERSONAL, { ownerId: viewer.id }, db);
		await seedEventRow(
			{
				id: 'evtinvited01',
				ownerId: viewer.id,
				calendarId: PERSONAL,
				title: 'Dentist',
				start: '2026-10-07T13:00:00.000Z'
			},
			db
		);
		return { viewer, partner };
	}

	rollbackTest('listAttendance joins the member names and leaves guest names null', async (db) => {
		const { viewer } = await seedInvitedEvent(db);
		await seedAttendanceRow(
			[
				{ eventId: 'evtinvited01', userId: viewer.id, status: 'going', inviteType: 'optional' },
				{ eventId: 'evtinvited01', name: 'Grandma', status: 'undecided', inviteType: 'optional' }
			],
			db
		);

		const rows = await listAttendance(db, 'evtinvited01');
		const member = rows.find((row) => row.userId === viewer.id);
		const guest = rows.find((row) => row.name === 'Grandma');
		expect(member).toMatchObject({ firstName: 'Mia', lastName: 'Rivera' });
		expect(guest).toMatchObject({ firstName: null, lastName: null });
	});

	rollbackTest('attendanceSummaries counts member rows only and flags pending required', async (db) => {
		const { viewer, partner } = await seedInvitedEvent(db);
		const third = await seedUser(db, { firstName: 'Ari' });
		await seedAttendanceRow(
			[
				{ eventId: 'evtinvited01', userId: viewer.id, status: 'going', inviteType: 'required' },
				{ eventId: 'evtinvited01', userId: partner.id, status: 'undecided', inviteType: 'required' },
				{ eventId: 'evtinvited01', userId: third.id, status: 'undecided', inviteType: 'optional' },
				{ eventId: 'evtinvited01', name: 'Grandma', status: 'going', inviteType: 'optional' }
			],
			db
		);

		const summaries = await attendanceSummaries(db, ['evtinvited01', 'evtmissing001']);
		expect(summaries.get('evtinvited01')).toEqual({
			going: 1,
			invited: 3,
			required: 2,
			requiredPending: 1,
			goingNames: ['Mia']
		});
		expect(summaries.has('evtmissing001')).toBe(false);
	});

	rollbackTest('listRsvpStatuses scopes to the viewer', async (db) => {
		const { viewer, partner } = await seedInvitedEvent(db);
		await seedAttendanceRow(
			[
				{ eventId: 'evtinvited01', userId: viewer.id, status: 'going' },
				{ eventId: 'evtinvited01', userId: partner.id, status: 'declined' }
			],
			db
		);

		expect(await listRsvpStatuses(db, viewer.id, ['evtinvited01'])).toEqual([
			{ eventId: 'evtinvited01', status: 'going' }
		]);
		expect(await listRsvpStatuses(db, viewer.id, [])).toEqual([]);
	});

	rollbackTest('upsertRsvp inserts once, then updates and clears in place', async (db) => {
		const { viewer } = await seedInvitedEvent(db);

		await upsertRsvp(db, 'evtinvited01', viewer.id, 'going');
		await upsertRsvp(db, 'evtinvited01', viewer.id, 'maybe');
		await upsertRsvp(db, 'evtinvited01', viewer.id, 'undecided');

		const rows = await listAttendance(db, 'evtinvited01');
		expect(rows).toHaveLength(1);
		expect(rows[0]).toMatchObject({ userId: viewer.id, status: 'undecided' });
	});

	rollbackTest('replaceInvites keeps a responded member, drops uninvited undecided rows and replaces guests', async (db) => {
		const { viewer, partner } = await seedInvitedEvent(db);
		const third = await seedUser(db, { firstName: 'Ari' });
		const added = await seedUser(db, { firstName: 'Jo' });
		await seedAttendanceRow(
			[
				{ eventId: 'evtinvited01', userId: viewer.id, status: 'going', inviteType: 'required' },
				{ eventId: 'evtinvited01', userId: partner.id, status: 'undecided', inviteType: 'required' },
				{ eventId: 'evtinvited01', userId: third.id, status: 'undecided', inviteType: 'optional' },
				{ eventId: 'evtinvited01', name: 'Grandma', status: 'undecided', inviteType: 'optional' }
			],
			db
		);

		await replaceInvites(db, 'evtinvited01', [
			{ userId: viewer.id, inviteType: 'optional' },
			{ userId: added.id, inviteType: 'required' },
			{ name: 'Bob', inviteType: 'optional' }
		]);

		const rows = await listAttendance(db, 'evtinvited01');
		const byUser = new Map(
			rows.flatMap((row): [string, (typeof rows)[number]][] =>
				row.userId ? [[row.userId, row]] : []
			)
		);
		expect(byUser.get(viewer.id)).toMatchObject({ status: 'going', inviteType: 'optional' });
		expect(byUser.get(added.id)).toMatchObject({ status: 'undecided', inviteType: 'required' });
		expect(byUser.has(partner.id)).toBe(false);
		expect(byUser.has(third.id)).toBe(false);
		expect(await listGuestNames(db, 'evtinvited01')).toEqual(['Bob']);
	});

	rollbackTest('listCreatorNames is one lookup for the whole set', async (db) => {
		const viewer = await seedUser(db, { firstName: 'Mia' });
		const partner = await seedUser(db, { firstName: 'Sam' });

		const names = await listCreatorNames(db, [viewer.id, partner.id, 'missinguser01']);
		expect(names.get(viewer.id)).toBe('Mia');
		expect(names.get(partner.id)).toBe('Sam');
		expect(names.has('missinguser01')).toBe(false);
		expect(await listCreatorNames(db, [])).toEqual(new Map());
	});
});

describe('import reads and writes', () => {
	rollbackTest('listExistingDedupeKeys lowercases the title and lowercases nothing else', async (db) => {
		const viewer = await seedUser(db);
		await seedCalendarRow(PERSONAL, { ownerId: viewer.id }, db);
		await seedFamilyCalendar(FAMILY_CAL, 'famone000001', db);
		await seedEventRow(
			{
				id: 'evtimporter1',
				ownerId: viewer.id,
				calendarId: PERSONAL,
				title: 'Soccer Practice',
				start: '2026-09-29T14:00:00.000Z'
			},
			db
		);
		await seedEventRow(
			{
				id: 'evtelsewhere',
				ownerId: viewer.id,
				calendarId: FAMILY_CAL,
				title: 'Soccer Practice',
				start: '2026-09-29T14:00:00.000Z'
			},
			db
		);

		expect(await listExistingDedupeKeys(db, PERSONAL)).toEqual([
			'soccer practice|2026-09-29T14:00:00.000Z'
		]);
	});

	rollbackTest('listUndoCandidates needs the viewer AND the calendar to match', async (db) => {
		const viewer = await seedUser(db);
		const other = await seedUser(db);
		await seedCalendarRow(PERSONAL, { ownerId: viewer.id }, db);
		await seedFamilyCalendar(FAMILY_CAL, 'famone000001', db);
		await seedEventRow(
			{
				id: 'evtundogood1',
				ownerId: viewer.id,
				calendarId: PERSONAL,
				title: 'Soccer practice',
				start: '2026-09-29T14:00:00.000Z'
			},
			db
		);
		await seedEventRow(
			{
				id: 'evtundoother',
				ownerId: other.id,
				calendarId: PERSONAL,
				title: 'Someone else',
				start: '2026-09-29T14:00:00.000Z'
			},
			db
		);
		await seedEventRow(
			{
				id: 'evtundocal01',
				ownerId: viewer.id,
				calendarId: FAMILY_CAL,
				title: 'Wrong calendar',
				start: '2026-09-29T14:00:00.000Z'
			},
			db
		);

		expect(
			await listUndoCandidates(
				db,
				['evtundogood1', 'evtundoother', 'evtundocal01'],
				viewer.id,
				PERSONAL
			)
		).toEqual([
			{ id: 'evtundogood1', title: 'Soccer practice', startIso: '2026-09-29T14:00:00.000Z' }
		]);
	});

	rollbackTest('deleteImportedRows removes the batch and its mirrors under the same scope', async (db) => {
		const viewer = await seedUser(db);
		const other = await seedUser(db);
		await seedCalendarRow(PERSONAL, { ownerId: viewer.id }, db);
		await seedFamilyCalendar(FAMILY_CAL, 'famone000001', db);
		await seedEventRow(
			{
				id: 'evtimported1',
				ownerId: viewer.id,
				calendarId: PERSONAL,
				title: 'Soccer practice',
				start: '2026-09-29T14:00:00.000Z'
			},
			db
		);
		await seedEventRow(
			{
				id: 'evtimportmir1',
				ownerId: viewer.id,
				calendarId: FAMILY_CAL,
				title: 'Soccer practice',
				start: '2026-09-29T14:00:00.000Z',
				mirrorOf: 'evtimported1'
			},
			db
		);
		await seedEventRow(
			{
				id: 'evtnotmine001',
				ownerId: other.id,
				calendarId: PERSONAL,
				title: 'Untouched',
				start: '2026-09-30T14:00:00.000Z'
			},
			db
		);

		expect(await deleteImportedRows(db, ['evtimported1', 'evtnotmine001'], viewer.id, PERSONAL)).toBe(1);
		expect(await findEvent(db, 'evtimported1')).toBeNull();
		expect(await findEvent(db, 'evtimportmir1')).toBeNull();
		expect(await findEvent(db, 'evtnotmine001')).not.toBeNull();
	});
});
