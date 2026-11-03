import { describe, it, expect, vi } from 'vitest';
import { parseIcs } from '$lib/server/services/icsImportService';
import type { ImportDeps } from '$lib/server/services/icsImportFlow';
import type { UndoCandidate } from '$lib/server/services/icsImportPreview';
import { POST as PREVIEW } from './preview/+server';
import { POST as COMMIT } from './commit/+server';
import { POST as UNDO } from './undo/+server';

/**
 * /api/import/{preview,commit,undo} (#292 G17): JSON in, the page's own
 * import flow (icsImportFlow) through its ImportDeps seam. The parser stays
 * real; storage is faked.
 */
const ICS = [
	'BEGIN:VCALENDAR',
	'BEGIN:VEVENT',
	'SUMMARY:Soccer practice',
	'DTSTART:20260929T140000Z',
	'DTEND:20260929T153000Z',
	'END:VEVENT',
	'END:VCALENDAR'
].join('\r\n');
const b64 = (s: string) => Buffer.from(s, 'utf8').toString('base64');

function makeDeps(over: Partial<ImportDeps> = {}): ImportDeps {
	return {
		parseIcs,
		getUserFamilyId: vi.fn(async () => null),
		calendarIsOwned: vi.fn(async (calendarId: string) => calendarId === 'cal-1'),
		listExistingKeys: vi.fn(async (): Promise<string[]> => []),
		createEvent: vi.fn(async () => ({ id: 'ev-1' }) as never),
		getUserZone: vi.fn(async () => 'utc'),
		loadUndoCandidates: vi.fn(async (): Promise<UndoCandidate[]> => []),
		deleteImportedEvents: vi.fn(async () => 0),
		nudgeEventsChanged: vi.fn(),
		...over
	};
}

function ev(body: unknown, user: { id: string } | null = { id: 'user-1' }) {
	// SAFETY: test double — handlers read locals.user and request.
	return {
		locals: { user },
		request: new Request('http://x/api/import', {
			method: 'POST',
			body: typeof body === 'string' ? body : JSON.stringify(body)
		})
	} as never;
}

describe('/api/import (G17)', () => {
	it.each([
		['preview', PREVIEW],
		['commit', COMMIT],
		['undo', UNDO]
	])('%s: 401 without auth', async (_n, h) => {
		expect((await h(ev({}, null), makeDeps())).status).toBe(401);
	});

	it("403 for a calendar that isn't yours (the page's message)", async () => {
		const res = await PREVIEW(
			ev({ calendarId: 'cal-other', files: [{ name: 'a.ics', contentBase64: b64(ICS) }] }),
			makeDeps()
		);
		expect(res.status).toBe(403);
		expect(await res.json()).toEqual({ error: 'That calendar is not yours to import into.' });
	});

	it('400 for bad file entries / no files', async () => {
		expect(
			(await PREVIEW(ev({ calendarId: 'cal-1', files: [{ name: 'a.ics' }] }), makeDeps())).status
		).toBe(400);
		const res = await PREVIEW(ev({ calendarId: 'cal-1', files: [] }), makeDeps());
		expect(await res.json()).toEqual({ error: 'Choose an .ics file to import.' });
	});

	it('preview → commit → undo round-trip', async () => {
		const deps = makeDeps();
		const pv = await (
			await PREVIEW(
				ev({ calendarId: 'cal-1', files: [{ name: 'kids.ics', contentBase64: b64(ICS) }] }),
				deps
			)
		).json();
		expect(pv.preview.fileName).toBe('kids.ics');
		expect(pv.preview.items).toHaveLength(1);
		expect(deps.createEvent).not.toHaveBeenCalled();

		// A preview item IS a draft plus display fields; the app posts back the ticked items.
		const picked = pv.preview.items;
		const report = await (await COMMIT(ev({ calendarId: 'cal-1', picked }), deps)).json();
		expect(report).toMatchObject({ imported: 1, selected: 1, calendarName: 'Personal Calendar' });
		expect(report.importedEvents[0].id).toBe('ev-1');

		vi.mocked(deps.loadUndoCandidates).mockResolvedValueOnce(report.importedEvents);
		vi.mocked(deps.deleteImportedEvents).mockResolvedValueOnce(1);
		const undo = await (await UNDO(ev({ calendarId: 'cal-1', batch: report.importedEvents }), deps)).json();
		expect(undo).toEqual({ calendarName: 'Personal Calendar', removed: 1, kept: [], alreadyGone: 0 });
	});

	it('commit: 400 with nothing picked', async () => {
		const res = await COMMIT(ev({ calendarId: 'cal-1' }), makeDeps());
		expect(await res.json()).toEqual({ error: 'Pick the events you want to add.' });
	});
});
