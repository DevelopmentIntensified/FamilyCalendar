import { describe, it, expect } from 'vitest';
import {
	buildPreview,
	coerceDrafts,
	dedupeKey,
	defaultSelection,
	describeRecurrence,
	describeWhen,
	MAX_IMPORT_EVENTS,
	planCommit,
	planUndo,
	coerceUndoBatch,
	type ImportPreviewItem,
	type ImportedEventRef,
	type UndoCandidate
} from './icsImportPreview';
import type { IcsEventDraft, IcsFrequency } from './icsImportService';

/** A minimal draft; every field spelled out so tests never drift on defaults. */
function draft(over: Partial<IcsEventDraft> = {}): IcsEventDraft {
	return {
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
		recurrenceUntil: null,
		...over
	};
}

/** Recurrence-only draft, for the table-driven recurrence suite. */
function recurring(
	frequency: IcsFrequency | null,
	over: Partial<IcsEventDraft> = {}
): IcsEventDraft {
	return draft({
		recurrenceFrequency: frequency,
		recurrenceInterval: frequency ? 1 : null,
		...over
	});
}

describe('dedupeKey', () => {
	it('is case- and whitespace-insensitive on the title, exact on the start', () => {
		expect(dedupeKey('  Soccer Practice ', '2026-09-29T14:00:00.000Z')).toBe(
			dedupeKey('soccer practice', '2026-09-29T14:00:00.000Z')
		);
		expect(dedupeKey('Soccer practice', '2026-09-29T14:00:00.000Z')).not.toBe(
			dedupeKey('Soccer practice', '2026-09-29T15:30:00.000Z')
		);
	});
});

describe('describeRecurrence', () => {
	const cases: Array<[string, IcsEventDraft, string | null]> = [
		['no rule is not a recurrence', draft(), null],
		['daily', recurring('daily'), 'every day'],
		['daily every 3rd', recurring('daily', { recurrenceInterval: 3 }), 'every 3 days'],
		['weekly plain', recurring('weekly'), 'every week'],
		[
			'weekly with weekdays',
			recurring('weekly', { recurrenceByDay: ['MO', 'WE', 'FR'] }),
			'every week on Mon, Wed, Fri'
		],
		[
			'biweekly with a weekday',
			recurring('weekly', { recurrenceInterval: 2, recurrenceByDay: ['MO'] }),
			'every 2 weeks on Mon'
		],
		[
			'a null interval reads as the default 1',
			recurring('monthly', { recurrenceInterval: null }),
			'every month'
		],
		['monthly', recurring('monthly'), 'every month'],
		['quarterly', recurring('monthly', { recurrenceInterval: 3 }), 'every 3 months'],
		['yearly', recurring('yearly'), 'every year'],
		['biennial', recurring('yearly', { recurrenceInterval: 2 }), 'every 2 years'],
		[
			'a count becomes a for-clause',
			recurring('weekly', { recurrenceCount: 10 }),
			'every week for 10 weeks'
		],
		[
			'a count after weekdays',
			recurring('weekly', { recurrenceByDay: ['MO', 'WE', 'FR'], recurrenceCount: 10 }),
			'every week on Mon, Wed, Fri for 10 weeks'
		],
		['a count on a daily rule', recurring('daily', { recurrenceCount: 5 }), 'every day for 5 days'],
		[
			'a count on a monthly rule',
			recurring('monthly', { recurrenceCount: 3 }),
			'every month for 3 months'
		],
		[
			'an until becomes a deadline',
			recurring('weekly', { recurrenceUntil: '2027-01-04T00:00:00.000Z' }),
			'every week until Mon, Jan 4, 2027'
		],
		[
			'an unparseable until is dropped, not shown raw',
			recurring('weekly', { recurrenceUntil: 'not-a-date' }),
			'every week'
		]
	];

	for (const [label, input, expected] of cases) {
		it(label, () => expect(describeRecurrence(input, 'utc')).toBe(expected));
	}
});

