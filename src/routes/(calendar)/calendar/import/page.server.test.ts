/* oxlint-disable anti-slop/no-chained-type-assertions -- SAFETY: `createEvent` is typed as returning a whole `CalendarEvent` row, which a test double cannot construct honestly. Every such cast in this file supplies only the `id` the commit action reads, and the assertions are on the commit's report rather than on the row. */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { actions, type ImportDeps } from './+page.server';
import { parseIcs, type IcsFrequency } from '$lib/server/services/icsImportService';
import type { ImportedEventRef, UndoCandidate } from '$lib/server/services/icsImportPreview';

// oxlint-disable-next-line anti-slop/no-unsafe-dictionary-type -- the action's return is SvelteKit's bag (Record<string, any>); tests narrow it via previewOf / commitOf / failureOf.
type RequestResult = Record<string, unknown> | void;

/** The slice of a form action's RequestEvent these handlers actually read. */
interface ImportRequest {
	request: { formData: () => Promise<FormData> };
	locals: { user: { id: string } | null };
}

/** A handler as the tests call it: the deps seam plus a minimal RequestEvent. */
type HandlerWithDeps = (event: ImportRequest, deps: ImportDeps) => Promise<RequestResult>;

/*
 * SAFETY: SvelteKit's `Actions` type erases each handler's optional `deps`
 * parameter and widens its event to the full `RequestEvent`. At runtime all
 * three are two-argument functions reading only `request.formData()` and
 * `locals.user` — which `ImportRequest` is exactly — and both facts are
 * re-verified by the 401/400 tests below. The `unknown` hop is what
 * `tsc` asks for when neither declared type overlaps.
 */
// SAFETY: see the note above this block.
const callPreview = actions.preview as unknown as HandlerWithDeps;
// SAFETY: see the note above this block.
const callCommit = actions.commit as unknown as HandlerWithDeps;
// SAFETY: see the note above this block.
const callUndo = actions.undo as unknown as HandlerWithDeps;

function ics(...lines: string[]): string {
	return ['BEGIN:VCALENDAR', ...lines, 'END:VCALENDAR'].join('\r\n');
}

const SOCCER = [
	'BEGIN:VEVENT',
	'SUMMARY:Soccer practice',
	'DTSTART:20260929T140000Z',
	'DTEND:20260929T153000Z',
	'LOCATION:Riverside Park',
	'END:VEVENT'
].join('\r\n');

const CHOIR = [
	'BEGIN:VEVENT',
	'SUMMARY:Choir',
	'DTSTART;VALUE=DATE:20261225',
	'RRULE:FREQ=WEEKLY;BYDAY=MO,WE;COUNT=10',
	'END:VEVENT'
].join('\r\n');

function makeDeps(over: Partial<ImportDeps> = {}) {
	const deps: ImportDeps = {
		parseIcs,
		getUserFamilyId: vi.fn(async () => null),
		calendarIsOwned: vi.fn(async () => true),
		listExistingKeys: vi.fn(async (): Promise<string[]> => []),
		// SAFETY: the stub return stands in for createEvent's nominal CalendarEvent
		// return; tests assert on the arguments it was called with, not the row.
		createEvent: vi.fn(async () => ({ id: 'ev-1' }) as never),
		getUserZone: vi.fn(async () => 'utc'),
		loadUndoCandidates: vi.fn(async (): Promise<UndoCandidate[]> => []),
		deleteImportedEvents: vi.fn(async () => 0),
		...over
	};
	return deps;
}

/** A preview request: signed in, one .ics file, a chosen calendar. */
function previewEvent(body: string, user: { id: string } | null = { id: 'user-1' }) {
	const form = new FormData();
	form.set('calendarId', 'cal-1');
	form.set('file', new File([body], 'cal.ics', { type: 'text/calendar' }));
	return { request: { formData: async () => form }, locals: { user } };
}

