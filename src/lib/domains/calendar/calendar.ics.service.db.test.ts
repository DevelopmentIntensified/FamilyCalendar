/**
 * calendar ICS services against real Postgres: the single-event export and the
 * import flow (targets → preview → commit → undo).
 *
 * Expected values come from `icsImportFlow.ts` and the frozen
 * `calendar.import.http.db.test.ts`, whose copy this file re-states without the
 * transport. Refusals assert the `AppError` the endpoint maps to the golden's
 * status + body.
 *
 * Doc: ./README.md#how-to-test
 */
import { eq } from 'drizzle-orm';
import { describe, expect } from 'vitest';
import { actorFromUser } from '$lib/kernel/ctx/actor';
import type { Db } from '$lib/kernel/db/database.server';
import { eventAttendance, events } from '$lib/kernel/db/tables.server';
import { AppError } from '$lib/kernel/errors/appError';
import { seedUser } from '$lib/kernel/testing/seedRows.server';
import { testCtx } from '$lib/kernel/testing/testCtx.server';
import { rollbackTest } from '$lib/kernel/testing/testDb.server';
import { seedFamily, seedMembership } from '$lib/domains/family/family.fixtures.server';
import {
	seedCalendarRow,
	seedEventRow,
	seedExceptionRow
} from './calendar.fixtures.server';
import {
	commitImport,
	exportEventIcs,
	listImportTargets,
	previewImport,
	undoImport,
	type CalendarImportUpload
} from './calendar.ics.service.server';

const NOW = '2026-01-15T09:00:00.000Z';
const PERSONAL_CAL = 'cal-personal01';
const FAMILY_CAL = 'cal-family01';
const FAMILY = 'fam-riveras01';

/** One VEVENT, exactly as an export writes it. */
const ICS_ONE = [
	'BEGIN:VCALENDAR',
	'VERSION:2.0',
	'BEGIN:VEVENT',
	'SUMMARY:Soccer practice',
	'DTSTART:20260929T140000Z',
	'DTEND:20260929T153000Z',
	'END:VEVENT',
	'END:VCALENDAR'
].join('\r\n');

/** What the preview describes for ICS_ONE (the draft a commit posts back). */
const DRAFT = {
	title: 'Soccer practice',
	startIso: '2026-09-29T14:00:00.000Z',
	endIso: '2026-09-29T15:30:00.000Z',
	allDay: false,
	location: null,
	description: null,
	recurrenceFrequency: null,
	recurrenceInterval: 1,
	recurrenceByDay: null,
	recurrenceCount: null,
	recurrenceUntil: null
};

function upload(fileName: string, text: string): CalendarImportUpload {
	return { fileName, size: text.length, readText: async () => text };
}

function viewerCtx(db: Db) {
	return testCtx({ db, now: NOW });
}

/** A viewer with a personal calendar (the target every flow test starts from). */
async function seedViewer(db: Db) {
	const user = await seedUser(db, { firstName: 'Mia' });
	await seedCalendarRow(PERSONAL_CAL, { ownerId: user.id }, db);
	return user;
}

/** The thrown refusal, so a test can assert its status and copy. */
async function refusalOf(work: Promise<unknown>): Promise<unknown> {
	return await work.catch((error: unknown) => error);
}

