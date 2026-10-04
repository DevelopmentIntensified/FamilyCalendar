import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { tick } from 'svelte';
import { render, screen, fireEvent, cleanup } from '@testing-library/svelte';
import { pushToast } from '$lib/client/toasts';
import ImportPage from './+page.svelte';
import type { ActionData, PageData } from './$types';

/* oxlint-disable anti-slop/no-chained-type-assertions, anti-slop/require-safety-comment-for-type-assertion, anti-slop/no-unnecessary-type-assertion -- SAFETY: this file's whole job is to hand the page the two props SvelteKit generates, `data` and `form`, whose declared types are the generated `$types` unions. A test cannot produce a genuinely-typed `ActionData` without running the server, so each cast stands for "this literal is one of the action bags the page already narrows for itself" — and the page's own `previewOf` / `reportOf` / `undoOf` guards are what verify the shape at runtime. */

/**
 * The preview and success screens, driven the way a user drives them: the
 * server's ?/preview bag arrives as `form`, the user ticks, and the ?/commit
 * bag replaces it. `enhance` is the one framework seam with no DI — it is
 * captured so a submit's pending state and its outcome can be asserted without
 * a server.
 */
/** A form node as `enhance` receives it — the only part of it this mock reads. */
type FormNode = HTMLFormElement;

/** What the page's callback returns and this mock captures. */
type ResultHandler = (payload: EnhanceResult) => Promise<void>;

interface EnhanceResult {
	result: { type: string };
	update: () => Promise<void>;
}

/** `enhance`'s submit callback: the FormData it is handed, and the result handler. */
type SubmitCallback = (payload?: { formData: FormData }) => ResultHandler;

interface EnhanceState {
	/** The page's submit callback for the form currently on screen. */
	submit: SubmitCallback | null;
	/** What that callback returned: the in-flight result handler. */
	handler: ResultHandler | null;
	/** The FormData the last submit handed the callback. */
	formData: FormData | null;
}

const enhanceState = vi.hoisted((): EnhanceState => ({
	submit: null,
	handler: null,
	formData: null
}));

// oxlint-disable-next-line anti-slop/no-module-mocking -- SvelteKit $app/* is framework-injected; no DI seam exists.
vi.mock('$app/forms', () => ({
	// SAFETY: the page passes a submit callback; capturing it is the contract.
	enhance: (_form: FormNode, submit?: SubmitCallback) => {
		enhanceState.submit = submit ?? null;
		enhanceState.handler = null;
		return (node: FormNode) => {
			node.addEventListener('submit', (event) => {
				event.preventDefault();
				const formData = new FormData(node);
				enhanceState.formData = formData;
				// The page flips its pending flag inside this call, synchronously.
				enhanceState.handler = submit?.({ formData }) ?? null;
			});
		};
	}
}));
// oxlint-disable-next-line anti-slop/no-module-mocking -- toasts are a global store; the real one is fine to watch.
vi.mock('$lib/client/toasts', () => ({ pushToast: vi.fn() }));

const ITEM = {
	title: 'Soccer practice',
	startIso: '2026-09-29T14:00:00.000Z',
	endIso: '2026-09-29T15:30:00.000Z',
	allDay: false,
	location: 'Riverside Park',
	description: null,
	recurrenceFrequency: null,
	recurrenceInterval: null,
	recurrenceByDay: null,
	recurrenceCount: null,
	recurrenceUntil: null
};

/** The parsed event fields `?/preview` describes, before the preview adds its own. */
type ItemFields = typeof ITEM;

/** A preview row exactly as `?/preview` describes one event. */
interface PreviewItem extends ItemFields {
	key: string;
	fileName: string;
	whenText: string;
	duplicate: boolean;
	duplicateReason: string | null;
}

function previewItem(over: Partial<PreviewItem> = {}): PreviewItem {
	return {
		...ITEM,
		key: 'e0',
		fileName: 'jon-hopper.ics',
		whenText: 'Tue, Sep 29, 2026 · 2:00 PM–3:30 PM',
		duplicate: false,
		duplicateReason: null,
		...over
	};
}