/** A preview request carrying several exports at once, as the drop zone posts them. */
function previewFilesEvent(files: { name: string; body: string }[]) {
	const form = new FormData();
	form.set('calendarId', 'cal-1');
	for (const file of files) {
		form.append('files', new File([file.body], file.name, { type: 'text/calendar' }));
	}
	return { request: { formData: async () => form }, locals: { user: { id: 'user-1' } } };
}

interface PreviewPayload {
	calendarId: string;
	calendarName: string;
	fileName: string;
	items: Array<{
		key: string;
		fileName: string;
		title: string;
		whenText: string;
		location: string | null;
		duplicate: boolean;
		duplicateReason: string | null;
	}>;
	duplicates: number;
	defaultSelection: string[];
	/** One row per uploaded export: `import.html`'s "What is in them". */
	files: Array<{ fileName: string; events: number; duplicates: number }>;
}

interface CommitReport {
	imported: number;
	selected: number;
	skipped: number;
	skippedDuplicates: number;
	failed: string[];
	calendarName: string;
	calendarId: string;
	importedEvents: ImportedEventRef[];
}

function previewOf(result: RequestResult): PreviewPayload {
	// SAFETY: the happy path returns { preview } directly; fail() branches are
	// asserted separately through failureOf.
	const bag = result as { preview: PreviewPayload };
	return bag.preview;
}

function commitOf(result: RequestResult): CommitReport {
	// SAFETY: the happy path returns the commit report directly; fail() branches
	// are asserted separately through failureOf.
	return result as unknown as CommitReport;
}

function failureOf(result: RequestResult): { status: number; data: { error: string } } {
	// SAFETY: failing branches return fail(...), which structurally carries
	// status/data; success branches are asserted via previewOf / commitOf.
	return result as { status: number; data: { error: string } };
}

/** One ticked preview row, exactly as the client posts it back. */
interface PickedRow {
	key: string;
	whenText: string;
	duplicate: boolean;
	duplicateReason: null;
	title: string;
	startIso: string;
	endIso: string | null;
	allDay: boolean;
	location: string | null;
	description: string | null;
	recurrenceFrequency: IcsFrequency | null;
	recurrenceInterval: number | null;
	recurrenceByDay: string[] | null;
	recurrenceCount: number | null;
	recurrenceUntil: string | null;
}

function row(title: string, startIso: string, over: Partial<PickedRow> = {}): PickedRow {
	return {
		key: 'e0',
		whenText: 'whatever the preview said',
		duplicate: false,
		duplicateReason: null,
		title,
		startIso,
		endIso: null,
		allDay: false,
		location: null,
		description: null,
		recurrenceFrequency: null,
		recurrenceInterval: null,
		recurrenceByDay: null,
		recurrenceCount: null,
		recurrenceUntil: null,
		...over
	};
}

/** A commit request carrying the ticked rows as JSON. */
function commitEvent(rows: PickedRow[], user: { id: string } | null = { id: 'user-1' }) {
	const form = new FormData();
	form.set('calendarId', 'cal-1');
	form.set('picked', JSON.stringify(rows));
	return { request: { formData: async () => form }, locals: { user } };
}

/** A commit request whose `picked` field is raw text, for the malformed cases. */
function commitRawEvent(body: string) {
	const form = new FormData();
	form.set('calendarId', 'cal-1');
	form.set('picked', body);
	return { request: { formData: async () => form }, locals: { user: { id: 'user-1' } } };
}

beforeEach(() => {
	vi.clearAllMocks();
});

