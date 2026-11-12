/**
 * Golden contract for the .ics import endpoints (S2): the calendar picker,
 * preview → commit → undo, every refusal message the flow can answer, and the
 * rows each step writes. Written against the legacy handlers and kept green
 * through the port (docs/rewrite/playbooks/characterize-endpoints.md).
 * Doc: ./README.md#how-to-test
 */
import { eq } from 'drizzle-orm';
import { beforeEach, describe, expect, it } from 'vitest';
import {
	calendars,
	eventAttendance,
	events,
	families,
	familyMembers
} from '$lib/kernel/db/tables.server';
import { invoke, type InvokeResult } from '$lib/kernel/testing/invokeHandlers.server';
import type { JsonValue } from '$lib/kernel/validation/validators';
import { seedUser } from '$lib/kernel/testing/seedRows.server';
import { testCtx } from '$lib/kernel/testing/testCtx.server';
import { testDb, truncateAll } from '$lib/kernel/testing/testDb.server';
import { GET as listImportTargets } from '../../../routes/api/import/+server';
import { POST as commitImport } from '../../../routes/api/import/commit/+server';
import { POST as previewImport } from '../../../routes/api/import/preview/+server';
import { POST as undoImport } from '../../../routes/api/import/undo/+server';

const ctx = () => testCtx({ db: testDb() });

const PERSONAL_CAL = 'cal-personal01';
const FAMILY_CAL = 'cal-family01';
const FAMILY = 'fam-riveras01';

type JsonObject = Record<string, JsonValue>;

/** The response body as an object; a non-object body says what came back instead. */
function objectBody(res: InvokeResult): JsonObject {
	const body = res.body;
	if (body === null || typeof body !== 'object' || Array.isArray(body)) {
		throw new Error(`expected a JSON object body, got: ${res.text.slice(0, 200)}`);
	}
	return { ...body };
}

/** A nested object field, or a failure naming it. */
function objectValue(value: JsonValue | undefined, label: string): JsonObject {
	if (value === null || value === undefined || typeof value !== 'object' || Array.isArray(value)) {
		throw new Error(`expected '${label}' to be an object`);
	}
	return { ...value };
}

function arrayField(body: JsonObject, key: string): JsonValue[] {
	const value = body[key];
	if (!Array.isArray(value)) throw new Error(`expected '${key}' to be an array`);
	return [...value];
}

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

/** What the preview describes for ICS_ONE (the draft the commit posts back). */
const DRAFT = {
	title: 'Soccer practice',
	startIso: '2026-09-29T14:00:00.000Z',
	endIso: '2026-09-29T15:30:00.000Z',
	allDay: false,
	location: null,
	description: null,
	recurrenceFrequency: null,
	recurrenceInterval: null,
	recurrenceByDay: null,
	recurrenceCount: null,
	recurrenceUntil: null
};

const EMPTY_PARSE_ERROR =
	'No events found in that file. An .ics export wraps each event in BEGIN:VEVENT with a ' +
	'SUMMARY and a DTSTART — check you picked the .ics from inside the export, not the whole zip.';

const base64 = (text: string) => Buffer.from(text, 'utf8').toString('base64');

function icsFiles(...names: string[]) {
	return names.map((name) => ({ name, contentBase64: base64(ICS_ONE) }));
}

async function seedCalendar(id: string, input: { ownerId?: string; familyId?: string } = {}) {
	const [row] = await testDb()
		.insert(calendars)
		.values({ id, ownerId: input.ownerId ?? null, familyId: input.familyId ?? null })
		.returning();
	return row;
}

/** A viewer with a personal calendar (the import target every test starts from). */
async function seedViewer() {
	const user = await seedUser(testDb(), { firstName: 'Mia' });
	await seedCalendar(PERSONAL_CAL, { ownerId: user.id });
	return user;
}

beforeEach(truncateAll);

