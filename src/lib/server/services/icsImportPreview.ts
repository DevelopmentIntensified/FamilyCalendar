import { DateTime } from 'luxon';
import type { IcsEventDraft, IcsFrequency } from './icsImportService';

/** Mirror of the parser's cap — a commit request is bounded too. */
export const MAX_IMPORT_EVENTS = 500;

/** How a preview row came to be flagged as a likely duplicate. */
export type DuplicateReason = 'already-on-calendar' | 'earlier-in-file' | 'earlier-in-import';

/** One row of the import preview: the draft plus what the user needs to judge it. */
export interface ImportPreviewItem extends IcsEventDraft {
	/** Stable id within one parse — the row's position across every file. */
	key: string;
	/** The file this row was parsed out of. `''` for a preview of unnamed drafts. */
	fileName: string;
	/** Human "when", recurrence in words rather than a raw RRULE. */
	whenText: string;
	/** A likely duplicate by the existing title + exact start key. */
	duplicate: boolean;
	duplicateReason: DuplicateReason | null;
}

/** One file handed to the preview, and the drafts it produced. */
export interface ImportSource {
	fileName: string;
	drafts: IcsEventDraft[];
}

/**
 * What one file contributed — `import.html` answers "what is in them" per file,
 * so a family importing three exports can see which one is all duplicates.
 */
export interface PreviewFileSummary {
	fileName: string;
	/** Rows this file contributed to the preview (0 once the cap is reached). */
	events: number;
	duplicates: number;
}

export interface ImportPreview {
	items: ImportPreviewItem[];
	duplicates: number;
	/** One row per file, in the order the files were given. */
	files: PreviewFileSummary[];
}

const WEEKDAY_NAMES: ReadonlyMap<string, string> = new Map([
	['MO', 'Mon'],
	['TU', 'Tue'],
	['WE', 'Wed'],
	['TH', 'Thu'],
	['FR', 'Fri'],
	['SA', 'Sat'],
	['SU', 'Sun']
]);

const FREQ_WORDS: ReadonlyMap<IcsFrequency, [unit: string, plural: string]> = new Map([
	['daily', ['day', 'days']],
	['weekly', ['week', 'weeks']],
	['monthly', ['month', 'months']],
	['yearly', ['year', 'years']]
]);

/**
 * The dedupe key the import has always used: lowercased title + exact start.
 * Kept in one place so the preview and the commit can never disagree.
 */
export function dedupeKey(title: string, startIso: string): string {
	return `${title.trim().toLowerCase()}|${startIso}`;
}

/** "every week on Mon, Wed, Fri", "every 3 months", or null when not recurring. */
export function describeRecurrence(draft: IcsEventDraft, zone = 'utc'): string | null {
	const freq = draft.recurrenceFrequency;
	if (!freq) return null;
	const words = FREQ_WORDS.get(freq);
	if (!words) return null;

	const n = Math.max(1, draft.recurrenceInterval ?? 1);
	const [unit, plural] = words;
	const lead = n === 1 ? `every ${unit}` : `every ${n} ${plural}`;

	const days = (draft.recurrenceByDay ?? [])
		.map((code) => WEEKDAY_NAMES.get(code.toUpperCase()))
		.filter((name): name is string => name !== undefined);
	const onDays = days.length > 0 ? ` on ${days.join(', ')}` : '';

	const count = draft.recurrenceCount;
	const until = draft.recurrenceUntil ? DateTime.fromISO(draft.recurrenceUntil, { zone }) : null;

	let tail = '';
	if (count !== null && count > 0) tail = ` for ${count} ${count === 1 ? unit : plural}`;
	else if (until?.isValid) tail = ` until ${until.toFormat('ccc, LLL d, yyyy')}`;

	return `${lead}${onDays}${tail}`;
}