/** The ?/preview bag: two rows, one of them already on the calendar. */
const PREVIEW = {
	preview: {
		calendarId: 'cal-1',
		calendarName: 'Personal Calendar',
		fileName: 'jon-hopper.ics',
		items: [
			previewItem(),
			previewItem({
				key: 'e1',
				title: 'Standup',
				duplicate: true,
				duplicateReason: 'already-on-calendar'
			})
		],
		duplicates: 1,
		defaultSelection: ['e0'],
		files: [{ fileName: 'jon-hopper.ics', events: 2, duplicates: 1 }]
	}
};

const COMMIT = {
	calendarId: 'cal-1',
	calendarName: 'Personal Calendar',
	imported: 2,
	selected: 2,
	skipped: 0,
	skippedDuplicates: 0,
	failed: [],
	importedEvents: [
		{ id: 'ev-1', title: 'Soccer practice', startIso: '2026-09-29T14:00:00.000Z' },
		{ id: 'ev-2', title: 'Standup', startIso: '2026-09-30T12:15:00.000Z' }
	]
};

const DATA = {
	calendars: [{ id: 'cal-1', name: 'Personal Calendar' }]
} as unknown as PageData;

function renderPreview() {
	return render(ImportPage, {
		props: { data: DATA, form: PREVIEW as unknown as ActionData }
	});
}

/** The preview as a multi-file import describes it: two exports, one flagged. */
const MULTI_PREVIEW = {
	preview: {
		calendarId: 'cal-1',
		calendarName: 'Personal Calendar',
		fileName: '2 files',
		items: [
			previewItem({ key: 'e0', fileName: 'kids-activities.ics' }),
			previewItem({
				key: 'e1',
				fileName: 'kids-activities.ics',
				title: 'Standup',
				duplicate: true,
				duplicateReason: 'already-on-calendar'
			}),
			previewItem({ key: 'e2', fileName: 'work.ics', title: 'All-hands' })
		],
		duplicates: 1,
		defaultSelection: ['e0', 'e2'],
		files: [
			{ fileName: 'kids-activities.ics', events: 2, duplicates: 1 },
			{ fileName: 'work.ics', events: 1, duplicates: 0 }
		]
	}
};

/** The file input as the browser fills it: a list, not a single file. */
function chooseFiles(names: string[]) {
	const input = document.querySelector('input[type="file"]') as HTMLInputElement;
	// jsdom exposes `files` as a read-only IDL attribute, so the test stands in
	// for the picker rather than assigning to it.
	Object.defineProperty(input, 'files', {
		configurable: true,
		value: names.map((name) => new File(['BEGIN:VCALENDAR\r\nEND:VCALENDAR'], name))
	});
	return fireEvent.change(input);
}

/** The rows of the chosen-files list on the upload screen. */
function chosenFiles() {
	return screen.getAllByTestId('chosen-file');
}

function renderMultiPreview() {
	return render(ImportPage, {
		props: { data: DATA, form: MULTI_PREVIEW as unknown as ActionData }
	});
}

/** The upload screen: no action has run yet, so `form` is absent entirely. */
function renderUpload() {
	return render(ImportPage, { props: { data: DATA } });
}

function renderCommitted() {
	return render(ImportPage, {
		props: { data: DATA, form: COMMIT as unknown as ActionData }
	});
}

beforeEach(() => {
	enhanceState.submit = null;
	enhanceState.handler = null;
	enhanceState.formData = null;
});

afterEach(() => {
	cleanup();
	vi.mocked(pushToast).mockClear();
});