describe('describeWhen', () => {
	const cases: Array<[string, IcsEventDraft, string]> = [
		['a timed event with a same-day end', draft(), 'Tue, Sep 29, 2026 · 2:00 PM–3:30 PM'],
		['a timed event with no end', draft({ endIso: null }), 'Tue, Sep 29, 2026 · 2:00 PM'],
		[
			'an all-day event',
			draft({
				title: 'Christmas',
				startIso: '2026-12-25T00:00:00.000Z',
				endIso: '2026-12-25T23:59:59.999Z',
				allDay: true
			}),
			'Fri, Dec 25, 2026 · all day'
		],
		[
			'an event that runs past midnight',
			draft({ endIso: '2026-09-30T01:00:00.000Z' }),
			'Tue, Sep 29, 2026 · 2:00 PM – Wed, Sep 30, 2026 · 1:00 AM'
		],
		[
			'the recurrence is spelled out in words',
			recurring('weekly', { recurrenceByDay: ['MO', 'WE', 'FR'] }),
			'Tue, Sep 29, 2026 · 2:00 PM–3:30 PM · every week on Mon, Wed, Fri'
		],
		[
			'an unparseable start says so instead of showing NaN',
			draft({ startIso: 'garbage', endIso: null }),
			'Unknown date'
		]
	];

	for (const [label, input, expected] of cases) {
		it(label, () => expect(describeWhen(input, 'utc')).toBe(expected));
	}

	it('renders in the viewer zone, not UTC', () => {
		expect(describeWhen(draft(), 'America/New_York')).toBe('Tue, Sep 29, 2026 · 10:00 AM–11:30 AM');
	});
});

describe('buildPreview', () => {
	it('gives every row a stable key in file order', () => {
		const preview = buildPreview([draft({ title: 'One' }), draft({ title: 'Two' })], new Set());

		expect(preview.items.map((i) => i.key)).toEqual(['e0', 'e1']);
	});

	it('flags an event already on the target calendar', () => {
		const existing = new Set([dedupeKey('Soccer practice', '2026-09-29T14:00:00.000Z')]);

		const preview = buildPreview([draft()], existing);

		expect(preview.items[0].duplicate).toBe(true);
		expect(preview.items[0].duplicateReason).toBe('already-on-calendar');
		expect(preview.duplicates).toBe(1);
	});

	it('flags the second copy of a repeated row as an in-file duplicate', () => {
		const preview = buildPreview([draft({ title: 'Twice' }), draft({ title: 'twice' })], new Set());

		expect(preview.items[0].duplicate).toBe(false);
		expect(preview.items[0].duplicateReason).toBeNull();
		expect(preview.items[1].duplicate).toBe(true);
		expect(preview.items[1].duplicateReason).toBe('earlier-in-file');
	});

	it('leaves a clean file untouched', () => {
		const preview = buildPreview([draft()], new Set());

		expect(preview).toEqual({ items: preview.items, duplicates: 0 });
		expect(preview.items[0].duplicate).toBe(false);
	});

	it('never flags an event whose start merely looks close', () => {
		const existing = new Set([dedupeKey('Soccer practice', '2026-09-29T14:01:00.000Z')]);

		expect(buildPreview([draft()], existing).items[0].duplicate).toBe(false);
	});

	it('handles a file that parsed to nothing', () => {
		expect(buildPreview([], new Set())).toEqual({ items: [], duplicates: 0 });
	});
});

describe('defaultSelection', () => {
	it('ticks everything except the duplicates', () => {
		const preview = buildPreview(
			[draft({ title: 'Fresh' }), draft({ title: 'Stale' }), draft({ title: 'Fresh' })],
			new Set([dedupeKey('Stale', '2026-09-29T14:00:00.000Z')])
		);

		expect([...defaultSelection(preview.items)]).toEqual(['e0']);
	});

	it('ticks nothing when every row is a duplicate', () => {
		const preview = buildPreview([draft()], new Set([dedupeKey(draft().title, draft().startIso)]));

		expect([...defaultSelection(preview.items)]).toEqual([]);
	});
});