describe('POST /calendar/import ?/preview', () => {
	it('describes each parsed event and writes nothing', async () => {
		const deps = makeDeps();

		const preview = previewOf(await callPreview(previewEvent(ics(SOCCER, CHOIR)), deps));

		expect(preview.items).toHaveLength(2);
		expect(preview.items[0]).toMatchObject({
			key: 'e0',
			title: 'Soccer practice',
			whenText: 'Tue, Sep 29, 2026 · 2:00 PM–3:30 PM',
			location: 'Riverside Park',
			duplicate: false
		});
		expect(deps.createEvent).not.toHaveBeenCalled();
	});

	it('spells the recurrence out in words rather than showing a raw RRULE', async () => {
		const deps = makeDeps();

		const preview = previewOf(await callPreview(previewEvent(ics(CHOIR)), deps));

		expect(preview.items[0].whenText).toBe(
			'Fri, Dec 25, 2026 · all day · every week on Mon, Wed for 10 weeks'
		);
		expect(preview.items[0].whenText).not.toContain('FREQ=');
	});

	it('marks an event already on the calendar as a likely duplicate', async () => {
		const deps = makeDeps({
			listExistingKeys: vi.fn(async () => ['soccer practice|2026-09-29T14:00:00.000Z'])
		});

		const preview = previewOf(await callPreview(previewEvent(ics(SOCCER)), deps));

		expect(preview.items[0].duplicate).toBe(true);
		expect(preview.items[0].duplicateReason).toBe('already-on-calendar');
		expect(preview.duplicates).toBe(1);
	});

	it('leaves likely duplicates unticked and ticks everything else', async () => {
		const deps = makeDeps({
			listExistingKeys: vi.fn(async () => ['soccer practice|2026-09-29T14:00:00.000Z'])
		});

		const preview = previewOf(await callPreview(previewEvent(ics(SOCCER, CHOIR)), deps));

		expect(preview.defaultSelection).toEqual(['e1']);
	});

	it('marks a row repeated inside the file itself', async () => {
		const deps = makeDeps();

		const preview = previewOf(await callPreview(previewEvent(ics(SOCCER, SOCCER)), deps));

		expect(preview.items[1].duplicateReason).toBe('earlier-in-file');
		expect(preview.defaultSelection).toEqual(['e0']);
	});

	it('names the target calendar so the commit cannot drift to another one', async () => {
		const deps = makeDeps();

		const preview = previewOf(await callPreview(previewEvent(ics(SOCCER)), deps));

		expect(preview.calendarId).toBe('cal-1');
		expect(preview.calendarName).toBe('Personal Calendar');
		expect(preview.fileName).toBe('cal.ics');
		expect(preview.files).toEqual([{ fileName: 'cal.ics', events: 1, duplicates: 0 }]);
	});

	/*
	 * `import.html` drops three exports at once and answers "what is in them"
	 * per file — the counts and the remove ✕ are the whole point of that card,
	 * and a family arriving from Google Calendar has more than one calendar to
	 * bring across.
	 */
	it('previews several files in one pass, keeping each row on its own file', async () => {
		const deps = makeDeps();

		const preview = previewOf(
			await callPreview(
				previewFilesEvent([
					{ name: 'kids-activities.ics', body: ics(SOCCER) },
					{ name: 'work.ics', body: ics(CHOIR) }
				]),
				deps
			)
		);

		expect(preview.items.map((i) => [i.fileName, i.title])).toEqual([
			['kids-activities.ics', 'Soccer practice'],
			['work.ics', 'Choir']
		]);
		expect(preview.files).toEqual([
			{ fileName: 'kids-activities.ics', events: 1, duplicates: 0 },
			{ fileName: 'work.ics', events: 1, duplicates: 0 }
		]);
		expect(preview.fileName).toBe('2 files');
	});

	it('counts duplicates per file, so one bad export is visible on its own', async () => {
		const deps = makeDeps({
			listExistingKeys: vi.fn(async () => ['soccer practice|2026-09-29T14:00:00.000Z'])
		});

		const preview = previewOf(
			await callPreview(
				previewFilesEvent([
					{ name: 'kids-activities.ics', body: ics(SOCCER) },
					{ name: 'work.ics', body: ics(CHOIR) }
				]),
				deps
			)
		);

		expect(preview.files[0]).toEqual({
			fileName: 'kids-activities.ics',
			events: 1,
			duplicates: 1
		});
		expect(preview.files[1]).toEqual({ fileName: 'work.ics', events: 1, duplicates: 0 });
	});

	it('flags a repeat that spans two files, unticked', async () => {
		const deps = makeDeps();

		const preview = previewOf(
			await callPreview(
				previewFilesEvent([
					{ name: 'kids-activities.ics', body: ics(SOCCER) },
					{ name: 'school.ics', body: ics(SOCCER) }
				]),
				deps
			)
		);

		expect(preview.items[1].duplicateReason).toBe('earlier-in-import');
		expect(preview.defaultSelection).toEqual(['e0']);
	});

	it('bounds how many files one request may carry', async () => {
		const deps = makeDeps();
		const many = Array.from({ length: 11 }, (_, i) => ({
			name: `cal-${i}.ics`,
			body: ics(SOCCER)
		}));

		const failure = failureOf(await callPreview(previewFilesEvent(many), deps));

		expect(failure.status).toBe(400);
		expect(failure.data.error).toMatch(/10 files/i);
		expect(deps.createEvent).not.toHaveBeenCalled();
	});

	it('explains an empty parse instead of failing flat', async () => {
		const deps = makeDeps({ parseIcs: () => [] });

		const failure = failureOf(await callPreview(previewEvent(ics('BEGIN:VTIMEZONE')), deps));

		expect(failure.status).toBe(400);
		expect(failure.data.error).toMatch(/no events/i);
		expect(failure.data.error).toMatch(/\.ics/i);
		expect(deps.createEvent).not.toHaveBeenCalled();
	});

	it('refuses a calendar the viewer does not own', async () => {
		const deps = makeDeps({ calendarIsOwned: vi.fn(async () => false) });

		const failure = failureOf(await callPreview(previewEvent(ics(SOCCER)), deps));

		expect(failure.status).toBe(403);
		expect(deps.createEvent).not.toHaveBeenCalled();
	});

	it('refuses an upload with no file', async () => {
		const deps = makeDeps();
		const form = new FormData();
		form.set('calendarId', 'cal-1');

		const failure = failureOf(
			await callPreview(
				{ request: { formData: async () => form }, locals: { user: { id: 'u' } } },
				deps
			)
		);

		expect(failure.status).toBe(400);
	});

	it('refuses a file over the size cap before parsing it', async () => {
		const parseSpy = vi.fn(() => []);
		const deps = makeDeps({ parseIcs: parseSpy });
		const form = new FormData();
		form.set('calendarId', 'cal-1');
		form.set('file', new File([new Uint8Array(6 * 1024 * 1024)], 'big.ics'));

		const failure = failureOf(
			await callPreview(
				{ request: { formData: async () => form }, locals: { user: { id: 'u' } } },
				deps
			)
		);

		expect(failure.status).toBe(400);
		expect(parseSpy).not.toHaveBeenCalled();
	});

	it('requires a signed-in viewer', async () => {
		const deps = makeDeps();

		const failure = failureOf(await callPreview(previewEvent(ics(SOCCER), null), deps));

		expect(failure.status).toBe(401);
	});
});

