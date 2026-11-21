/**
 * The import page's client state: the chosen files, the preview, the tick set,
 * the commit report, the undo report and the toasts. Ported from
 * `/calendar/import/+page.svelte`'s script half.
 *
 * The legacy page posted three SvelteKit form actions; the port calls the same
 * three steps through `calendar.api.ts` (`/api/import/preview|commit|undo`), so
 * the page, Android and the `/api` goldens run one flow. Nothing is written
 * until commit, and the commit re-runs dedupe server-side on purpose.
 *
 * Two rules keep it honest:
 * - The tick set is `null` while the user still follows the server's
 *   suggestion, so a duplicate-aware default arrives with the preview and needs
 *   no wiring; `pickedKeys` is the derived answer either way.
 * - The success card links the EARLIEST landed day (issue 082), never the first
 *   row ticked — `calendarEarliestImportDay` owns that rule.
 *
 * Files are read in the browser and posted as base64 text
 * (`contentBase64`), so the reader is injected: node tests pass a fake.
 *
 * Doc: ./README.md#invariants
 */
import { DateTime } from 'luxon';
import type { Toasts } from '$lib/kernel/client/toasts.svelte';
import type { CalendarApi, ImportFileInput } from './calendar.api';
import type {
	CalendarImportCommitResponse,
	CalendarImportPreviewResponse,
	CalendarImportTargetsResponse,
	CalendarImportUndoResponse
} from './calendar.contract';
import { calendarEarliestImportDay } from './calendar.import.rules';

export type CalendarImportPreviewData = CalendarImportPreviewResponse['preview'];
export type CalendarImportItem = CalendarImportPreviewData['items'][number];
export type CalendarImportReport = CalendarImportCommitResponse;
export type CalendarImportUndoTally = CalendarImportUndoResponse;
export type CalendarImportCalendar = CalendarImportTargetsResponse['calendars'][number];

/** The success/copy the legacy page used when a step was refused. */
export const CALENDAR_IMPORT_NOTHING_ADDED = 'Nothing was added — read the note above.';
export const CALENDAR_IMPORT_UNDO_FAILED =
	"Couldn't undo that import — try again, or delete from the calendar.";

export interface CalendarImportStateInit {
	readonly calendars: readonly CalendarImportCalendar[];
	readonly calendarId?: string;
	/** Browser File → base64 text; injected so this class runs in node. */
	readonly read?: (file: File) => Promise<string>;
}

/** One chosen file as the list draws it. */
export interface CalendarImportChosen {
	readonly name: string;
	readonly size: number;
}

/** What the page is showing: the upload form, the preview, or the report. */
export type CalendarImportRegion = 'upload' | 'preview' | 'done';

/**
 * The browser's reader: a File to the `contentBase64` the wire carries. Chunked
 * so a 5 MB export never spreads a megabyte-sized array into one call.
 */
export async function calendarFileBase64(file: File): Promise<string> {
	const bytes = new Uint8Array(await file.arrayBuffer());
	const chunk = 0x2000;
	let binary = '';
	for (let index = 0; index < bytes.length; index += chunk) {
		binary += String.fromCharCode(...bytes.subarray(index, index + chunk));
	}
	return btoa(binary);
}

export class CalendarImportState {
	readonly calendars: readonly CalendarImportCalendar[];
	calendarId = $state('');
	files = $state<File[]>([]);
	previewData = $state<CalendarImportPreviewData | null>(null);
	report = $state<CalendarImportReport | null>(null);
	undoReport = $state<CalendarImportUndoTally | null>(null);
	/** The user's own ticks, or null while following the server's suggestion. */
	picked = $state<Set<string> | null>(null);
	dragging = $state(false);
	pending = $state(false);
	undoing = $state(false);
	error = $state('');

	private readonly api: CalendarApi;
	private readonly toasts: Toasts;
	private readonly read: (file: File) => Promise<string>;

	constructor(api: CalendarApi, toasts: Toasts, init: CalendarImportStateInit) {
		this.api = api;
		this.toasts = toasts;
		this.calendars = init.calendars;
		this.calendarId = init.calendarId ?? init.calendars[0]?.id ?? '';
		this.read = init.read ?? calendarFileBase64;
	}

	/** What the list draws: a name and a size per chosen file. */
	get chosen(): CalendarImportChosen[] {
		return this.files.map((file) => ({ name: file.name, size: file.size }));
	}

	/** What the drop zone says once files are chosen: one name, or a count. */
	get chosenLabel(): string {
		if (this.files.length === 0) return '';
		return this.files.length === 1 ? this.files[0].name : `${this.files.length} files chosen`;
	}

	get region(): CalendarImportRegion {
		if (this.report) return 'done';
		if (this.previewData) return 'preview';
		return 'upload';
	}

	get items(): CalendarImportItem[] {
		return this.previewData?.items ?? [];
	}

	get duplicates(): number {
		return this.previewData?.duplicates ?? 0;
	}

	get atDefault(): boolean {
		return this.picked === null;
	}

	/** The rows a commit carries: the user's ticks, else the server's default. */
	get pickedKeys(): Set<string> {
		return this.picked ?? new Set(this.previewData?.defaultSelection ?? []);
	}