describe('planCommit', () => {
	it('writes exactly the ticked events and nothing else', () => {
		const picked = [draft({ title: 'One' }), draft({ title: 'Two' })];

		const plan = planCommit(picked, new Set());

		expect(plan.toWrite.map((d) => d.title)).toEqual(['One', 'Two']);
		expect(plan.skippedDuplicates).toBe(0);
	});

	it('re-checks the calendar at commit time and skips anything that landed meanwhile', () => {
		const picked = [draft({ title: 'Soccer practice' })];
		const now = new Set([dedupeKey('soccer practice', '2026-09-29T14:00:00.000Z')]);

		const plan = planCommit(picked, now);

		expect(plan.toWrite).toEqual([]);
		expect(plan.skippedDuplicates).toBe(1);
	});

	it('keeps the first of two identical ticked rows and skips the second', () => {
		const plan = planCommit([draft({ title: 'Same' }), draft({ title: 'same' })], new Set());

		expect(plan.toWrite).toHaveLength(1);
		expect(plan.skippedDuplicates).toBe(1);
	});

	it('plans nothing for an empty selection', () => {
		expect(planCommit([], new Set())).toEqual({ toWrite: [], skippedDuplicates: 0 });
	});
});

describe('coerceDrafts', () => {
	/** A preview row exactly as the client posts it back. */
	const valid: ImportPreviewItem = {
		key: 'e0',
		whenText: 'Tue, Sep 29, 2026 · 2:00 PM–3:30 PM · every week on Mon',
		duplicate: false,
		duplicateReason: null,
		title: 'Soccer practice',
		startIso: '2026-09-29T14:00:00.000Z',
		endIso: '2026-09-29T15:30:00.000Z',
		allDay: false,
		location: 'Riverside Park',
		description: 'Bring cleats',
		recurrenceFrequency: 'weekly',
		recurrenceInterval: 1,
		recurrenceByDay: ['MO'],
		recurrenceCount: 10,
		recurrenceUntil: null
	};

	/** `valid` less the four fields only the preview knows about. */
	const draftOnly: IcsEventDraft = {
		title: 'Soccer practice',
		startIso: '2026-09-29T14:00:00.000Z',
		endIso: '2026-09-29T15:30:00.000Z',
		allDay: false,
		location: 'Riverside Park',
		description: 'Bring cleats',
		recurrenceFrequency: 'weekly',
		recurrenceInterval: 1,
		recurrenceByDay: ['MO'],
		recurrenceCount: 10,
		recurrenceUntil: null
	};

	it('drops the preview-only fields so the commit writes what the preview showed', () => {
		expect(coerceDrafts([valid])).toEqual([draftOnly]);
	});

	it('rejects anything that is not an array', () => {
		expect(coerceDrafts({ title: 'nope' })).toEqual([]);
		expect(coerceDrafts(null)).toEqual([]);
		expect(coerceDrafts('[]')).toEqual([]);
	});

	it('rejects a payload over the import cap', () => {
		const tooMany = Array.from({ length: MAX_IMPORT_EVENTS + 1 }, (_, i) => ({
			...valid,
			title: `Event ${i}`
		}));

		expect(coerceDrafts(tooMany)).toEqual([]);
	});

	const rejects: Array<[string, unknown]> = [
		['a blank title', { ...valid, title: '   ' }],
		['a missing title', { ...valid, title: undefined }],
		['an unparseable start', { ...valid, startIso: 'garbage' }],
		['a non-ISO start', { ...valid, startIso: '29/09/2026' }],
		['an unknown frequency', { ...valid, recurrenceFrequency: 'fortnightly' }],
		['a non-numeric interval', { ...valid, recurrenceInterval: 'weekly' }],
		['a bad weekday code', { ...valid, recurrenceByDay: ['XX'] }],
		['a non-array byDay', { ...valid, recurrenceByDay: 'MO' }],
		['a numeric location', { ...valid, location: 42 }],
		['a non-string title', { ...valid, title: 7 }],
		['a non-boolean allDay', { ...valid, allDay: 'yes' }],
		['a null entry in the array', null]
	];

	for (const [label, bad] of rejects) {
		it(`rejects ${label} and drops the whole batch`, () => {
			expect(coerceDrafts([valid, bad])).toEqual([]);
		});
	}

	it('clamps an over-long title rather than dropping the event', () => {
		const [out] = coerceDrafts([{ ...valid, title: 'x'.repeat(500) }]);

		expect(out.title).toHaveLength(200);
	});

	it('normalises a blank location or description to null', () => {
		const [out] = coerceDrafts([{ ...valid, location: '  ', description: '' }]);

		expect(out.location).toBeNull();
		expect(out.description).toBeNull();
	});

	it('normalises a missing end to null', () => {
		const [out] = coerceDrafts([{ ...valid, endIso: undefined }]);

		expect(out.endIso).toBeNull();
	});
});