/** "Tue, Sep 29, 2026 · 2:00 PM–3:30 PM · every week on Mon" */
export function describeWhen(draft: IcsEventDraft, zone = 'utc'): string {
	const start = DateTime.fromISO(draft.startIso, { zone });
	if (!start.isValid) return 'Unknown date';

	const day = start.toFormat('ccc, LLL d, yyyy');
	const head = draft.allDay ? `${day} · all day` : `${day} · ${start.toFormat('h:mm a')}`;

	let text = head;
	const end = draft.endIso ? DateTime.fromISO(draft.endIso, { zone }) : null;
	if (!draft.allDay && end?.isValid) {
		text += end.hasSame(start, 'day')
			? `–${end.toFormat('h:mm a')}`
			: ` – ${end.toFormat('ccc, LLL d, yyyy · h:mm a')}`;
	}

	const recurrence = describeRecurrence(draft, zone);
	return recurrence ? `${text} · ${recurrence}` : text;
}

/**
 * Turn parsed drafts into the preview list. Nothing is written: rows are only
 * described and flagged, so the user decides what happens next.
 *
 * `existingKeys` are the dedupe keys already on the target calendar. A row
 * repeating an earlier row in the same import is flagged too — importing it
 * would double the calendar just as surely. One file is the degenerate case.
 */
export function buildPreview(
	drafts: IcsEventDraft[],
	existingKeys: ReadonlySet<string>,
	zone = 'utc'
): ImportPreview {
	return buildFilePreview([{ fileName: '', drafts }], existingKeys, zone);
}

/**
 * The same preview for several files at once, which is what `import.html`
 * draws: rows keep the file they were parsed out of, keys run on across every
 * file, and the dedupe pass sees all of them — a repeat in the *second* file
 * doubles the calendar exactly as surely as one in the first.
 *
 * The merged list is still capped at `MAX_IMPORT_EVENTS` in total, and a file
 * that arrives past the cap contributes nothing rather than being counted as
 * though it had been described.
 */
export function buildFilePreview(
	sources: readonly ImportSource[],
	existingKeys: ReadonlySet<string>,
	zone = 'utc'
): ImportPreview {
	const seenInImport = new Set<string>();
	const items: ImportPreviewItem[] = [];
	const files: PreviewFileSummary[] = [];

	for (const source of sources) {
		const remaining = Math.max(0, MAX_IMPORT_EVENTS - items.length);
		const own: ImportPreviewItem[] = [];
		for (const draft of source.drafts.slice(0, remaining)) {
			const key = dedupeKey(draft.title, draft.startIso);
			let duplicateReason: DuplicateReason | null = null;
			if (existingKeys.has(key)) duplicateReason = 'already-on-calendar';
			else if (seenInImport.has(key)) {
				// Same file reads as a repeated line; a second file repeats an
				// export the user already chose to import.
				duplicateReason = own.some((i) => dedupeKey(i.title, i.startIso) === key)
					? 'earlier-in-file'
					: 'earlier-in-import';
			}
			seenInImport.add(key);
			own.push({
				...draft,
				key: `e${items.length + own.length}`,
				fileName: source.fileName,
				whenText: describeWhen(draft, zone),
				duplicate: duplicateReason !== null,
				duplicateReason
			});
		}
		items.push(...own);
		files.push({
			fileName: source.fileName,
			events: own.length,
			duplicates: own.filter((i) => i.duplicate).length
		});
	}

	return { items, duplicates: items.filter((i) => i.duplicate).length, files };
}

/** The rows ticked when the preview opens: everything that is not a duplicate. */
export function defaultSelection(items: readonly ImportPreviewItem[]): Set<string> {
	return new Set(items.filter((i) => !i.duplicate).map((i) => i.key));
}

export interface CommitPlan {
	toWrite: IcsEventDraft[];
	/** Ticked rows that were dropped because the target calendar already has them. */
	skippedDuplicates: number;
}

/**
 * What a commit should actually write, given only the ticked rows. Dedupe runs
 * again here on purpose: between preview and commit the calendar can change, and
 * a re-check costs a read while a doubled calendar costs the user.
 */
export function planCommit(
	selected: readonly IcsEventDraft[],
	existingKeys: ReadonlySet<string>
): CommitPlan {
	const seen = new Set<string>();
	const toWrite: IcsEventDraft[] = [];
	let skippedDuplicates = 0;
	for (const draft of selected) {
		const key = dedupeKey(draft.title, draft.startIso);
		if (existingKeys.has(key) || seen.has(key)) {
			skippedDuplicates++;
			continue;
		}
		seen.add(key);
		toWrite.push(draft);
	}
	return { toWrite, skippedDuplicates };
}

