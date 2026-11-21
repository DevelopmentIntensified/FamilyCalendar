/**
 * The import plan, carried from `src/lib/server/services/icsImportPreview.ts:68-283`
 * and the frozen goldens (`calendar.import.http.db.test.ts:60-100` DRAFT +
 * whenText, `:155-230` the preview body + duplicate, `:851-966` the undo body).
 *
 * Doc: ./README.md#invariants
 */
import { describe, expect, it } from 'vitest';
import {
	buildFilePreview,
	buildPreview,
	dedupeKey,
	defaultSelection,
	describeWhen,
	DUPLICATE_REASONS,
	MAX_IMPORT_EVENTS,
	planCommit,
	planUndo
} from './calendar.import.rules';
import type { IcsEventDraft } from './calendar.ics.rules';

const DRAFT: IcsEventDraft = {
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

const draftAt = (index: number): IcsEventDraft => ({
	...DRAFT,
	title: `Event ${index}`,
	startIso: `2026-09-29T${String(index % 24).padStart(2, '0')}:00:00.000Z`
});

describe('dedupeKey / describeWhen (icsImportPreview.ts:68-127)', () => {
	it('builds the dedupe key from the trimmed lowercased title and the exact start', () => {
		expect(dedupeKey('  Soccer Practice ', '2026-09-29T14:00:00.000Z')).toBe(
			'soccer practice|2026-09-29T14:00:00.000Z'
		);
		expect(DUPLICATE_REASONS).toEqual([
			'already-on-calendar',
			'earlier-in-file',
			'earlier-in-import'
		]);
	});

	it.each([
		['a parsed row, exactly as the preview golden does', DRAFT, 'Tue, Sep 29, 2026 · 2:00 PM–3:30 PM'],
		['an all-day row', { ...DRAFT, allDay: true, endIso: null }, 'Tue, Sep 29, 2026 · all day'],
		[
			'a recurring row with its recurrence in words',
			{ ...DRAFT, recurrenceFrequency: 'weekly', recurrenceInterval: 1, recurrenceByDay: ['MO'] },
			'Tue, Sep 29, 2026 · 2:00 PM–3:30 PM · every week on Mon'
		],
		[
			'a count tail',
			{ ...DRAFT, recurrenceFrequency: 'daily', recurrenceCount: 3 },
			'Tue, Sep 29, 2026 · 2:00 PM–3:30 PM · every day for 3 days'
		],
		[
			'an end on a later day spells the end date',
			{ ...DRAFT, endIso: '2026-09-30T19:00:00.000Z' },
			'Tue, Sep 29, 2026 · 2:00 PM – Wed, Sep 30, 2026 · 7:00 PM'
		],
		['an unreadable start', { ...DRAFT, startIso: 'garbage' }, 'Unknown date']
	] satisfies [string, IcsEventDraft, string][])('describes %s', (_name, draft, expected) => {
		expect(describeWhen(draft)).toBe(expected);
	});
});

describe('buildPreview / buildFilePreview (icsImportPreview.ts:128-220)', () => {
	it('flags a row the calendar already holds and drops it from the default selection', () => {
		const preview = buildPreview([DRAFT], new Set([dedupeKey(DRAFT.title, DRAFT.startIso)]));
		expect(preview.items[0]).toMatchObject({
			key: 'e0',
			fileName: '',
			duplicate: true,
			duplicateReason: 'already-on-calendar'
		});
		expect([...defaultSelection(preview.items)]).toEqual([]);
		expect(preview.duplicates).toBe(1);
	});

	it('tells earlier-in-file from earlier-in-import across files', () => {
		const preview = buildFilePreview(
			[
				{ fileName: 'one.ics', drafts: [DRAFT, { ...DRAFT }] },
				{ fileName: 'two.ics', drafts: [DRAFT] }
			],
			new Set()
		);
		expect(preview.items.map((item) => item.duplicateReason)).toEqual([
			null,
			'earlier-in-file',
			'earlier-in-import'
		]);
		expect([...defaultSelection(preview.items)]).toEqual(['e0']);
		expect(preview.files).toEqual([
			{ fileName: 'one.ics', events: 2, duplicates: 1 },
			{ fileName: 'two.ics', events: 1, duplicates: 1 }
		]);
	});

	it('caps the merged preview at 500 rows and stops describing past the cap', () => {
		expect(MAX_IMPORT_EVENTS).toBe(500);
		const preview = buildFilePreview(
			[
				{ fileName: 'one.ics', drafts: Array.from({ length: 400 }, (_, index) => draftAt(index)) },
				{ fileName: 'two.ics', drafts: Array.from({ length: 300 }, (_, index) => draftAt(index + 400)) }
			],
			new Set()
		);
		expect(preview.items).toHaveLength(500);
		expect(preview.files).toEqual([
			{ fileName: 'one.ics', events: 400, duplicates: 0 },
			{ fileName: 'two.ics', events: 100, duplicates: 0 }
		]);
	});
});

describe('planCommit (icsImportPreview.ts:222-260)', () => {
	it('re-checks dedupe at commit time and counts what it skipped', () => {
		expect(planCommit([DRAFT], new Set([dedupeKey(DRAFT.title, DRAFT.startIso)]))).toEqual({
			toWrite: [],
			skippedDuplicates: 1
		});
		expect(planCommit([DRAFT], new Set())).toEqual({ toWrite: [DRAFT], skippedDuplicates: 0 });
	});

	it('writes a row once when the ticked selection repeats it', () => {
		expect(planCommit([DRAFT, { ...DRAFT }], new Set())).toEqual({
			toWrite: [DRAFT],
			skippedDuplicates: 1
		});
	});
});

describe('planUndo (icsImportPreview.ts:262-283)', () => {
	it('removes unchanged rows, keeps edited ones and names missing ones', () => {
		const batch = [
			{ id: 'evtunchanged', title: 'Soccer practice', startIso: '2026-09-29T14:00:00.000Z' },
			{ id: 'evtedited001', title: 'Soccer practice', startIso: '2026-09-29T14:00:00.000Z' },
			{ id: 'evtmissing001', title: 'Gone', startIso: '2026-09-29T14:00:00.000Z' }
		];
		const plan = planUndo(batch, [
			{ id: 'evtunchanged', title: 'Soccer practice', startIso: '2026-09-29T14:00:00.000Z' },
			{ id: 'evtedited001', title: 'Soccer practice (moved)', startIso: '2026-09-29T14:00:00.000Z' }
		]);
		expect(plan).toEqual({
			remove: ['evtunchanged'],
			changed: [{ id: 'evtedited001', title: 'Soccer practice (moved)' }],
			missing: ['evtmissing001']
		});
	});

	it('never counts the same batch id twice', () => {
		const ref = { id: 'evtunchanged', title: 'Soccer practice', startIso: '2026-09-29T14:00:00.000Z' };
		expect(planUndo([ref, ref], [ref])).toEqual({
			remove: ['evtunchanged'],
			changed: [],
			missing: []
		});
	});
});
