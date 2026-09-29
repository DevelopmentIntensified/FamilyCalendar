import { DateTime } from 'luxon';
import type { IcsEventDraft, IcsFrequency } from './icsImportService';

/** Mirror of the parser's cap — a commit request is bounded too. */
export const MAX_IMPORT_EVENTS = 500;

/** How a preview row came to be flagged as a likely duplicate. */
export type DuplicateReason = 'already-on-calendar' | 'earlier-in-file';

/** One row of the import preview: the draft plus what the user needs to judge it. */
export interface ImportPreviewItem extends IcsEventDraft {
	/** Stable id within one parse — the row's position in the file. */
	key: string;
	/** Human "when", recurrence in words rather than a raw RRULE. */
	whenText: string;
	/** A likely duplicate by the existing title + exact start key. */
	duplicate: boolean;
	duplicateReason: DuplicateReason | null;
}

export interface ImportPreview {
	items: ImportPreviewItem[];
	duplicates: number;
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
 * repeating an earlier row in the same file is flagged too — importing it
 * would double the calendar just as surely.
 */
export function buildPreview(
	drafts: IcsEventDraft[],
	existingKeys: ReadonlySet<string>,
	zone = 'utc'
): ImportPreview {
	const seenInFile = new Set<string>();
	const items: ImportPreviewItem[] = drafts.slice(0, MAX_IMPORT_EVENTS).map((draft, index) => {
		const key = dedupeKey(draft.title, draft.startIso);
		let duplicateReason: DuplicateReason | null = null;
		if (existingKeys.has(key)) duplicateReason = 'already-on-calendar';
		else if (seenInFile.has(key)) duplicateReason = 'earlier-in-file';
		seenInFile.add(key);
		return {
			...draft,
			key: `e${index}`,
			whenText: describeWhen(draft, zone),
			duplicate: duplicateReason !== null,
			duplicateReason
		};
	});
	return { items, duplicates: items.filter((i) => i.duplicate).length };
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