describe('POST /calendar/import ?/commit', () => {
	it('writes exactly the ticked events and reports what landed', async () => {
		const deps = makeDeps();

		const report = commitOf(
			await callCommit(commitEvent([row('Soccer practice', '2026-09-29T14:00:00.000Z')]), deps)
		);

		expect(report.imported).toBe(1);
		expect(report.selected).toBe(1);
		expect(report.skipped).toBe(0);
		expect(report.skippedDuplicates).toBe(0);
		expect(report.failed).toEqual([]);
		expect(deps.createEvent).toHaveBeenCalledTimes(1);
	});

	it('maps a ticked row onto the event columns, dropping preview-only fields', async () => {
		const deps = makeDeps();

		await callCommit(
			commitEvent([
				row('Choir', '2026-12-25T00:00:00.000Z', {
					allDay: true,
					location: 'Chapel',
					description: 'Bring hymnals',
					recurrenceFrequency: 'weekly',
					recurrenceInterval: 2,
					recurrenceByDay: ['MO', 'WE'],
					recurrenceCount: 10
				})
			]),
			deps
		);

		expect(deps.createEvent).toHaveBeenCalledWith(
			{
				calendarId: 'cal-1',
				ownerId: 'user-1',
				title: 'Choir',
				start: '2026-12-25T00:00:00.000Z',
				end: null,
				allDay: true,
				location: 'Chapel',
				description: 'Bring hymnals',
				recurrenceFrequency: 'weekly',
				recurrenceInterval: 2,
				recurrenceByDay: ['MO', 'WE'],
				recurrenceCount: 10,
				recurrenceUntil: null,
				reminderMinutes: null
			},
			'user-1'
		);
	});

	it('reports a ticked-but-duplicate row as skipped, not imported', async () => {
		const deps = makeDeps({
			listExistingKeys: vi.fn(async () => ['soccer practice|2026-09-29T14:00:00.000Z'])
		});

		const report = commitOf(
			await callCommit(commitEvent([row('Soccer practice', '2026-09-29T14:00:00.000Z')]), deps)
		);

		expect(report.imported).toBe(0);
		expect(report.selected).toBe(1);
		expect(report.skipped).toBe(1);
		expect(report.skippedDuplicates).toBe(1);
		expect(deps.createEvent).not.toHaveBeenCalled();
	});

	it('honours a partial selection: ticked rows land, unticked ones are absent', async () => {
		const deps = makeDeps();

		const report = commitOf(
			await callCommit(
				commitEvent([
					row('One', '2026-09-29T14:00:00.000Z'),
					{ ...row('Two', '2026-09-30T09:00:00.000Z'), key: 'e1' }
				]),
				deps
			)
		);

		expect(report.imported).toBe(2);
		expect(deps.createEvent).toHaveBeenCalledTimes(2);
	});

	it('keeps going past a failed write and names the event that failed', async () => {
		const deps = makeDeps({
			// SAFETY: stubbed rows stand in for createEvent's nominal return; the
			// test asserts on the report, not the created event.
			createEvent: vi
				.fn()
				.mockRejectedValueOnce(new Error('db down'))
				.mockResolvedValue({ id: 'ev-2' } as never)
		});

		const report = commitOf(
			await callCommit(commitEvent([row('Soccer practice', '2026-09-29T14:00:00.000Z')]), deps)
		);

		expect(report.imported).toBe(0);
		expect(report.selected).toBe(1);
		expect(report.skipped).toBe(1);
		expect(report.failed).toEqual(['Soccer practice']);
	});

	it('refuses a commit with nothing ticked', async () => {
		const deps = makeDeps();

		const failure = failureOf(await callCommit(commitRawEvent('[]'), deps));

		expect(failure.status).toBe(400);
		expect(deps.createEvent).not.toHaveBeenCalled();
	});

	it('refuses a malformed selection rather than half-importing it', async () => {
		const deps = makeDeps();

		const failure = failureOf(await callCommit(commitRawEvent('not json'), deps));

		expect(failure.status).toBe(400);
		expect(deps.createEvent).not.toHaveBeenCalled();
	});

	it('refuses a calendar the viewer does not own', async () => {
		const deps = makeDeps({ calendarIsOwned: vi.fn(async () => false) });

		const failure = failureOf(
			await callCommit(commitEvent([row('Soccer practice', '2026-09-29T14:00:00.000Z')]), deps)
		);

		expect(failure.status).toBe(403);
		expect(deps.createEvent).not.toHaveBeenCalled();
	});

	it('requires a signed-in viewer', async () => {
		const deps = makeDeps();

		const failure = failureOf(
			await callCommit(
				commitEvent([row('Soccer practice', '2026-09-29T14:00:00.000Z')], null),
				deps
			)
		);

		expect(failure.status).toBe(401);
	});

	it('hands back the rows it wrote, so an undo can name them without a batch id', async () => {
		// SAFETY: createEvent returns a whole CalendarEvent row; these stubs
		// supply only the `id` the commit reads, and the test asserts on the
		// report rather than on the row.
		const createEvent = vi
			.fn()
			.mockResolvedValueOnce({ id: 'ev-1' })
			.mockResolvedValueOnce({ id: 'ev-2' }) as unknown as ImportDeps['createEvent'];
		const deps = makeDeps({ createEvent });

		const report = commitOf(
			await callCommit(
				commitEvent([
					row('Soccer practice', '2026-09-29T14:00:00.000Z'),
					{ ...row('Choir', '2026-12-25T00:00:00.000Z'), key: 'e1' }
				]),
				deps
			)
		);

		expect(report.importedEvents).toEqual([
			{ id: 'ev-1', title: 'Soccer practice', startIso: '2026-09-29T14:00:00.000Z' },
			{ id: 'ev-2', title: 'Choir', startIso: '2026-12-25T00:00:00.000Z' }
		]);
	});

	it('does not claim a row it failed to write as undoable', async () => {
		const deps = makeDeps({
			// SAFETY: stubbed rows stand in for createEvent's nominal return; the
			// test asserts on the report, not the created event.
			createEvent: vi
				.fn()
				.mockRejectedValueOnce(new Error('db down'))
				.mockResolvedValue({ id: 'ev-2' } as never)
		});

		const report = commitOf(
			await callCommit(
				commitEvent([
					row('Soccer practice', '2026-09-29T14:00:00.000Z'),
					{ ...row('Choir', '2026-12-25T00:00:00.000Z'), key: 'e1' }
				]),
				deps
			)
		);

		expect(report.importedEvents).toEqual([
			{ id: 'ev-2', title: 'Choir', startIso: '2026-12-25T00:00:00.000Z' }
		]);
	});
});