	get selectedCount(): number {
		return this.pickedKeys.size;
	}

	/** One row per export, so a multi-file import can be judged per file. */
	get filesSummary(): CalendarImportPreviewData['files'] {
		return this.previewData?.files ?? [];
	}

	get totals(): { events: number; duplicates: number } {
		return this.filesSummary.reduce(
			(acc, file) => ({
				events: acc.events + file.events,
				duplicates: acc.duplicates + file.duplicates
			}),
			{ events: 0, duplicates: 0 }
		);
	}

	/** `YYYY-MM-DD` of the earliest landed event, or null before a commit. */
	get earliestDay(): string | null {
		return calendarEarliestImportDay(this.report?.importedEvents ?? []);
	}

	/** `"Tue, Sep 29, 2026"` for that day, or `''` before a commit. */
	get earliestDayLabel(): string {
		const day = this.earliestDay;
		return day ? DateTime.fromISO(day).toFormat('ccc, LLL d, yyyy') : '';
	}

	/** The calendar a commit/undo names: the preview's own, once it exists. */
	get targetCalendarId(): string {
		return this.previewData?.calendarId || this.calendarId;
	}

	get targetCalendarName(): string {
		return (
			this.previewData?.calendarName ||
			this.calendars.find((calendar) => calendar.id === this.calendarId)?.name ||
			''
		);
	}

	choose(files: readonly File[] | null | undefined): void {
		this.files = [...(files ?? [])];
	}

	removeChosen(name: string): void {
		this.files = this.files.filter((file) => file.name !== name);
	}

	toggle(key: string, on: boolean): void {
		const next = new Set(this.pickedKeys);
		if (on) next.add(key);
		else next.delete(key);
		this.picked = next;
	}

	selectAll(): void {
		this.picked = new Set(this.items.map((item) => item.key));
	}

	selectNone(): void {
		this.picked = new Set();
	}

	/**
	 * Take one file out of the import (the prototype's per-file ✕). Its rows
	 * stay on screen and unticked rather than vanishing, so the choice stays
	 * reversible.
	 */
	dropFile(fileName: string): void {
		const next = new Set(this.pickedKeys);
		for (const item of this.items) {
			if (item.fileName === fileName) next.delete(item.key);
		}
		this.picked = next;
	}

	/** Back to the server's suggestion: duplicates unticked. */
	useSuggested(): void {
		this.picked = null;
	}

	/** Step one: describe the rows, write nothing. */
	async preview(): Promise<boolean> {
		if (this.pending || this.files.length === 0) return false;
		this.pending = true;
		this.error = '';
		try {
			const files: ImportFileInput[] = [];
			for (const file of this.files) {
				files.push({ name: file.name, contentBase64: await this.read(file) });
			}
			const result = await this.api.importPreview(this.calendarId, files);
			if (!result.ok) {
				this.error = result.error;
				this.toasts.error(CALENDAR_IMPORT_NOTHING_ADDED);
				return false;
			}
			this.previewData = result.data.preview;
			// A new parse is a new suggestion; any older ticks belonged to it.
			this.picked = null;
			return true;
		} catch {
			this.error = 'Network error. Check your connection and try again.';
			return false;
		} finally {
			this.pending = false;
		}
	}

	/** Step two: write only the ticked rows. */
	async commit(): Promise<boolean> {
		if (this.pending || this.selectedCount === 0) return false;
		this.pending = true;
		this.error = '';
		try {
			const picked = this.items.filter((item) => this.pickedKeys.has(item.key));
			const result = await this.api.importCommit({
				calendarId: this.targetCalendarId,
				picked
			});
			if (!result.ok) {
				this.error = result.error;
				this.toasts.error(CALENDAR_IMPORT_NOTHING_ADDED);
				return false;
			}
			this.report = result.data;
			this.undoReport = null;
			const count = result.data.imported;
			this.toasts.success(
				`Added ${count} event${count === 1 ? '' : 's'} to your ${result.data.calendarName}.`
			);
			return true;
		} catch {
			this.error = 'Network error. Check your connection and try again.';
			return false;
		} finally {
			this.pending = false;
		}
	}

	/** Step three, the only one that removes rows: put this batch back. */
	async undo(): Promise<boolean> {
		const report = this.report;
		if (!report || this.undoing) return false;
		this.undoing = true;
		try {
			const result = await this.api.importUndo({
				calendarId: report.calendarId,
				batch: report.importedEvents
			});
			if (!result.ok) {
				this.toasts.error(CALENDAR_IMPORT_UNDO_FAILED);
				return false;
			}
			this.undoReport = result.data;
			const removed = result.data.removed;
			this.toasts.success(
				removed > 0
					? `Removed ${removed} event${removed === 1 ? '' : 's'} from your ${result.data.calendarName}.`
					: 'Nothing was removed.'
			);
			return true;
		} catch {
			this.toasts.error(CALENDAR_IMPORT_UNDO_FAILED);
			return false;
		} finally {
			this.undoing = false;
		}
	}

	/** Back to the upload form after a finished (or abandoned) flow. */
	startOver(): void {
		this.files = [];
		this.previewData = null;
		this.report = null;
		this.undoReport = null;
		this.picked = null;
		this.dragging = false;
		this.error = '';
	}
}