/**
 * What a commit wrote, handed to the success screen so an undo can name it.
 * Deliberately small: an id plus the two fields that say whether the row is
 * still exactly what the import put there. There is no import-batch id on the
 * events table, so the batch is carried by the client, not the database.
 */
export interface ImportedEventRef {
	id: string;
	title: string;
	startIso: string;
}

/** The row as the database still has it when undo arrives. */
export type UndoCandidate = ImportedEventRef;

/** One batch row the user has since edited — undo leaves these alone. */
export interface ChangedEvent {
	id: string;
	title: string;
}

export interface UndoPlan {
	/** Ids to delete: still exactly what this import wrote. */
	remove: string[];
	/** Rows that exist but no longer match the import — kept, and named. */
	changed: ChangedEvent[];
	/** Rows already gone; nothing to do about them. */
	missing: string[];
}

/**
 * Decide what an undo may remove. A batch row is removed only when the stored
 * row still carries the same title and start the import wrote — the events
 * table has no updated_at and no batch id, so "did the user edit this since?"
 * is answered by comparing what they are about to delete against what we wrote.
 * Anything edited, and anything already gone, is reported rather than deleted.
 */
export function planUndo(
	batch: readonly ImportedEventRef[],
	live: readonly UndoCandidate[]
): UndoPlan {
	const liveById = new Map(live.map((r) => [r.id, r]));
	const remove: string[] = [];
	const changed: ChangedEvent[] = [];
	const missing: string[] = [];
	const seen = new Set<string>();

	for (const ref of batch) {
		if (seen.has(ref.id)) continue;
		seen.add(ref.id);

		const row = liveById.get(ref.id);
		if (!row) {
			missing.push(ref.id);
			continue;
		}
		const unchanged =
			dedupeKey(row.title, row.startIso) === dedupeKey(ref.title, ref.startIso);
		if (unchanged) remove.push(ref.id);
		else changed.push({ id: row.id, title: row.title });
	}
	return { remove, changed, missing };
}

/* oxlint-disable anti-slop/no-unknown-parameters, anti-slop/no-runtime-typeof, anti-slop/no-unsafe-dictionary-type -- everything below IS the boundary parser: `coerceDrafts` takes a posted JSON payload, so `unknown` and runtime `typeof` are its contract, not a shortcut. */

/** A parsed ISO instant, or null when the value is absent or unusable. */
function isoOrNull(v: unknown): string | null | undefined {
	if (v === undefined || v === null) return null;
	if (typeof v !== 'string') return undefined;
	const dt = DateTime.fromISO(v, { zone: 'utc' });
	return dt.isValid ? dt.toISO() : undefined;
}

/** A trimmed string, or null when absent/blank. `undefined` means invalid. */
function textOrNull(v: unknown, max = 5000): string | null | undefined {
	if (v === undefined || v === null) return null;
	if (typeof v !== 'string') return undefined;
	const trimmed = v.trim();
	return trimmed === '' ? null : trimmed.slice(0, max);
}

/** Weekday codes, or null when absent. `undefined` means invalid. */
function weekdaysOrNull(v: unknown): string[] | null | undefined {
	if (v === undefined || v === null) return null;
	if (!Array.isArray(v)) return undefined;
	const codes: string[] = [];
	for (const entry of v) {
		if (typeof entry !== 'string') return undefined;
		const code = entry.toUpperCase();
		if (!WEEKDAY_NAMES.has(code)) return undefined;
		codes.push(code);
	}
	return codes.length > 0 ? codes : null;
}

/** An IcsFrequency, or null when absent. `undefined` means reject the batch. */
function frequencyOrNull(v: unknown): IcsFrequency | null | undefined {
	if (v === undefined || v === null) return null;
	if (typeof v !== 'string') return undefined;
	switch (v) {
		case 'daily':
		case 'weekly':
		case 'monthly':
		case 'yearly':
			return v;
		default:
			return undefined;
	}
}

/** A positive integer, or null when absent. `undefined` means invalid. */
function positiveIntOrNull(v: unknown): number | null | undefined {
	if (v === undefined || v === null) return null;
	if (typeof v !== 'number' || !Number.isFinite(v) || v < 1) return undefined;
	return Math.floor(v);
}