describe('exportEventIcs', () => {
	rollbackTest('exports a lone event as one VEVENT attachment', async (db) => {
		const ctx = viewerCtx(db);
		const user = await seedViewer(db);
		await seedEventRow(
			{
				id: 'evtoneoff01',
				ownerId: user.id,
				calendarId: PERSONAL_CAL,
				title: 'Soccer practice',
				start: '2026-09-29T14:00:00.000Z',
				end: '2026-09-29T15:30:00.000Z'
			},
			db
		);

		const exported = await exportEventIcs(ctx, actorFromUser(user, 'session'), {
			id: 'evtoneoff01'
		});

		expect(exported.filename).toBe('soccer-practice.ics');
		expect(exported.body).toContain('BEGIN:VCALENDAR');
		expect(exported.body).toContain('UID:evtoneoff01@familyplanz.com');
		expect(exported.body).toContain('SUMMARY:Soccer practice');
		expect(exported.body).toContain('DTSTAMP:20260115T090000Z');
		expect(exported.body).not.toContain('RRULE');
	});

	rollbackTest('exports a scope-this Exception Override as its own VEVENT without the rule', async (db) => {
		const ctx = viewerCtx(db);
		const user = await seedViewer(db);
		await seedEventRow(
			{
				id: 'evtseries01',
				ownerId: user.id,
				calendarId: PERSONAL_CAL,
				title: 'Swim',
				start: '2026-10-05T09:00:00.000Z',
				end: '2026-10-05T10:00:00.000Z',
				recurrenceFrequency: 'weekly',
				recurrenceInterval: 1
			},
			db
		);
		await seedExceptionRow(
			{
				eventId: 'evtseries01',
				originalDate: '2026-10-05T09:00:00.000Z',
				title: 'Swim (moved)',
				start: '2026-10-06T09:00:00.000Z',
				end: '2026-10-06T10:00:00.000Z'
			},
			db
		);

		const exported = await exportEventIcs(ctx, actorFromUser(user, 'session'), {
			id: 'evtseries01~2026-10-05T09:00:00.000Z'
		});

		expect(exported.body).toContain('SUMMARY:Swim (moved)');
		expect(exported.body).not.toContain('RRULE');
	});

	rollbackTest('derives a start-only override DTEND from the master duration (Q-048)', async (db) => {
		const ctx = viewerCtx(db);
		const user = await seedViewer(db);
		await seedEventRow(
			{
				id: 'evtseries01',
				ownerId: user.id,
				calendarId: PERSONAL_CAL,
				title: 'Swim',
				start: '2026-10-05T09:00:00.000Z',
				end: '2026-10-05T10:00:00.000Z',
				recurrenceFrequency: 'weekly',
				recurrenceInterval: 1
			},
			db
		);
		// Start-only: the master's end would land BEFORE this DTSTART.
		await seedExceptionRow(
			{
				eventId: 'evtseries01',
				originalDate: '2026-10-05T09:00:00.000Z',
				start: '2026-10-06T11:00:00.000Z'
			},
			db
		);

		const exported = await exportEventIcs(ctx, actorFromUser(user, 'session'), {
			id: 'evtseries01~2026-10-05T09:00:00.000Z'
		});

		expect(exported.body).toContain('DTSTART:20261006T110000Z');
		expect(exported.body).toContain('DTEND:20261006T120000Z');
	});

	rollbackTest('exports nothing for a cancelled occurrence', async (db) => {
		const ctx = viewerCtx(db);
		const user = await seedViewer(db);
		await seedEventRow(
			{
				id: 'evtseries01',
				ownerId: user.id,
				calendarId: PERSONAL_CAL,
				title: 'Swim',
				start: '2026-10-05T09:00:00.000Z',
				end: '2026-10-05T10:00:00.000Z',
				recurrenceFrequency: 'weekly',
				recurrenceInterval: 1
			},
			db
		);
		await seedExceptionRow(
			{
				eventId: 'evtseries01',
				originalDate: '2026-10-05T09:00:00.000Z',
				isCancelled: true
			},
			db
		);

		const refusal = await refusalOf(
			exportEventIcs(ctx, actorFromUser(user, 'session'), {
				id: 'evtseries01~2026-10-05T09:00:00.000Z'
			})
		);
		expect(refusal).toBeInstanceOf(AppError);
		expect(refusal).toMatchObject({ status: 404, message: 'Event not found' });
	});

	rollbackTest("refuses an id it cannot resolve, a missing event and someone else's calendar", async (db) => {
		const ctx = viewerCtx(db);
		const user = await seedViewer(db);
		const stranger = await seedUser(db);
		await seedCalendarRow('cal-stranger1', { ownerId: stranger.id }, db);
		await seedEventRow(
			{
				id: 'evtstranger1',
				ownerId: stranger.id,
				calendarId: 'cal-stranger1',
				title: 'Private',
				start: '2026-09-29T14:00:00.000Z'
			},
			db
		);
		const actor = actorFromUser(user, 'session');

		expect(await refusalOf(exportEventIcs(ctx, actor, { id: 'x' }))).toMatchObject({
			status: 400,
			message: 'Invalid event id'
		});
		expect(await refusalOf(exportEventIcs(ctx, actor, { id: 'missingevent1' }))).toMatchObject({
			status: 404,
			message: 'Event not found'
		});
		expect(await refusalOf(exportEventIcs(ctx, actor, { id: 'evtstranger1' }))).toMatchObject({
			status: 403,
			message: 'Event not accessible'
		});
	});

	rollbackTest('exports a family event for a reading family member', async (db) => {
		const ctx = viewerCtx(db);
		const owner = await seedUser(db, { firstName: 'Mia' });
		const partner = await seedUser(db, { firstName: 'Sam' });
		await seedFamily(FAMILY, { name: 'Riveras' }, db);
		await seedMembership(FAMILY, owner.id, 'member', 'member', db);
		await seedMembership(FAMILY, partner.id, 'member', 'member', db);
		await seedCalendarRow(FAMILY_CAL, { familyId: FAMILY }, db);
		await seedEventRow(
			{
				id: 'evtfamily01',
				ownerId: owner.id,
				calendarId: FAMILY_CAL,
				title: 'Family dinner',
				start: '2026-09-29T18:00:00.000Z'
			},
			db
		);

		const exported = await exportEventIcs(ctx, actorFromUser(partner, 'session'), {
			id: 'evtfamily01'
		});

		expect(exported.body).toContain('SUMMARY:Family dinner');
	});
});