describe('GET /api/import', () => {
	it('answers 401 {"error":"Unauthorized"} when signed out', async () => {
		const res = await invoke(listImportTargets, { ctx: ctx() });

		expect(res.status).toBe(401);
		expect(res.body).toEqual({ error: 'Unauthorized' });
	});

	it('lists the personal calendar and the family calendar, labelled like the page', async () => {
		const user = await seedViewer();
		await testDb().insert(families).values({ id: FAMILY, name: 'Riveras' });
		await testDb().insert(familyMembers).values({ familyId: FAMILY, userId: user.id });
		await seedCalendar(FAMILY_CAL, { familyId: FAMILY });

		const res = await invoke(listImportTargets, { ctx: ctx(), user });

		expect(res.status).toBe(200);
		expect(res.body).toEqual({
			calendars: [
				{ id: PERSONAL_CAL, name: 'Personal Calendar' },
				{ id: FAMILY_CAL, name: 'Family Calendar' }
			]
		});
	});
});

describe('POST /api/import/preview', () => {
	it('answers 401 {"error":"Unauthorized"} when signed out', async () => {
		const res = await invoke(previewImport, {
			ctx: ctx(),
			path: '/api/import/preview',
			body: { calendarId: PERSONAL_CAL, files: icsFiles('kids.ics') }
		});

		expect(res.status).toBe(401);
		expect(res.body).toEqual({ error: 'Unauthorized' });
	});

	it('describes the parsed rows and writes nothing', async () => {
		const user = await seedViewer();

		const res = await invoke(previewImport, {
			ctx: ctx(),
			user,
			path: '/api/import/preview',
			body: { calendarId: PERSONAL_CAL, files: icsFiles('kids.ics') }
		});

		expect(res.status).toBe(200);
		expect(res.body).toEqual({
			preview: {
				calendarId: PERSONAL_CAL,
				calendarName: 'Personal Calendar',
				fileName: 'kids.ics',
				items: [
					{
						...DRAFT,
						key: 'e0',
						fileName: 'kids.ics',
						whenText: 'Tue, Sep 29, 2026 · 2:00 PM–3:30 PM',
						duplicate: false,
						duplicateReason: null
					}
				],
				duplicates: 0,
				files: [{ fileName: 'kids.ics', events: 1, duplicates: 0 }],
				defaultSelection: ['e0']
			}
		});
		expect(await testDb().select({ id: events.id }).from(events)).toEqual([]);
	});

	it('flags a row the calendar already holds as a duplicate and drops it from the selection', async () => {
		const user = await seedViewer();
		await testDb().insert(events).values({
			id: 'evtoneoff01',
			ownerId: user.id,
			calendarId: PERSONAL_CAL,
			title: 'Soccer practice',
			start: '2026-09-29T14:00:00.000Z'
		});

		const res = await invoke(previewImport, {
			ctx: ctx(),
			user,
			path: '/api/import/preview',
			body: { calendarId: PERSONAL_CAL, files: icsFiles('kids.ics') }
		});

		expect(res.status).toBe(200);
		const body = objectBody(res);
		expect(body.preview).toEqual(
			expect.objectContaining({
				duplicates: 1,
				defaultSelection: [],
				files: [{ fileName: 'kids.ics', events: 1, duplicates: 1 }]
			})
		);
		expect(arrayField(objectValue(body['preview'], 'preview'), 'items')).toEqual([
			expect.objectContaining({ key: 'e0', duplicate: true, duplicateReason: 'already-on-calendar' })
		]);
	});

	it("counts several files in the heading and reports each file's rows", async () => {
		const user = await seedViewer();

		const res = await invoke(previewImport, {
			ctx: ctx(),
			user,
			path: '/api/import/preview',
			body: { calendarId: PERSONAL_CAL, files: icsFiles('kids.ics', 'work.ics') }
		});

		expect(res.status).toBe(200);
		const body = objectBody(res);
		expect(body.preview).toEqual(
			expect.objectContaining({
				fileName: '2 files',
				duplicates: 1,
				files: [
					{ fileName: 'kids.ics', events: 1, duplicates: 0 },
					{ fileName: 'work.ics', events: 1, duplicates: 1 }
				],
				defaultSelection: ['e0']
			})
		);
		expect(arrayField(objectValue(body['preview'], 'preview'), 'items')).toEqual([
			expect.objectContaining({ key: 'e0', fileName: 'kids.ics', duplicate: false }),
			expect.objectContaining({
				key: 'e1',
				fileName: 'work.ics',
				duplicate: true,
				duplicateReason: 'earlier-in-import'
			})
		]);
	});

	it("answers 400 'Invalid JSON' for a body that is not JSON", async () => {
		const user = await seedViewer();

		const res = await invoke(previewImport, {
			ctx: ctx(),
			user,
			path: '/api/import/preview',
			rawBody: '{'
		});

		expect(res.status).toBe(400);
		expect(res.body).toEqual({ error: 'Invalid JSON' });
	});

	it('answers every choice error with its page message', async () => {
		const user = await seedViewer();
		const post = (body: JsonObject) =>
			invoke(previewImport, { ctx: ctx(), user, path: '/api/import/preview', body });

		const noCalendar = await post({ files: icsFiles('kids.ics') });
		expect(noCalendar.status).toBe(400);
		expect(noCalendar.body).toEqual({ error: 'Choose a calendar to import into.' });

		const notAnArray = await post({ calendarId: PERSONAL_CAL, files: 'kids.ics' });
		expect(notAnArray.status).toBe(400);
		expect(notAnArray.body).toEqual({ error: 'files must be an array' });

		const noBase64 = await post({ calendarId: PERSONAL_CAL, files: [{ name: 'kids.ics' }] });
		expect(noBase64.status).toBe(400);
		expect(noBase64.body).toEqual({ error: 'Each file needs contentBase64 (base64 text)' });

		const noFile = await post({ calendarId: PERSONAL_CAL, files: [] });
		expect(noFile.status).toBe(400);
		expect(noFile.body).toEqual({ error: 'Choose an .ics file to import.' });

		const tooMany = await post({
			calendarId: PERSONAL_CAL,
			files: icsFiles(...Array.from({ length: 11 }, (_, index) => `f${index}.ics`))
		});
		expect(tooMany.status).toBe(400);
		expect(tooMany.body).toEqual({ error: 'Choose up to 10 files at a time.' });

		const tooBig = await post({
			calendarId: PERSONAL_CAL,
			files: [{ name: 'big.ics', contentBase64: Buffer.alloc(5 * 1024 * 1024 + 1).toString('base64') }]
		});
		expect(tooBig.status).toBe(400);
		expect(tooBig.body).toEqual({ error: 'big.ics is larger than 5 MB.' });

		const empty = await post({
			calendarId: PERSONAL_CAL,
			files: [{ name: 'empty.ics', contentBase64: base64('BEGIN:VCALENDAR\r\nEND:VCALENDAR') }]
		});
		expect(empty.status).toBe(400);
		expect(empty.body).toEqual({ error: EMPTY_PARSE_ERROR });
	});

	it("answers 403 'That calendar is not yours to import into.'", async () => {
		const user = await seedViewer();
		const stranger = await seedUser(testDb());
		await seedCalendar('cal-stranger1', { ownerId: stranger.id });

		const res = await invoke(previewImport, {
			ctx: ctx(),
			user,
			path: '/api/import/preview',
			body: { calendarId: 'cal-stranger1', files: icsFiles('kids.ics') }
		});

		expect(res.status).toBe(403);
		expect(res.body).toEqual({ error: 'That calendar is not yours to import into.' });
	});
});

