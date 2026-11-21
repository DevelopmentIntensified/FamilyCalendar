/**
 * The import page's state class in node, with a fake api and a fake file
 * reader: the duplicate-aware default, the per-file ✕, the tick set the commit
 * carries, the earliest landed day the success card links (issue 082), the undo
 * batch, and the refusals that show the server's own note.
 *
 * Doc: ./README.md#invariants
 */
import { describe, expect, it } from 'vitest';
import { memoryToasts } from '$lib/kernel/client/toasts.svelte';
import type { CalendarApi, ImportFileInput } from './calendar.api';
import type {
	CalendarImportPreviewResponse,
	CalendarImportUndoResponse
} from './calendar.contract';
import { CalendarImportState, type CalendarImportItem } from './calendar.import.state.svelte';

const item = (index: number, overrides: Partial<CalendarImportItem> = {}): CalendarImportItem => ({
	key: `k${index}`,
	fileName: 'export.ics',
	whenText: `Tue, Sep ${20 + index}, 2026 · 2:00 PM`,
	duplicate: false,
	duplicateReason: null,
	title: `Event ${index}`,
	startIso: `2026-09-${20 + index}T14:00:00.000Z`,
	endIso: null,
	allDay: false,
	location: null,
	description: null,
	recurrenceFrequency: null,
	recurrenceInterval: 1,
	recurrenceByDay: null,
	recurrenceCount: null,
	recurrenceUntil: null,
	...overrides
});

const PREVIEW: CalendarImportPreviewResponse = {
	preview: {
		calendarId: 'cal-1',
		calendarName: 'Family Calendar',
		fileName: 'export.ics',
		items: [item(1), item(2, { duplicate: true, duplicateReason: 'already-on-calendar' })],
		duplicates: 1,
		files: [{ fileName: 'export.ics', events: 2, duplicates: 1 }],
		defaultSelection: ['k1']
	}
};

interface Calls {
	preview: { calendarId: string; files: readonly ImportFileInput[] }[];
	commit: { calendarId: unknown; picked: unknown }[];
	undo: { calendarId: unknown; batch: unknown }[];
}

function fakeApi(overrides: Partial<CalendarApi> = {}): { api: CalendarApi; calls: Calls } {
	const calls: Calls = { preview: [], commit: [], undo: [] };
	const api = {
		importPreview: async (calendarId: string, files: readonly ImportFileInput[]) => {
			calls.preview.push({ calendarId, files });
			return { ok: true as const, data: PREVIEW };
		},
		importCommit: async (body: { calendarId?: unknown; picked?: unknown }) => {
			calls.commit.push({ calendarId: body.calendarId, picked: body.picked });
			return {
				ok: true as const,
				data: {
					calendarId: 'cal-1',
					calendarName: 'Family Calendar',
					imported: 1,
					selected: 1,
					skipped: 1,
					skippedDuplicates: 1,
					failed: [],
					importedEvents: [
						{ id: 'evt1', title: 'Event 1', startIso: '2026-09-21T14:00:00.000Z' }
					]
				}
			};
		},
		importUndo: async (body: { calendarId?: unknown; batch?: unknown }) => {
			calls.undo.push({ calendarId: body.calendarId, batch: body.batch });
			const data: CalendarImportUndoResponse = {
				calendarName: 'Family Calendar',
				removed: 1,
				kept: [],
				alreadyGone: 0
			};
			return { ok: true as const, data };
		},
		...overrides
	} as unknown as CalendarApi;
	return { api, calls };
}

function fakeFile(name: string, size = 2048): File {
	return { name, size, arrayBuffer: async () => new ArrayBuffer(0) } as unknown as File;
}

function makeState(api: CalendarApi) {
	return new CalendarImportState(api, memoryToasts(), {
		calendars: [{ id: 'cal-1', name: 'Family Calendar' }],
		read: async (file) => `base64:${file.name}`
	});
}

