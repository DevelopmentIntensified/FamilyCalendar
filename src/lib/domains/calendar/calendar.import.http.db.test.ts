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
	eventAttendance,
	events,
	families,
	familyMembers,
	userSettings
} from '$lib/kernel/db/tables.server';
import { invoke, type InvokeResult } from '$lib/kernel/testing/invokeHandlers.server';
import type { JsonValue } from '$lib/kernel/validation/validators';
import { seedUser } from '$lib/kernel/testing/seedRows.server';
import { testCtx } from '$lib/kernel/testing/testCtx.server';
import { testDb, truncateAll } from '$lib/kernel/testing/testDb.server';
import { seedCalendarRow, seedEventRow } from './calendar.fixtures.server';
import { GET as getEvents } from '../../../routes/api/events/+server';
import { GET as listImportTargets } from '../../../routes/api/import/+server';
import { POST as commitImport } from '../../../routes/api/import/commit/+server';
import { POST as previewImport } from '../../../routes/api/import/preview/+server';
import { POST as undoImport } from '../../../routes/api/import/undo/+server';

const ctx = () => testCtx({ db: testDb() });

const PERSONAL_CAL = 'cal-personal01';
const FAMILY_CAL = 'cal-family01';
const FAMILY = 'fam-riveras01';

type JsonObject = Record<string, JsonValue>;

/** A JSON object as a plain record (spreading the union body would keep its readonly shape). */
function toObject(source: object): JsonObject {
	const out: JsonObject = {};
	for (const [key, value] of Object.entries(source)) out[key] = value;
	return out;
}

/** The response body as an object; a non-object body says what came back instead. */
function objectBody(res: InvokeResult): JsonObject {
	const body = res.body;
	if (body === null || typeof body !== 'object' || Array.isArray(body)) {
		throw new Error(`expected a JSON object body, got: ${res.text.slice(0, 200)}`);
	}
	return toObject(body);
}