describe('listImportTargets', () => {
	rollbackTest('lists the personal calendar and the family calendar, labelled like the page', async (db) => {
		const ctx = viewerCtx(db);
		const user = await seedViewer(db);
		await seedFamily(FAMILY, { name: 'Riveras' }, db);
		await seedMembership(FAMILY, user.id, 'member', 'member', db);
		await seedCalendarRow(FAMILY_CAL, { familyId: FAMILY }, db);

		const targets = await listImportTargets(ctx, actorFromUser(user, 'session'));

		expect(targets.calendars).toEqual([
			{ id: PERSONAL_CAL, name: 'Personal Calendar' },
			{ id: FAMILY_CAL, name: 'Family Calendar' }
		]);
	});
});

describe('previewImport', () => {
	rollbackTest('describes the parsed rows and writes nothing', async (db) => {
		const ctx = viewerCtx(db);
		const user = await seedViewer(db);

		const { preview } = await previewImport(ctx, actorFromUser(user, 'session'), {
			calendarId: PERSONAL_CAL,
			uploads: [upload('kids.ics', ICS_ONE)]
		});

		expect(preview).toMatchObject({
			calendarId: PERSONAL_CAL,
			calendarName: 'Personal Calendar',
			fileName: 'kids.ics',
			duplicates: 0,
			files: [{ fileName: 'kids.ics', events: 1, duplicates: 0 }],
			defaultSelection: ['e0']
		});
		expect(preview.items).toEqual([
			{
				...DRAFT,
				key: 'e0',
				fileName: 'kids.ics',
				whenText: 'Tue, Sep 29, 2026 · 2:00 PM–3:30 PM',
				duplicate: false,
				duplicateReason: null
			}
		]);
		expect(await db.select({ id: events.id }).from(events)).toEqual([]);
	});

	rollbackTest('flags a row the calendar already holds and drops it from the selection', async (db) => {
		const ctx = viewerCtx(db);
		const user = await seedViewer(db);
		await seedEventRow(
			{
				id: 'evtoneoff01',
				ownerId: user.id,
				calendarId: PERSONAL_CAL,
				title: 'Soccer practice',
				start: '2026-09-29T14:00:00.000Z'
			},
			db
		);

		const { preview } = await previewImport(ctx, actorFromUser(user, 'session'), {
			calendarId: PERSONAL_CAL,
			uploads: [upload('kids.ics', ICS_ONE)]
		});

		expect(preview.duplicates).toBe(1);
		expect(preview.items[0]).toMatchObject({
			duplicate: true,
			duplicateReason: 'already-on-calendar'
		});
		expect(preview.defaultSelection).toEqual([]);
	});

	rollbackTest('counts several files in the heading', async (db) => {
		const ctx = viewerCtx(db);
		const user = await seedViewer(db);

		const { preview } = await previewImport(ctx, actorFromUser(user, 'session'), {
			calendarId: PERSONAL_CAL,
			uploads: [upload('kids.ics', ICS_ONE), upload('work.ics', ICS_ONE)]
		});

		expect(preview.fileName).toBe('2 files');
		expect(preview.files).toEqual([
			{ fileName: 'kids.ics', events: 1, duplicates: 0 },
			{ fileName: 'work.ics', events: 1, duplicates: 1 }
		]);
	});

	rollbackTest('answers every choice error with its page copy', async (db) => {
		const ctx = viewerCtx(db);
		const user = await seedViewer(db);
		const actor = actorFromUser(user, 'session');
		const empty = ['BEGIN:VCALENDAR', 'END:VCALENDAR'].join('\r\n');

		const expectRefusal = async (
			work: Promise<unknown>,
			status: number,
			message: string
		) => {
			const refusal = await refusalOf(work);
			expect(refusal).toBeInstanceOf(AppError);
			expect(refusal).toMatchObject({ status, message });
		};

		await expectRefusal(
			previewImport(ctx, actor, { calendarId: PERSONAL_CAL, uploads: [] }),
			400,
			'Choose an .ics file to import.'
		);
		await expectRefusal(
			previewImport(ctx, actor, {
				calendarId: PERSONAL_CAL,
				uploads: Array.from({ length: 11 }, (_unused, index) => upload(`f${index}.ics`, ICS_ONE))
			}),
			400,
			'Choose up to 10 files at a time.'
		);
		await expectRefusal(
			previewImport(ctx, actor, {
				calendarId: PERSONAL_CAL,
				uploads: [{ fileName: 'big.ics', size: 5 * 1024 * 1024 + 1, readText: async () => '' }]
			}),
			400,
			'big.ics is larger than 5 MB.'
		);
		await expectRefusal(
			previewImport(ctx, actor, { calendarId: PERSONAL_CAL, uploads: [upload('empty.ics', empty)] }),
			400,
			'No events found in that file. An .ics export wraps each event in BEGIN:VEVENT with a ' +
				'SUMMARY and a DTSTART — check you picked the .ics from inside the export, not the whole zip.'
		);
		await expectRefusal(
			previewImport(ctx, actor, {
				calendarId: PERSONAL_CAL,
				uploads: [
					{ fileName: 'unreadable.ics', size: 10, readText: async () => Promise.reject(new Error('io')) }
				]
			}),
			400,
			'Could not read unreadable.ics.'
		);
		await expectRefusal(
			previewImport(ctx, actor, { calendarId: undefined, uploads: [] }),
			400,
			'Choose a calendar to import into.'
		);
	});

	rollbackTest("refuses a calendar that is not the viewer's to import into", async (db) => {
		const ctx = viewerCtx(db);
		const user = await seedViewer(db);
		const stranger = await seedUser(db);
		await seedCalendarRow('cal-stranger1', { ownerId: stranger.id }, db);

		const refusal = await refusalOf(
			previewImport(ctx, actorFromUser(user, 'session'), {
				calendarId: 'cal-stranger1',
				uploads: [upload('kids.ics', ICS_ONE)]
			})
		);
		expect(refusal).toMatchObject({
			status: 403,
			message: 'That calendar is not yours to import into.'
		});
	});
});