describe('import preview screen', () => {
	it('opens on the suggested selection — duplicates unticked', () => {
		renderPreview();
		expect(screen.getByRole('checkbox', { name: 'Import Soccer practice' })).toBeChecked();
		expect(screen.getByRole('checkbox', { name: 'Import Standup' })).not.toBeChecked();
		expect(screen.getByRole('button', { name: /Add 1 event/ })).toBeInTheDocument();
	});

	it('names why a row is a likely duplicate, on the row itself', () => {
		renderPreview();
		expect(
			screen.getByText('Likely duplicate — already on Personal Calendar')
		).toBeInTheDocument();
	});

	it('tells the user nothing has been written yet', () => {
		renderPreview();
		expect(screen.getByText(/Nothing has been added to Personal Calendar yet/)).toBeInTheDocument();
	});

	// The prototype's drop zone names where a file comes from and what happens
	// to it. The app says both, in the flow rather than above it.
	it('states the file limit on the upload screen, before anything is chosen', () => {
		renderUpload();
		expect(screen.getByText(/Up to 500 events · max 5 MB/)).toBeInTheDocument();
		expect(screen.getByText(/Nothing is added until you tick/)).toBeInTheDocument();
	});

	// `import.html`: "nothing is uploaded to a third party" — the promise that
	// makes dropping a whole family's exports feel safe.
	it('says the file never leaves the app', () => {
		renderUpload();
		expect(screen.getByText(/nothing is uploaded to a third party/i)).toBeInTheDocument();
	});

	// The prototype drops three exports at once and lists each one with its own
	// count and its own remove ✕. One file is the degenerate case, not the only
	// case the page has to work.
	describe('choosing files', () => {
		it('takes several exports at once and names each one', async () => {
			renderUpload();
			await chooseFiles(['kids-activities.ics', 'work.ics']);

			const names = chosenFiles().map((row) => row.textContent ?? '');
			expect(names).toHaveLength(2);
			expect(names[0]).toContain('kids-activities.ics');
			expect(names[1]).toContain('work.ics');
			expect(screen.getByRole('button', { name: /Preview events/ })).not.toBeDisabled();
		});

		it('removes one file without losing the others', async () => {
			renderUpload();
			await chooseFiles(['kids-activities.ics', 'work.ics']);

			await fireEvent.click(
				screen.getByRole('button', { name: 'Remove kids-activities.ics' })
			);

			const names = chosenFiles().map((row) => row.textContent ?? '');
			expect(names).toHaveLength(1);
			expect(names[0]).toContain('work.ics');
		});

		// A file input's FileList cannot be edited, so the ✕ alone would leave the
		// removed file in the POST. This is the assertion that says it does not.
		it('posts only the files still on the list', async () => {
			renderUpload();
			await chooseFiles(['kids-activities.ics', 'work.ics']);
			await fireEvent.click(screen.getByRole('button', { name: 'Remove kids-activities.ics' }));

			// What the browser would have sent: both files, because the input
			// still holds them.
			const formData = new FormData();
			formData.append('calendarId', 'cal-1');
			formData.append('files', new File(['a'], 'kids-activities.ics'));
			formData.append('files', new File(['b'], 'work.ics'));
			enhanceState.submit?.({ formData });

			expect([...formData.getAll('files')].map((f) => (f as File).name)).toEqual(['work.ics']);
		});

		it('keeps the preview disabled until something is chosen', () => {
			renderUpload();
			expect(screen.getByRole('button', { name: /Preview events/ })).toBeDisabled();
		});
	});

	// "What is in them": per-file counts, the duplicate count per file, and the
	// remove ✕. The app draws it after the parse rather than before it, because
	// the counts are what the parse produces — but nothing is written yet.
	describe('what is in them', () => {
		it('counts events and duplicates for each file', () => {
			renderMultiPreview();
			const card = screen.getByRole('region', { name: 'What is in them' });
			expect(card).toHaveTextContent('kids-activities.ics');
			expect(card).toHaveTextContent('2 events');
			expect(card).toHaveTextContent('1 dupe');
			expect(card).toHaveTextContent('work.ics');
			expect(card).toHaveTextContent('no dupes');
			expect(card).toHaveTextContent(/3 events · 1 likely duplicate/);
		});

		it('takes one file out of the import without touching the other', async () => {
			renderMultiPreview();

			await fireEvent.click(
				screen.getByRole('button', { name: 'Remove work.ics from this import' })
			);

			expect(screen.getByRole('checkbox', { name: 'Import Soccer practice' })).toBeChecked();
			expect(screen.getByRole('checkbox', { name: 'Import All-hands' })).not.toBeChecked();
			expect(screen.getByRole('button', { name: /Add 1 event$/ })).toBeInTheDocument();
		});

		it('says plainly that nothing has been written yet', () => {
			renderMultiPreview();
			expect(screen.getByText(/Nothing is written until you confirm/)).toBeInTheDocument();
		});
	});

	// The prototype badges each row `new` / `already there`. The app also
	// spells the duplicate out in words; both are the approved artefact.
	it('badges each row new, or already there when it is a duplicate', () => {
		renderPreview();
		const fresh = screen.getByRole('checkbox', { name: 'Import Soccer practice' }).closest('li')!;
		const dupe = screen.getByRole('checkbox', { name: 'Import Standup' }).closest('li')!;
		expect(fresh).toHaveTextContent('new');
		expect(dupe).toHaveTextContent('already there');
	});

	// The prototype's side rail: what an import keeps, drops and skips.
	it('states what an import keeps, drops and skips', () => {
		renderUpload();
		const rail = screen.getByRole('region', { name: 'Where do they go' });
		expect(rail).toHaveTextContent(/Recurrences kept/);
		expect(rail).toHaveTextContent(/Alarms dropped/);
		expect(rail).toHaveTextContent(/Duplicates skipped/);
	});

	// The prototype's other two cards, approved alongside it.
	it('states the plan gate rather than letting a paywall be a surprise', () => {
		renderUpload();
		expect(screen.getByRole('region', { name: 'Plan gate' })).toHaveTextContent(
			/exportImportEnabled/
		);
	});

	it('carries the argument for why import has a navbar slot', () => {
		renderUpload();
		expect(screen.getByRole('region', { name: 'Is it a power feature?' })).toHaveTextContent(
			/switch/i
		);
	});

	// The prototype's load-bearing line: an RRULE is one row, not eighteen.
	it('explains that a recurrence becomes one repeating row', () => {
		renderUpload();
		expect(screen.getByText(/RRULE/)).toBeInTheDocument();
	});

	it('Select all ticks the duplicates too, and Select none clears everything', async () => {
		renderPreview();
		await fireEvent.click(screen.getByRole('button', { name: 'Select all' }));
		expect(screen.getByRole('checkbox', { name: 'Import Standup' })).toBeChecked();
		expect(screen.getByRole('button', { name: /Add 2 events/ })).toBeInTheDocument();

		await fireEvent.click(screen.getByRole('button', { name: 'Select none' }));
		expect(screen.getByRole('checkbox', { name: 'Import Soccer practice' })).not.toBeChecked();
		expect(screen.getByRole('button', { name: /Tick the events you want/ })).toBeDisabled();
	});

	it('Back to suggested restores the duplicate-aware default', async () => {
		renderPreview();
		await fireEvent.click(screen.getByRole('button', { name: 'Select all' }));
		await fireEvent.click(screen.getByRole('button', { name: 'Back to suggested' }));
		expect(screen.getByRole('checkbox', { name: 'Import Standup' })).not.toBeChecked();
		expect(screen.getByRole('button', { name: /Add 1 event/ })).toBeInTheDocument();
	});

	// `import.html` draws each row with a "new" / "already there" pill beside it.
	// The app keeps the words too: the pill is the prototype's mark, the words
	// are why it is there.
	it('names why a row is a likely duplicate, not just that it is one', () => {
		renderPreview();
		const row = screen.getByRole('checkbox', { name: 'Import Standup' }).closest('li')!;
		expect(row).toHaveTextContent(/already on Personal Calendar/);
	});

	it('posts only the ticked rows, so the preview cannot drift from the save', async () => {
		renderPreview();
		const posted = screen.getByRole('button', { name: /Add 1 event/ }).closest('form');
		const picked = (posted?.querySelector('input[name="picked"]') as HTMLInputElement).value;
		const rows = JSON.parse(picked);
		expect(rows).toHaveLength(1);
		expect(rows[0].title).toBe('Soccer practice');
	});
});