/* ── undo (issue 126) ────────────────────────────────────────────────── */

/** One row a commit wrote: what it was, and where it landed. */
function written(over: Partial<ImportedEventRef> = {}): ImportedEventRef {
	return {
		id: 'ev-1',
		title: 'Soccer practice',
		startIso: '2026-09-29T14:00:00.000Z',
		...over
	};
}

/** The row as the database still has it at undo time. */
function row(over: Partial<UndoCandidate> = {}): UndoCandidate {
	return { id: 'ev-1', title: 'Soccer practice', startIso: '2026-09-29T14:00:00.000Z', ...over };
}

describe('planUndo', () => {
	it('removes a row that still looks exactly like the import wrote it', () => {
		const plan = planUndo([written()], [row()]);

		expect(plan.remove).toEqual(['ev-1']);
		expect(plan.changed).toEqual([]);
		expect(plan.missing).toEqual([]);
	});

	it('keeps a row the user has edited since the import', () => {
		const plan = planUndo([written()], [row({ title: 'Soccer (moved indoors)' })]);

		expect(plan.remove).toEqual([]);
		expect(plan.changed.map((c) => c.title)).toEqual(['Soccer (moved indoors)']);
	});

	it('keeps a row whose start was moved', () => {
		const plan = planUndo([written()], [row({ startIso: '2026-09-29T16:00:00.000Z' })]);

		expect(plan.remove).toEqual([]);
		expect(plan.changed).toHaveLength(1);
	});

	it('reports a row that is already gone as missing, not as a change', () => {
		const plan = planUndo([written()], []);

		expect(plan.remove).toEqual([]);
		expect(plan.changed).toEqual([]);
		expect(plan.missing).toEqual(['ev-1']);
	});

	it('plans one verdict per batch row, across the whole batch', () => {
		const batch = [written(), written({ id: 'ev-2', title: 'Choir' }), written({ id: 'ev-3' })];
		const live = [row(), row({ id: 'ev-2', title: 'Choir rehearsal' })];

		const plan = planUndo(batch, live);

		expect(plan.remove).toEqual(['ev-1']);
		expect(plan.changed.map((c) => c.title)).toEqual(['Choir rehearsal']);
		expect(plan.missing).toEqual(['ev-3']);
	});

	it('never repeats an id — a doubled batch row cannot delete twice', () => {
		const plan = planUndo([written(), written()], [row()]);

		expect(plan.remove).toEqual(['ev-1']);
	});
});

describe('coerceUndoBatch', () => {
	it('reads the rows a commit handed the success screen', () => {
		expect(coerceUndoBatch([{ id: 'ev-1', title: 'Choir', startIso: '2026-12-25T00:00:00.000Z' }])).toEqual(
			[{ id: 'ev-1', title: 'Choir', startIso: '2026-12-25T00:00:00.000Z' }]
		);
	});

	it('is empty for anything that is not an array of rows', () => {
		expect(coerceUndoBatch(null)).toEqual([]);
		expect(coerceUndoBatch('ev-1')).toEqual([]);
		expect(coerceUndoBatch([])).toEqual([]);
	});

	it('rejects the whole batch when one row is malformed', () => {
		expect(coerceUndoBatch([{ id: 'ev-1', title: 'Choir', startIso: 'nope' }])).toEqual([]);
		expect(coerceUndoBatch([{ id: 'ev-1', title: '', startIso: '2026-12-25T00:00:00.000Z' }])).toEqual(
			[]
		);
	});

	it('is bounded like the commit it reverses', () => {
		const tooMany = Array.from({ length: MAX_IMPORT_EVENTS + 1 }, (_, i) => ({
			id: `ev-${i}`,
			title: 'Choir',
			startIso: '2026-12-25T00:00:00.000Z'
		}));

		expect(coerceUndoBatch(tooMany)).toEqual([]);
	});
});