describe('commitImport', () => {
	rollbackTest('writes only the ticked rows, then reports the batch an undo reverses', async (db) => {
		const ctx = viewerCtx(db);
		const user = await seedViewer(db);

		const payload = await commitImport(ctx, actorFromUser(user, 'session'), {
			calendarId: PERSONAL_CAL,
			picked: [DRAFT]
		});

		expect(payload).toMatchObject({
			calendarId: PERSONAL_CAL,
			calendarName: 'Personal Calendar',
			imported: 1,
			selected: 1,
			skipped: 0,
			skippedDuplicates: 0,
			failed: []
		});
		expect(payload.importedEvents).toEqual([
			{
				id: expect.stringMatching(/^[a-z0-9]{15}$/),
				title: 'Soccer practice',
				startIso: '2026-09-29T14:00:00.000Z'
			}
		]);

		const rows = await db.select().from(events);
		expect(rows).toHaveLength(1);
		expect(rows[0]).toMatchObject({
			calendarId: PERSONAL_CAL,
			ownerId: user.id,
			title: 'Soccer practice',
			allDay: false,
			mirrorOf: null,
			recurrenceInterval: 1
		});
		expect(await db.select().from(eventAttendance)).toEqual([
			expect.objectContaining({ userId: user.id, status: 'going', inviteType: 'optional' })
		]);
	});

	rollbackTest('re-checks the calendar at commit time and skips a row that landed meanwhile', async (db) => {
		const ctx = viewerCtx(db);
		const user = await seedViewer(db);
		await seedEventRow(
			{
				id: 'evtoneoff01',
				ownerId: user.id,
				calendarId: PERSONAL_CAL,
				title: 'Soccer practice',
				start: '2026-09-29T14:00:00.000Z'
			},
			db
		);

		const payload = await commitImport(ctx, actorFromUser(user, 'session'), {
			calendarId: PERSONAL_CAL,
			picked: [DRAFT]
		});

		expect(payload).toMatchObject({
			imported: 0,
			selected: 1,
			skipped: 1,
			skippedDuplicates: 1,
			importedEvents: []
		});
		expect(await db.select({ id: events.id }).from(events)).toHaveLength(1);
	});

	rollbackTest('answers the selection errors with their page copy', async (db) => {
		const ctx = viewerCtx(db);
		const user = await seedViewer(db);
		const actor = actorFromUser(user, 'session');
		const cases: readonly { readonly picked: unknown; readonly error: string }[] = [
			{ picked: undefined, error: 'Pick the events you want to add.' },
			{ picked: [], error: 'Tick at least one event before importing.' },
			{ picked: '{oops', error: 'That selection could not be read — preview the file again.' },
			{ picked: [{ title: 'No start' }], error: 'Tick at least one event before importing.' }
		];

		for (const entry of cases) {
			const refusal = await refusalOf(
				commitImport(ctx, actor, { calendarId: PERSONAL_CAL, picked: entry.picked })
			);
			expect(refusal).toMatchObject({ status: 400, message: entry.error });
		}

		const overCap = Array.from({ length: 501 }, () => DRAFT);
		expect(
			await refusalOf(commitImport(ctx, actor, { calendarId: PERSONAL_CAL, picked: overCap }))
		).toMatchObject({ status: 400, message: 'Tick at least one event before importing.' });
		expect(await db.select({ id: events.id }).from(events)).toEqual([]);
	});
});