/** A nested object field, or a failure naming it. */
function objectValue(value: JsonValue | undefined, label: string): JsonObject {
	if (value === null || value === undefined || typeof value !== 'object' || Array.isArray(value)) {
		throw new Error(`expected '${label}' to be an object`);
	}
	return toObject(value);
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

/**
 * What the preview describes for ICS_ONE (the draft the commit posts back).
 * The parser initialises `recurrenceInterval` to 1 and only rewrites it from an
 * RRULE, so a non-recurring row still carries 1 (icsImportService.ts:220,233).
 */
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

const EMPTY_PARSE_ERROR =
	'No events found in that file. An .ics export wraps each event in BEGIN:VEVENT with a ' +
	'SUMMARY and a DTSTART — check you picked the .ics from inside the export, not the whole zip.';

const base64 = (text: string) => Buffer.from(text, 'utf8').toString('base64');

function icsFiles(...names: string[]) {
	return names.map((name) => ({ name, contentBase64: base64(ICS_ONE) }));
}

/** A viewer with a personal calendar (the import target every test starts from). */
async function seedViewer() {
	const user = await seedUser(testDb(), { firstName: 'Mia' });
	await seedCalendarRow(PERSONAL_CAL, { ownerId: user.id });
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
		await seedCalendarRow(FAMILY_CAL, { familyId: FAMILY });

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
		await seedEventRow({
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
						duplicate: true,
						duplicateReason: 'already-on-calendar'
					}
				],
				duplicates: 1,
				files: [{ fileName: 'kids.ics', events: 1, duplicates: 1 }],
				defaultSelection: []
			}
		});
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
		expect(res.body).toEqual({
			preview: {
				calendarId: PERSONAL_CAL,
				calendarName: 'Personal Calendar',
				fileName: '2 files',
				items: [
					{
						...DRAFT,
						key: 'e0',
						fileName: 'kids.ics',
						whenText: 'Tue, Sep 29, 2026 · 2:00 PM–3:30 PM',
						duplicate: false,
						duplicateReason: null
					},
					{
						...DRAFT,
						key: 'e1',
						fileName: 'work.ics',
						whenText: 'Tue, Sep 29, 2026 · 2:00 PM–3:30 PM',
						duplicate: true,
						duplicateReason: 'earlier-in-import'
					}
				],
				duplicates: 1,
				files: [
					{ fileName: 'kids.ics', events: 1, duplicates: 0 },
					{ fileName: 'work.ics', events: 1, duplicates: 1 }
				],
				defaultSelection: ['e0']
			}
		});
	});

	// Q-045 (flip-ready): the importer strips each ordinal prefix and then
	// requires the stripped list to equal the RAW value, so a day written `2TU`
	// is dropped entirely — BYDAY ends up null and the series expands on its
	// anchor weekday (icsImportService.ts:244). The fix keeps TU,TH.
	it('drops BYDAY entirely when a weekday carries an ordinal (Q-045)', async () => {
		const user = await seedViewer();
		const ics = [
			'BEGIN:VCALENDAR',
			'BEGIN:VEVENT',
			'SUMMARY:Soccer practice',
			'DTSTART:20260929T140000Z',
			'DTEND:20260929T153000Z',
			'RRULE:FREQ=WEEKLY;BYDAY=2TU,TH',
			'END:VEVENT',
			'END:VCALENDAR'
		].join('\r\n');

		const res = await invoke(previewImport, {
			ctx: ctx(),
			user,
			path: '/api/import/preview',
			body: { calendarId: PERSONAL_CAL, files: [{ name: 'kids.ics', contentBase64: base64(ics) }] }
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
						recurrenceFrequency: 'weekly',
						recurrenceInterval: 1,
						recurrenceByDay: null,
						key: 'e0',
						fileName: 'kids.ics',
						whenText: 'Tue, Sep 29, 2026 · 2:00 PM–3:30 PM · every week',
						duplicate: false,
						duplicateReason: null
					}
				],
				duplicates: 0,
				files: [{ fileName: 'kids.ics', events: 1, duplicates: 0 }],
				defaultSelection: ['e0']
			}
		});
	});

	// The parser's input matrix, one row per rule: a TZID (here the quoted
	// Outlook pseudo-name), an all-day pair stored as an inclusive end, a
	// DURATION fallback, and a CANCELLED row that never reaches the preview
	// (icsImportService.ts:59-99,156-278).
	it('reads TZID, all-day and DURATION rows and skips CANCELLED ones', async () => {
		const user = await seedViewer();
		const ics = [
			'BEGIN:VCALENDAR',
			'BEGIN:VEVENT',
			'SUMMARY:Call',
			'DTSTART;TZID="Eastern Standard Time":20261005T140000',
			'DTEND;TZID="Eastern Standard Time":20261005T150000',
			'END:VEVENT',
			'BEGIN:VEVENT',
			'SUMMARY:Camp',
			'DTSTART;VALUE=DATE:20261006',
			'DTEND;VALUE=DATE:20261008',
			'END:VEVENT',
			'BEGIN:VEVENT',
			'SUMMARY:Practice',
			'DTSTART:20261009T140000Z',
			'DURATION:PT1H30M',
			'END:VEVENT',
			'BEGIN:VEVENT',
			'SUMMARY:Cancelled thing',
			'DTSTART:20261010T140000Z',
			'STATUS:CANCELLED',
			'END:VEVENT',
			'END:VCALENDAR'
		].join('\r\n');

		const res = await invoke(previewImport, {
			ctx: ctx(),
			user,
			path: '/api/import/preview',
			body: { calendarId: PERSONAL_CAL, files: [{ name: 'kids.ics', contentBase64: base64(ics) }] }
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
						title: 'Call',
						startIso: '2026-10-05T18:00:00.000Z',
						endIso: '2026-10-05T19:00:00.000Z',
						key: 'e0',
						fileName: 'kids.ics',
						whenText: 'Mon, Oct 5, 2026 · 2:00 PM–3:00 PM',
						duplicate: false,
						duplicateReason: null
					},
					{
						...DRAFT,
						title: 'Camp',
						startIso: '2026-10-06T00:00:00.000Z',
						endIso: '2026-10-07T23:59:59.999Z',
						allDay: true,
						key: 'e1',
						fileName: 'kids.ics',
						whenText: 'Tue, Oct 6, 2026 · all day',
						duplicate: false,
						duplicateReason: null
					},
					{
						...DRAFT,
						title: 'Practice',
						startIso: '2026-10-09T14:00:00.000Z',
						endIso: '2026-10-09T15:30:00.000Z',
						key: 'e2',
						fileName: 'kids.ics',
						whenText: 'Fri, Oct 9, 2026 · 2:00 PM–3:30 PM',
						duplicate: false,
						duplicateReason: null
					}
				],
				duplicates: 0,
				files: [{ fileName: 'kids.ics', events: 3, duplicates: 0 }],
				defaultSelection: ['e0', 'e1', 'e2']
			}
		});
	});

	it('unfolds a continuation line and cuts the title at 200 characters', async () => {
		const user = await seedViewer();
		const longTitle = 'x'.repeat(250);
		const ics = [
			'BEGIN:VCALENDAR',
			'BEGIN:VEVENT',
			'SUMMARY:Soccer pr',
			' actice',
			'DTSTART:20260929T140000Z',
			'END:VEVENT',
			'BEGIN:VEVENT',
			`SUMMARY:${longTitle}`,
			'DTSTART:20260930T140000Z',
			'END:VEVENT',
			'END:VCALENDAR'
		].join('\r\n');

		const res = await invoke(previewImport, {
			ctx: ctx(),
			user,
			path: '/api/import/preview',
			body: { calendarId: PERSONAL_CAL, files: [{ name: 'kids.ics', contentBase64: base64(ics) }] }
		});

		expect(res.status).toBe(200);
		const preview = objectValue(objectBody(res)['preview'], 'preview');
		const items = arrayField(preview, 'items');
		expect(items).toHaveLength(2);
		expect(items[0]).toEqual(
			expect.objectContaining({ key: 'e0', title: 'Soccer practice' })
		);
		expect(items[1]).toEqual(
			expect.objectContaining({ key: 'e1', title: 'x'.repeat(200) })
		);
	});

	it('caps one file at 500 parsed events', async () => {
		const user = await seedViewer();
		const vevents = Array.from({ length: 501 }, (_, index) =>
			[
				'BEGIN:VEVENT',
				`SUMMARY:Event ${index}`,
				'DTSTART:20260929T140000Z',
				'END:VEVENT'
			].join('\r\n')
		);
		const ics = ['BEGIN:VCALENDAR', ...vevents, 'END:VCALENDAR'].join('\r\n');

		const res = await invoke(previewImport, {
			ctx: ctx(),
			user,
			path: '/api/import/preview',
			body: { calendarId: PERSONAL_CAL, files: [{ name: 'many.ics', contentBase64: base64(ics) }] }
		});

		expect(res.status).toBe(200);
		const preview = objectValue(objectBody(res)['preview'], 'preview');
		const items = arrayField(preview, 'items');
		expect(items).toHaveLength(500);
		expect(items[499]).toEqual(expect.objectContaining({ key: 'e499', title: 'Event 499' }));
		expect(preview['files']).toEqual([{ fileName: 'many.ics', events: 500, duplicates: 0 }]);
	});

	it('flags a repeated row in the SAME file as earlier-in-file', async () => {
		const user = await seedViewer();
		const ics = [
			'BEGIN:VCALENDAR',
			'BEGIN:VEVENT',
			'SUMMARY:Soccer practice',
			'DTSTART:20260929T140000Z',
			'END:VEVENT',
			'BEGIN:VEVENT',
			'SUMMARY:Soccer practice',
			'DTSTART:20260929T140000Z',
			'END:VEVENT',
			'END:VCALENDAR'
		].join('\r\n');

		const res = await invoke(previewImport, {
			ctx: ctx(),
			user,
			path: '/api/import/preview',
			body: { calendarId: PERSONAL_CAL, files: [{ name: 'kids.ics', contentBase64: base64(ics) }] }
		});

		expect(res.status).toBe(200);
		const preview = objectValue(objectBody(res)['preview'], 'preview');
		const items = arrayField(preview, 'items');
		expect(items).toHaveLength(2);
		expect(items[1]).toEqual(
			expect.objectContaining({
				key: 'e1',
				duplicate: true,
				duplicateReason: 'earlier-in-file'
			})
		);
		expect(preview['defaultSelection']).toEqual(['e0']);
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
		await seedCalendarRow('cal-stranger1', { ownerId: stranger.id });

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
				recurrenceInterval: 1,
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

		// …and the displayed read shows it, exactly as the calendar will.
		const importedId = rows[0]?.id;
		const read = await invoke(getEvents, {
			ctx: ctx(),
			user,
			query: { from: '2026-09-29', to: '2026-09-29' }
		});
		expect(read.status).toBe(200);
		expect(arrayField(objectBody(read), 'events')).toEqual([
			{
				id: `${importedId}~2026-09-29T14:00:00.000Z`,
				calendarId: PERSONAL_CAL,
				ownerId: user.id,
				title: 'Soccer practice',
				start: '2026-09-29T14:00:00.000Z',
				end: '2026-09-29T15:30:00.000Z',
				description: null,
				location: null,
				allDay: false,
				recurrenceFrequency: null,
				// The parser's initial 1 survives the commit.
				recurrenceInterval: 1,
				recurrenceByDay: null,
				recurrenceCount: null,
				recurrenceUntil: null,
				reminderMinutes: null,
				mirrorOf: null,
				created_at: expect.any(String),
				masterId: importedId,
				occurrenceDate: '2026-09-29T14:00:00.000Z',
				date: '2026-09-29T14:00:00.000Z',
				rsvpStatus: 'going',
				attendance: {
					going: 1,
					invited: 1,
					required: 0,
					requiredPending: 0,
					goingNames: ['Mia']
				},
				creatorName: 'Mia'
			}
		]);
	});

	it('labels the family calendar and imports into it', async () => {
		const user = await seedViewer();
		await testDb().insert(families).values({ id: FAMILY, name: 'Riveras' });
		await testDb().insert(familyMembers).values({ familyId: FAMILY, userId: user.id });
		await seedCalendarRow(FAMILY_CAL, { familyId: FAMILY });

		const res = await invoke(commitImport, {
			ctx: ctx(),
			user,
			path: '/api/import/commit',
			body: { calendarId: FAMILY_CAL, picked: [DRAFT] }
		});

		expect(res.status).toBe(200);
		expect(res.body).toEqual({
			calendarId: FAMILY_CAL,
			calendarName: 'Family Calendar',
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
	});

	// The import writes through `createEvent` directly, not the POST route, so
	// `syncEventsToFamilyCalendar` never mirrors an import (icsImportFlow.ts:305).
	it('writes no family mirror even when the sync setting is on', async () => {
		const user = await seedViewer();
		await testDb().insert(families).values({ id: FAMILY, name: 'Riveras' });
		await testDb().insert(familyMembers).values({ familyId: FAMILY, userId: user.id });
		await seedCalendarRow(FAMILY_CAL, { familyId: FAMILY });
		await testDb()
			.insert(userSettings)
			.values({ userId: user.id, syncEventsToFamilyCalendar: true });

		const res = await invoke(commitImport, {
			ctx: ctx(),
			user,
			path: '/api/import/commit',
			body: { calendarId: PERSONAL_CAL, picked: [DRAFT] }
		});

		expect(res.status).toBe(200);
		expect(objectBody(res)['imported']).toBe(1);
		const rows = await testDb().select().from(events);
		expect(rows).toHaveLength(1);
		expect(rows[0]?.calendarId).toBe(PERSONAL_CAL);
		expect(rows[0]?.mirrorOf).toBeNull();
	});

	it('re-checks the calendar at commit time and skips a row that landed meanwhile', async () => {
		const user = await seedViewer();
		await seedEventRow({
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

	const SELECTION_ERRORS: readonly { name: string; body: JsonObject; error: string }[] = [
		{
			name: 'no picked key at all',
			body: { calendarId: PERSONAL_CAL },
			error: 'Pick the events you want to add.'
		},
		{
			name: 'an empty picked list',
			body: { calendarId: PERSONAL_CAL, picked: [] },
			error: 'Tick at least one event before importing.'
		},
		{
			name: 'picked is not JSON',
			body: { calendarId: PERSONAL_CAL, picked: '{oops' },
			error: 'That selection could not be read — preview the file again.'
		},
		{
			name: 'a row without a start',
			body: { calendarId: PERSONAL_CAL, picked: [{ title: 'No start' }] },
			error: 'Tick at least one event before importing.'
		}
	];

	it.each(SELECTION_ERRORS)('answers the selection error for $name', async ({ body, error }) => {
		const user = await seedViewer();
		const res = await invoke(commitImport, {
			ctx: ctx(),
			user,
			path: '/api/import/commit',
			body
		});
		expect(res.status).toBe(400);
		expect(res.body).toEqual({ error });
	});

	it('rejects a commit batch over the 500-row cap outright', async () => {
		const user = await seedViewer();
		const picked = Array.from({ length: 501 }, (_, index) => ({
			...DRAFT,
			title: `Event ${index}`
		}));

		const res = await invoke(commitImport, {
			ctx: ctx(),
			user,
			path: '/api/import/commit',
			body: { calendarId: PERSONAL_CAL, picked }
		});

		expect(res.status).toBe(400);
		expect(res.body).toEqual({ error: 'Tick at least one event before importing.' });
		expect(await testDb().select({ id: events.id }).from(events)).toEqual([]);
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
		await seedEventRow({
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