describe('CalendarImportState', () => {
	it('follows the server suggestion until the user ticks, and goes back with one tap', async () => {
		const { api } = fakeApi();
		const state = makeState(api);
		state.choose([fakeFile('export.ics')]);
		await state.preview();

		expect(state.region).toBe('preview');
		expect(state.atDefault).toBe(true);
		// The duplicate-aware default: the already-on-calendar row is left out.
		expect([...state.pickedKeys]).toEqual(['k1']);

		state.selectAll();
		expect(state.selectedCount).toBe(2);
		state.dropFile('export.ics');
		expect(state.selectedCount).toBe(0);
		state.useSuggested();
		expect(state.atDefault).toBe(true);
		expect([...state.pickedKeys]).toEqual(['k1']);
	});

	it('posts the chosen files as base64 text and reads the sound totals', async () => {
		const { api, calls } = fakeApi();
		const state = makeState(api);
		state.choose([fakeFile('export.ics')]);
		await state.preview();

		expect(calls.preview).toEqual([
			{ calendarId: 'cal-1', files: [{ name: 'export.ics', contentBase64: 'base64:export.ics' }] }
		]);
		expect(state.duplicates).toBe(1);
		expect(state.totals).toEqual({ events: 2, duplicates: 1 });
		expect(state.chosenLabel).toBe('export.ics');
	});

	it('commits only the ticked rows and names the target calendar', async () => {
		const { api, calls } = fakeApi();
		const state = makeState(api);
		state.choose([fakeFile('export.ics')]);
		await state.preview();
		await state.commit();

		expect(calls.commit).toHaveLength(1);
		expect(calls.commit[0].calendarId).toBe('cal-1');
		expect(calls.commit[0].picked).toEqual([item(1)]);
		expect(state.region).toBe('done');
		expect(state.report?.imported).toBe(1);
	});

	it('links the EARLIEST landed day on the success card (issue 082)', async () => {
		const { api } = fakeApi({
			importCommit: async () => ({
				ok: true as const,
				data: {
					calendarId: 'cal-1',
					calendarName: 'Family Calendar',
					imported: 3,
					selected: 3,
					skipped: 0,
					skippedDuplicates: 0,
					failed: [],
					importedEvents: [
						{ id: 'e1', title: 'Later', startIso: '2026-10-14T09:00:00.000Z' },
						{ id: 'e2', title: 'First', startIso: '2026-09-29T14:00:00.000Z' },
						{ id: 'e3', title: 'Middle', startIso: '2026-10-01T08:00:00.000Z' }
					]
				}
			})
		});
		const state = makeState(api);
		state.choose([fakeFile('export.ics')]);
		await state.preview();
		await state.commit();

		expect(state.earliestDay).toBe('2026-09-29');
		expect(state.earliestDayLabel).toBe('Tue, Sep 29, 2026');
	});

	it('carries the commit batch back for the undo and reports what happened', async () => {
		const { api, calls } = fakeApi();
		const state = makeState(api);
		state.choose([fakeFile('export.ics')]);
		await state.preview();
		await state.commit();
		await state.undo();

		expect(calls.undo).toEqual([
			{
				calendarId: 'cal-1',
				batch: [{ id: 'evt1', title: 'Event 1', startIso: '2026-09-21T14:00:00.000Z' }]
			}
		]);
		expect(state.undoReport).toEqual({
			calendarName: 'Family Calendar',
			removed: 1,
			kept: [],
			alreadyGone: 0
		});
	});

	it('shows the server note and toasts when the preview is refused', async () => {
		const toasts = memoryToasts();
		const { api } = fakeApi({
			importPreview: async () => ({
				ok: false as const,
				status: 400,
				error: 'Could not read export.ics.'
			})
		});
		const state = new CalendarImportState(api, toasts, {
			calendars: [{ id: 'cal-1', name: 'Family Calendar' }],
			read: async (file) => `base64:${file.name}`
		});
		state.choose([fakeFile('export.ics')]);
		const ok = await state.preview();

		expect(ok).toBe(false);
		expect(state.error).toBe('Could not read export.ics.');
		expect(state.region).toBe('upload');
		expect(toasts.items.map((toast) => toast.text)).toContain(
			'Nothing was added — read the note above.'
		);
	});

	it('returns to the upload form after a finished flow', async () => {
		const { api } = fakeApi();
		const state = makeState(api);
		state.choose([fakeFile('export.ics')]);
		await state.preview();
		await state.commit();

		state.startOver();

		expect(state.region).toBe('upload');
		expect(state.chosen).toEqual([]);
		expect(state.report).toBeNull();
		expect(state.previewData).toBeNull();
	});
});