describe('undoImport', () => {
	rollbackTest('removes the rows that commit added, scoped to the viewer and the calendar', async (db) => {
		const ctx = viewerCtx(db);
		const user = await seedViewer(db);
		const actor = actorFromUser(user, 'session');
		const committed = await commitImport(ctx, actor, {
			calendarId: PERSONAL_CAL,
			picked: [DRAFT]
		});

		expect(
			await undoImport(ctx, actor, {
				calendarId: PERSONAL_CAL,
				batch: committed.importedEvents
			})
		).toEqual({ calendarName: 'Personal Calendar', removed: 1, kept: [], alreadyGone: 0 });
		expect(await db.select({ id: events.id }).from(events)).toEqual([]);
	});

	rollbackTest('keeps and names a row the user edited since the import', async (db) => {
		const ctx = viewerCtx(db);
		const user = await seedViewer(db);
		const actor = actorFromUser(user, 'session');
		const committed = await commitImport(ctx, actor, {
			calendarId: PERSONAL_CAL,
			picked: [DRAFT]
		});
		const [row] = committed.importedEvents;
		await db.update(events).set({ title: 'Soccer practice (moved)' }).where(eq(events.id, row.id));

		expect(
			await undoImport(ctx, actor, {
				calendarId: PERSONAL_CAL,
				batch: [{ id: row.id, title: 'Soccer practice', startIso: row.startIso }]
			})
		).toEqual({
			calendarName: 'Personal Calendar',
			removed: 0,
			kept: [{ id: row.id, title: 'Soccer practice (moved)' }],
			alreadyGone: 0
		});
		expect(await db.select({ id: events.id }).from(events)).toHaveLength(1);
	});

	rollbackTest('reports rows that are already gone and rows it may not touch', async (db) => {
		const ctx = viewerCtx(db);
		const user = await seedViewer(db);
		const other = await seedUser(db);
		await seedEventRow(
			{
				id: 'evtsomeone01',
				ownerId: other.id,
				calendarId: PERSONAL_CAL,
				title: 'Soccer practice',
				start: '2026-09-29T14:00:00.000Z'
			},
			db
		);

		expect(
			await undoImport(ctx, actorFromUser(user, 'session'), {
				calendarId: PERSONAL_CAL,
				batch: [
					{ id: 'missingevent1', title: 'Gone', startIso: '2026-09-29T14:00:00.000Z' },
					{
						id: 'evtsomeone01',
						title: 'Soccer practice',
						startIso: '2026-09-29T14:00:00.000Z'
					}
				]
			})
		).toEqual({ calendarName: 'Personal Calendar', removed: 0, kept: [], alreadyGone: 2 });
		expect(await db.select({ id: events.id }).from(events)).toHaveLength(1);
	});

	rollbackTest('answers every batch error with its page message', async (db) => {
		const ctx = viewerCtx(db);
		const user = await seedViewer(db);
		const actor = actorFromUser(user, 'session');

		expect(await refusalOf(undoImport(ctx, actor, { calendarId: PERSONAL_CAL }))).toMatchObject({
			status: 400,
			message: 'Nothing to undo — import a file first.'
		});
		expect(
			await refusalOf(undoImport(ctx, actor, { calendarId: PERSONAL_CAL, batch: [] }))
		).toMatchObject({ status: 400, message: 'Nothing to undo — import a file first.' });
		expect(
			await refusalOf(undoImport(ctx, actor, { calendarId: PERSONAL_CAL, batch: 'garbage' }))
		).toMatchObject({
			status: 400,
			message: 'That undo could not be read — import the file again.'
		});
	});
});