describe('POST /api/import/commit', () => {
	it('answers 401 {"error":"Unauthorized"} when signed out', async () => {
		const res = await invoke(commitImport, {
			ctx: ctx(),
			path: '/api/import/commit',
			body: { calendarId: PERSONAL_CAL, picked: [DRAFT] }
		});

		expect(res.status).toBe(401);
		expect(res.body).toEqual({ error: 'Unauthorized' });
	});

	it('writes only the ticked rows, then the next GET shows them', async () => {
		const user = await seedViewer();

		const res = await invoke(commitImport, {
			ctx: ctx(),
			user,
			path: '/api/import/commit',
			body: { calendarId: PERSONAL_CAL, picked: [DRAFT] }
		});

		expect(res.status).toBe(200);
		expect(res.body).toEqual({
			calendarId: PERSONAL_CAL,
			calendarName: 'Personal Calendar',
			imported: 1,
			selected: 1,
			skipped: 0,
			skippedDuplicates: 0,
			failed: [],
			importedEvents: [
				{
					id: expect.stringMatching(/^[a-z0-9]{15}$/),
					title: 'Soccer practice',
					startIso: '2026-09-29T14:00:00.000Z'
				}
			]
		});

		const rows = await testDb().select().from(events);
		expect(rows).toHaveLength(1);
		expect(rows[0]).toEqual(
			expect.objectContaining({
				calendarId: PERSONAL_CAL,
				ownerId: user.id,
				title: 'Soccer practice',
				allDay: false,
				description: null,
				location: null,
				reminderMinutes: null,
				recurrenceFrequency: null,
				recurrenceInterval: null,
				recurrenceByDay: null,
				recurrenceCount: null,
				recurrenceUntil: null
			})
		);
		expect(new Date(String(rows[0]?.start)).toISOString()).toBe('2026-09-29T14:00:00.000Z');
		expect(new Date(String(rows[0]?.end)).toISOString()).toBe('2026-09-29T15:30:00.000Z');

		// createEvent still auto-RSVPs the creator.
		expect(await testDb().select().from(eventAttendance)).toEqual([
			expect.objectContaining({ userId: user.id, status: 'going', inviteType: 'optional' })
		]);
	});

	it('labels the family calendar and imports into it', async () => {
		const user = await seedViewer();
		await testDb().insert(families).values({ id: FAMILY, name: 'Riveras' });
		await testDb().insert(familyMembers).values({ familyId: FAMILY, userId: user.id });
		await seedCalendar(FAMILY_CAL, { familyId: FAMILY });

		const res = await invoke(commitImport, {
			ctx: ctx(),
			user,
			path: '/api/import/commit',
			body: { calendarId: FAMILY_CAL, picked: [DRAFT] }
		});

		expect(res.status).toBe(200);
		expect(objectBody(res)).toMatchObject({
			calendarId: FAMILY_CAL,
			calendarName: 'Family Calendar',
			imported: 1
		});
	});

	it('re-checks the calendar at commit time and skips a row that landed meanwhile', async () => {
		const user = await seedViewer();
		await testDb().insert(events).values({
			id: 'evtoneoff01',
			ownerId: user.id,
			calendarId: PERSONAL_CAL,
			title: 'Soccer practice',
			start: '2026-09-29T14:00:00.000Z'
		});

		const res = await invoke(commitImport, {
			ctx: ctx(),
			user,
			path: '/api/import/commit',
			body: { calendarId: PERSONAL_CAL, picked: [DRAFT] }
		});

		expect(res.status).toBe(200);
		expect(res.body).toEqual({
			calendarId: PERSONAL_CAL,
			calendarName: 'Personal Calendar',
			imported: 0,
			selected: 1,
			skipped: 1,
			skippedDuplicates: 1,
			failed: [],
			importedEvents: []
		});
		expect(await testDb().select({ id: events.id }).from(events)).toHaveLength(1);
	});

	it('answers every selection error with its page message', async () => {
		const user = await seedViewer();
		const post = (body: JsonObject) =>
			invoke(commitImport, { ctx: ctx(), user, path: '/api/import/commit', body });

		const nothingPicked = await post({ calendarId: PERSONAL_CAL });
		expect(nothingPicked.status).toBe(400);
		expect(nothingPicked.body).toEqual({ error: 'Pick the events you want to add.' });

		const emptyPicked = await post({ calendarId: PERSONAL_CAL, picked: [] });
		expect(emptyPicked.status).toBe(400);
		expect(emptyPicked.body).toEqual({ error: 'Tick at least one event before importing.' });

		const unreadable = await post({ calendarId: PERSONAL_CAL, picked: '{oops' });
		expect(unreadable.status).toBe(400);
		expect(unreadable.body).toEqual({
			error: 'That selection could not be read — preview the file again.'
		});

		const malformedRow = await post({ calendarId: PERSONAL_CAL, picked: [{ title: 'No start' }] });
		expect(malformedRow.status).toBe(400);
		expect(malformedRow.body).toEqual({ error: 'Tick at least one event before importing.' });
	});
});