describe('import success screen', () => {
	it('says what landed and where', () => {
		renderCommitted();
		expect(screen.getByTestId('import-success')).toHaveTextContent(
			'Added 2 events to your Personal Calendar'
		);
	});

	it('offers an undo that carries the batch the commit wrote', () => {
		renderCommitted();
		const undo = screen.getByRole('button', { name: /Undo this import/ });
		expect(undo).toBeInTheDocument();
		const form = undo.closest('form');
		const batch = (form?.querySelector('input[name="batch"]') as HTMLInputElement).value;
		expect(JSON.parse(batch)).toEqual(COMMIT.importedEvents);
	});

	// Issue 082: an import lands in another month, and the only way to know it
	// worked is to go there.
	it('links to the first imported date so the landing is verifiable', () => {
		const view = renderCommitted();
		const link = view.container.querySelector('a[href="/calendar?date=2026-09-29"]');
		expect(link).toBeTruthy();
		// Named for a human, not shown as an ISO string.
		expect(link?.textContent).toContain('Sep 29');
	});

	it('links to the EARLIEST imported date, not the first row ticked', () => {
		const view = render(ImportPage, {
			props: {
				data: DATA,
				form: {
					...COMMIT,
					importedEvents: [
						{ id: 'ev-2', title: 'Standup', startIso: '2026-11-03T12:15:00.000Z' },
						{ id: 'ev-1', title: 'Soccer practice', startIso: '2026-10-06T14:00:00.000Z' }
					]
				} as unknown as ActionData
			}
		});
		expect(view.container.querySelector('a[href="/calendar?date=2026-10-06"]')).toBeTruthy();
	});

	it('names no date when nothing landed', () => {
		render(ImportPage, {
			props: {
				data: DATA,
				form: { ...COMMIT, imported: 0, importedEvents: [] } as unknown as ActionData
			}
		});
		expect(screen.queryByRole('link', { name: /Sep 29/ })).not.toBeInTheDocument();
	});
});

