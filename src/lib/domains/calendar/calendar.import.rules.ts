/**
 * The import plan: dedupe keys, the human "when" text, the per-file preview,
 * the default selection, and the commit/undo plans. Ported from
 * `icsImportPreview.ts`; no database, no FormData — the service supplies the
 * keys the calendar already holds and the rows an undo may touch.
 *
 * Import is parse (no write) → preview → commit (+ undo). The preview and the
 * commit share ONE dedupe key, so they cannot disagree about what is a
 * duplicate.
 *
 * Doc: ./README.md#invariants
 */
import { DateTime } from 'luxon';
import { describeRecurrence } from './calendar.recurrence.rules';
import type { IcsEventDraft } from './calendar.ics.rules';

/** Mirror of the parser's cap: a commit/undo batch is bounded too. */
export const MAX_IMPORT_EVENTS = 500;

/** How a preview row came to be flagged as a likely duplicate. */
export type DuplicateReason = 'already-on-calendar' | 'earlier-in-file' | 'earlier-in-import';

/** The closed duplicate vocabulary, in the page's reading order. */
export const DUPLICATE_REASONS = [
	'already-on-calendar',
	'earlier-in-file',
	'earlier-in-import'
] as const;

/** One row of the import preview: the draft plus what the user needs to judge it. */
export interface ImportPreviewItem extends IcsEventDraft {
	/** Stable id within one parse — the row's position across every file. */
	readonly key: string;
	/** The file this row was parsed out of. `''` for a preview of unnamed drafts. */
	readonly fileName: string;
	/** Human "when", with the recurrence in words rather than a raw RRULE. */
	readonly whenText: string;
	readonly duplicate: boolean;
	readonly duplicateReason: DuplicateReason | null;
}

/** One file handed to the preview, and the drafts it produced. */
export interface ImportSource {
	readonly fileName: string;
	readonly drafts: readonly IcsEventDraft[];
}

/** What one file contributed, so a multi-file import can be judged per file. */
export interface PreviewFileSummary {
	readonly fileName: string;
	readonly events: number;
	readonly duplicates: number;
}

export interface ImportPreview {
	readonly items: ImportPreviewItem[];
	readonly duplicates: number;
	readonly files: PreviewFileSummary[];
}

/**
 * The dedupe key the import has always used: lowercased trimmed title, a
 * literal pipe, and the exact start ISO. One place so preview and commit agree.
 */
export function dedupeKey(title: string, startIso: string): string {
	return `${title.trim().toLowerCase()}|${startIso}`;
}

/** `"Tue, Sep 29, 2026 · 2:00 PM–3:30 PM · every week on Mon"`. */
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

	const recurrence = describeRecurrence(
		{
			recurrenceFrequency: draft.recurrenceFrequency,
			recurrenceInterval: draft.recurrenceInterval,
			recurrenceByDay: draft.recurrenceByDay,
			recurrenceCount: draft.recurrenceCount,
			recurrenceUntil: draft.recurrenceUntil
		},
		zone
	);
	return recurrence ? `${text} · ${recurrence}` : text;
}

/**
 * Turn parsed drafts into the preview list; nothing is written. `existingKeys`
 * are the dedupe keys already on the target calendar. A row repeating an
 * earlier row in the same import is flagged too — importing it would double the
 * calendar just as surely.
 */
export function buildPreview(
	drafts: readonly IcsEventDraft[],
	existingKeys: ReadonlySet<string>,
	zone = 'utc'
): ImportPreview {
	return buildFilePreview([{ fileName: '', drafts }], existingKeys, zone);
}

/**
 * The same preview for several files: rows keep their file, keys run on across
 * every file, and the dedupe pass sees all of them. The merged list is capped
 * at MAX_IMPORT_EVENTS, and a file past the cap contributes nothing rather
 * than being counted as though it had been described.
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
			if (existingKeys.has(key)) {
				duplicateReason = 'already-on-calendar';
			} else if (seenInImport.has(key)) {
				// Same file reads as a repeated line; a second file repeats an
				// export the user already chose to import.
				duplicateReason = own.some((item) => dedupeKey(item.title, item.startIso) === key)
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
			duplicates: own.filter((item) => item.duplicate).length
		});
	}

	return { items, duplicates: items.filter((item) => item.duplicate).length, files };
}

/** The rows ticked when the preview opens: everything that is not a duplicate. */
export function defaultSelection(items: readonly ImportPreviewItem[]): Set<string> {
	return new Set(items.filter((item) => !item.duplicate).map((item) => item.key));
}

export interface CommitPlan {
	readonly toWrite: IcsEventDraft[];
	/** Ticked rows dropped because the target calendar already has them. */
	readonly skippedDuplicates: number;
}

/**
 * What a commit should write, given only the ticked rows. Dedupe runs again on
 * purpose: between preview and commit the calendar can change, and a re-check
 * costs a read while a doubled calendar costs the user.
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
 * There is no import-batch id on the events table, so the batch is carried by
 * the client: an id plus the title and start that say whether the row is still
 * exactly what the import put there.
 */
export interface ImportedEventRef {
	readonly id: string;
	readonly title: string;
	readonly startIso: string;
}

/** The row as the database still has it when undo arrives. */
export type UndoCandidate = ImportedEventRef;

/** One batch row the user has since edited — undo leaves these alone. */
export interface ChangedEvent {
	readonly id: string;
	readonly title: string;
}

export interface UndoPlan {
	/** Ids to delete: still exactly what this import wrote. */
	readonly remove: string[];
	/** Rows that exist but no longer match the import — kept and named. */
	readonly changed: ChangedEvent[];
	/** Rows already gone; nothing to do about them. */
	readonly missing: string[];
}

/**
 * Decide what an undo may remove. A batch row is removed only when the stored
 * row still carries the same title and start the import wrote; anything edited,
 * and anything already gone, is reported rather than deleted.
 */
export function planUndo(
	batch: readonly ImportedEventRef[],
	live: readonly UndoCandidate[]
): UndoPlan {
	const liveById = new Map(live.map((row) => [row.id, row]));
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
		const unchanged = dedupeKey(row.title, row.startIso) === dedupeKey(ref.title, ref.startIso);
		if (unchanged) remove.push(ref.id);
		else changed.push({ id: row.id, title: row.title });
	}
	return { remove, changed, missing };
}