/* ── undo (issue 126) ─────────────────────────────────────────────────── */

/** A commit's written batch, exactly as the success screen posts it back. */
function batchOf(...refs: ImportedEventRef[]) {
	return refs;
}

/** An undo request carrying the batch the commit handed the page. */
function undoEvent(batch: ImportedEventRef[], user: { id: string } | null = { id: 'user-1' }) {
	const form = new FormData();
	form.set('calendarId', 'cal-1');
	form.set('batch', JSON.stringify(batch));
	return { request: { formData: async () => form }, locals: { user } };
}

/** An undo request whose `batch` field is raw text, for the malformed cases. */
function undoRawEvent(body: string) {
	const form = new FormData();
	form.set('calendarId', 'cal-1');
	form.set('batch', body);
	return { request: { formData: async () => form }, locals: { user: { id: 'user-1' } } };
}

interface UndoReport {
	calendarName: string;
	removed: number;
	kept: { id: string; title: string }[];
	alreadyGone: number;
}

function undoOf(result: RequestResult): UndoReport {
	// SAFETY: the happy path returns the undo report directly; fail() branches
	// are asserted separately through failureOf.
	return result as unknown as UndoReport;
}

const BATCH = batchOf(
	{ id: 'ev-1', title: 'Soccer practice', startIso: '2026-09-29T14:00:00.000Z' },
	{ id: 'ev-2', title: 'Choir', startIso: '2026-12-25T00:00:00.000Z' }
);