describe('undoing an import', () => {
	/**
	 * Pressing the button: `enhance`'s captured submit callback for the undo form,
	 * which is the only enhanced form on the success screen. Returns the
	 * in-flight result handler, or undefined when nothing is on screen.
	 */
	function pressUndo(): ResultHandler | undefined {
		// SAFETY: the page's undo form is the only enhanced form on this screen,
		// so the last captured callback is the undo's.
		return enhanceState.submit?.();
	}

	it('acknowledges the tap immediately, before the server answers', async () => {
		renderCommitted();
		pressUndo();
		await tick();
		// The result handler has not run yet: the button says so.
		expect(screen.getByRole('button', { name: /Undoing/ })).toBeDisabled();
	});

	it('names what was removed and what was kept', async () => {
		const view = renderCommitted();
		pressUndo();

		await view.rerender({
			form: {
				calendarName: 'Personal Calendar',
				removed: 1,
				kept: [{ id: 'ev-2', title: 'Standup' }],
				alreadyGone: 0
			} as unknown as ActionData
		});

		expect(screen.getByTestId('import-undone')).toHaveTextContent(
			'Removed 1 event from your Personal Calendar'
		);
		expect(screen.getByTestId('import-undone')).toHaveTextContent('Standup');
		expect(screen.queryByRole('button', { name: /Undo this import/ })).not.toBeInTheDocument();
	});

	it('says so when the undo fails instead of leaving a button that did nothing', async () => {
		renderCommitted();
		const handler = pressUndo();
		expect(handler).toBeDefined();
		await handler?.({ result: { type: 'failure' }, update: async () => {} });

		expect(pushToast).toHaveBeenCalledWith(
			expect.objectContaining({ message: expect.stringMatching(/couldn|try again/i) })
		);
		expect(screen.getByRole('button', { name: /Undo this import/ })).toBeInTheDocument();
	});
});
/* oxlint-enable anti-slop/no-chained-type-assertions, anti-slop/require-safety-comment-for-type-assertion, anti-slop/no-unnecessary-type-assertion */