describe('POST /api/import/undo', () => {
	it('answers 401 {"error":"Unauthorized"} when signed out', async () => {
		const res = await invoke(undoImport, {
			ctx: ctx(),
			path: '/api/import/undo',
			body: { calendarId: PERSONAL_CAL, batch: [] }
		});

		expect(res.status).toBe(401);
		expect(res.body).toEqual({ error: 'Unauthorized' });
	});

	it('removes the rows that commit added, scoped to the viewer and the calendar', async () => {
		const user = await seedViewer();
		await invoke(commitImport, {
			ctx: ctx(),
			user,
			path: '/api/import/commit',
			body: { calendarId: PERSONAL_CAL, picked: [DRAFT] }
		});
		const [row] = await testDb().select({ id: events.id }).from(events);
		const batch = [
			{ id: row?.id, title: 'Soccer practice', startIso: '2026-09-29T14:00:00.000Z' }
		];

		const res = await invoke(undoImport, {
			ctx: ctx(),
			user,
			path: '/api/import/undo',
			body: { calendarId: PERSONAL_CAL, batch }
		});

		expect(res.status).toBe(200);
		expect(res.body).toEqual({
			calendarName: 'Personal Calendar',
			removed: 1,
			kept: [],
			alreadyGone: 0
		});
		expect(await testDb().select({ id: events.id }).from(events)).toEqual([]);
	});

	it('keeps and names a row the user edited since the import', async () => {
		const user = await seedViewer();
		await invoke(commitImport, {
			ctx: ctx(),
			user,
			path: '/api/import/commit',
			body: { calendarId: PERSONAL_CAL, picked: [DRAFT] }
		});
		const [row] = await testDb().select({ id: events.id }).from(events);
		await testDb()
			.update(events)
			.set({ title: 'Soccer practice (moved)' })
			.where(eq(events.id, String(row?.id)));

		const res = await invoke(undoImport, {
			ctx: ctx(),
			user,
			path: '/api/import/undo',
			body: {
				calendarId: PERSONAL_CAL,
				batch: [{ id: row?.id, title: 'Soccer practice', startIso: '2026-09-29T14:00:00.000Z' }]
			}
		});

		expect(res.status).toBe(200);
		expect(res.body).toEqual({
			calendarName: 'Personal Calendar',
			removed: 0,
			kept: [{ id: row?.id, title: 'Soccer practice (moved)' }],
			alreadyGone: 0
		});
		expect(await testDb().select({ id: events.id }).from(events)).toHaveLength(1);
	});

	it('reports rows that are already gone and rows it may not touch', async () => {
		const user = await seedViewer();
		const other = await seedUser(testDb());
		await testDb().insert(events).values({
			id: 'evtsomeone01',
			ownerId: other.id,
			calendarId: PERSONAL_CAL,
			title: 'Soccer practice',
			start: '2026-09-29T14:00:00.000Z'
		});

		const res = await invoke(undoImport, {
			ctx: ctx(),
			user,
			path: '/api/import/undo',
			body: {
				calendarId: PERSONAL_CAL,
				batch: [
					{ id: 'missingevent1', title: 'Gone', startIso: '2026-09-29T14:00:00.000Z' },
					{ id: 'evtsomeone01', title: 'Soccer practice', startIso: '2026-09-29T14:00:00.000Z' }
				]
			}
		});

		expect(res.status).toBe(200);
		expect(res.body).toEqual({
			calendarName: 'Personal Calendar',
			removed: 0,
			kept: [],
			alreadyGone: 2
		});
		expect(await testDb().select({ id: events.id }).from(events)).toHaveLength(1);
	});

	it('answers every batch error with its page message', async () => {
		const user = await seedViewer();
		const post = (body: JsonObject) =>
			invoke(undoImport, { ctx: ctx(), user, path: '/api/import/undo', body });

		const noBatch = await post({ calendarId: PERSONAL_CAL });
		expect(noBatch.status).toBe(400);
		expect(noBatch.body).toEqual({ error: 'Nothing to undo — import a file first.' });

		const emptyBatch = await post({ calendarId: PERSONAL_CAL, batch: [] });
		expect(emptyBatch.status).toBe(400);
		expect(emptyBatch.body).toEqual({ error: 'Nothing to undo — import a file first.' });

		const unreadable = await post({ calendarId: PERSONAL_CAL, batch: 'garbage' });
		expect(unreadable.status).toBe(400);
		expect(unreadable.body).toEqual({ error: 'That undo could not be read — import the file again.' });
	});
});