describe('POST /calendar/import ?/undo', () => {
	it('removes exactly the batch rows still unchanged, scoped to the target calendar', async () => {
		const deps = makeDeps({
			loadUndoCandidates: vi.fn(async (): Promise<UndoCandidate[]> => [
				{ id: 'ev-1', title: 'Soccer practice', startIso: '2026-09-29T14:00:00.000Z' },
				{ id: 'ev-2', title: 'Choir', startIso: '2026-12-25T00:00:00.000Z' }
			]),
			deleteImportedEvents: vi.fn(async () => 2)
		});

		const report = undoOf(await callUndo(undoEvent(BATCH), deps));

		expect(report.removed).toBe(2);
		expect(report.kept).toEqual([]);
		expect(deps.deleteImportedEvents).toHaveBeenCalledWith(['ev-1', 'ev-2'], 'user-1', 'cal-1');
	});

	it('keeps and names a row the user edited since the import', async () => {
		const deps = makeDeps({
			loadUndoCandidates: vi.fn(async (): Promise<UndoCandidate[]> => [
				{ id: 'ev-1', title: 'Soccer practice', startIso: '2026-09-29T14:00:00.000Z' },
				{ id: 'ev-2', title: 'Choir rehearsal', startIso: '2026-12-25T00:00:00.000Z' }
			]),
			deleteImportedEvents: vi.fn(async () => 1)
		});

		const report = undoOf(await callUndo(undoEvent(BATCH), deps));

		expect(report.removed).toBe(1);
		expect(report.kept).toEqual([{ id: 'ev-2', title: 'Choir rehearsal' }]);
		expect(deps.deleteImportedEvents).toHaveBeenCalledWith(['ev-1'], 'user-1', 'cal-1');
	});

	it('reports rows that are already gone instead of claiming to remove them', async () => {
		const deps = makeDeps({
			loadUndoCandidates: vi.fn(async (): Promise<UndoCandidate[]> => []),
			deleteImportedEvents: vi.fn(async () => 0)
		});

		const report = undoOf(await callUndo(undoEvent(BATCH), deps));

		expect(report.removed).toBe(0);
		expect(report.alreadyGone).toBe(2);
		expect(deps.deleteImportedEvents).not.toHaveBeenCalled();
	});

	it('never asks to delete a row the viewer did not write on that calendar', async () => {
		// The deps are scoped by (ids, ownerId, calendarId); an id belonging to
		// somebody else simply does not come back as a candidate.
		const deps = makeDeps({
			loadUndoCandidates: vi.fn(
				async (ids: string[], userId: string, calendarId: string): Promise<UndoCandidate[]> => {
					expect(userId).toBe('user-1');
					expect(calendarId).toBe('cal-1');
					return ids.includes('ev-1')
						? [{ id: 'ev-1', title: 'Soccer practice', startIso: '2026-09-29T14:00:00.000Z' }]
						: [];
				}
			),
			deleteImportedEvents: vi.fn(async () => 1)
		});

		const report = undoOf(await callUndo(undoEvent(BATCH), deps));

		expect(report.removed).toBe(1);
		expect(report.alreadyGone).toBe(1);
		expect(deps.deleteImportedEvents).toHaveBeenCalledWith(['ev-1'], 'user-1', 'cal-1');
	});

	it('refuses a calendar the viewer does not own, and deletes nothing', async () => {
		const deps = makeDeps({ calendarIsOwned: vi.fn(async () => false) });

		const failure = failureOf(await callUndo(undoEvent(BATCH), deps));

		expect(failure.status).toBe(403);
		expect(deps.deleteImportedEvents).not.toHaveBeenCalled();
	});

	it('rejects a malformed batch rather than half-undoing it', async () => {
		const deps = makeDeps();

		expect(failureOf(await callUndo(undoRawEvent('not json'), deps)).status).toBe(400);
		expect(failureOf(await callUndo(undoRawEvent('[]'), deps)).status).toBe(400);
		expect(deps.deleteImportedEvents).not.toHaveBeenCalled();
	});

	it('requires a signed-in viewer', async () => {
		const deps = makeDeps();

		const failure = failureOf(await callUndo(undoEvent(BATCH, null), deps));

		expect(failure.status).toBe(401);
		expect(deps.deleteImportedEvents).not.toHaveBeenCalled();
	});
});