/** One posted row, parsed at the boundary. `undefined` means reject the batch. */
function coerceDraft(value: unknown): IcsEventDraft | undefined {
	if (value === null || typeof value !== 'object' || Array.isArray(value)) return undefined;
	// SAFETY: the guard above narrows `value` to a non-null, non-array object;
	// property reads below are therefore defined.
	const row = value as Record<string, unknown>;

	const title = textOrNull(row['title'], 200);
	if (!title) return undefined;

	const startIso = isoOrNull(row['startIso']);
	if (!startIso) return undefined;
	const endIso = isoOrNull(row['endIso']);
	if (endIso === undefined) return undefined;

	const allDay = row['allDay'];
	if (typeof allDay !== 'boolean') return undefined;

	const location = textOrNull(row['location']);
	if (location === undefined) return undefined;
	const description = textOrNull(row['description']);
	if (description === undefined) return undefined;

	const recurrenceFrequency = frequencyOrNull(row['recurrenceFrequency']);
	if (recurrenceFrequency === undefined) return undefined;

	const recurrenceInterval = positiveIntOrNull(row['recurrenceInterval']);
	if (recurrenceInterval === undefined) return undefined;
	const recurrenceByDay = weekdaysOrNull(row['recurrenceByDay']);
	if (recurrenceByDay === undefined) return undefined;
	const recurrenceCount = positiveIntOrNull(row['recurrenceCount']);
	if (recurrenceCount === undefined) return undefined;
	const recurrenceUntil = isoOrNull(row['recurrenceUntil']);
	if (recurrenceUntil === undefined) return undefined;

	return {
		title,
		startIso,
		endIso,
		allDay,
		location,
		description,
		recurrenceFrequency,
		recurrenceInterval,
		recurrenceByDay,
		recurrenceCount,
		recurrenceUntil
	};
}

/**
 * Parse the rows a commit request carries. The client posts the preview rows it
 * ticked; preview-only fields (key, whenText, duplicate) are dropped here so the
 * database gets exactly the draft the preview described. Anything malformed
 * rejects the whole batch rather than half-importing it.
 */
export function coerceDrafts(value: unknown): IcsEventDraft[] {
	if (!Array.isArray(value) || value.length === 0 || value.length > MAX_IMPORT_EVENTS) {
		return [];
	}
	const out: IcsEventDraft[] = [];
	for (const entry of value) {
		const draft = coerceDraft(entry);
		if (!draft) return [];
		out.push(draft);
	}
	return out;
}

/* oxlint-enable anti-slop/no-unknown-parameters, anti-slop/no-runtime-typeof, anti-slop/no-unsafe-dictionary-type */

/* oxlint-disable anti-slop/no-unknown-parameters, anti-slop/no-runtime-typeof, anti-slop/no-unsafe-dictionary-type -- same boundary parser as above: an undo request is posted JSON, so `unknown` and runtime `typeof` are its contract, not a shortcut. */

/** One posted undo row, parsed at the boundary. `undefined` means reject. */
function coerceUndoRef(value: unknown): ImportedEventRef | undefined {
	if (value === null || typeof value !== 'object' || Array.isArray(value)) return undefined;
	// SAFETY: the guard above narrows `value` to a non-null, non-array object;
	// property reads below are therefore defined.
	const row = value as Record<string, unknown>;

	const id = textOrNull(row['id'], 64);
	if (!id) return undefined;
	const title = textOrNull(row['title'], 200);
	if (!title) return undefined;
	const startIso = isoOrNull(row['startIso']);
	if (!startIso) return undefined;

	return { id, title, startIso };
}

/**
 * Parse the batch an undo request carries. Same rules as the commit it reverses:
 * bounded, all-or-nothing, and never wider than `MAX_IMPORT_EVENTS` rows.
 */
export function coerceUndoBatch(value: unknown): ImportedEventRef[] {
	if (!Array.isArray(value) || value.length === 0 || value.length > MAX_IMPORT_EVENTS) {
		return [];
	}
	const out: ImportedEventRef[] = [];
	for (const entry of value) {
		const ref = coerceUndoRef(entry);
		if (!ref) return [];
		out.push(ref);
	}
	return out;
}

/* oxlint-enable anti-slop/no-unknown-parameters, anti-slop/no-runtime-typeof, anti-slop/no-unsafe-dictionary-type */
