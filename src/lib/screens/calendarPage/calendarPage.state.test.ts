/**
 * The screen's state class in node, no DOM: the one filter rung
 * (calendars → search → people), the ad's survival, the person counts, the
 * empty-state choice, selection and Escape, the deep-link seeds, the first-run
 * card and the toasts. Expected values come from the README Invariants and the
 * legacy sources they cite, never from this code.
 *
 * Doc: ./README.md#the-reading-filters
 */
import { describe, expect, it, vi } from 'vitest';
import type { CalendarApi } from '$lib/domains/calendar/index';
import { memoryToasts } from '$lib/kernel/client/toasts.svelte';
import { fixedClock } from '$lib/kernel/time/clock';
import type {
	CalendarPageEventRow,
	CalendarPageGrid,
	CalendarPageModel,
	CalendarPageTaskRow
} from './calendarPage.contract';
import { CalendarPageState } from './calendarPage.state.svelte';

const NOW = '2026-03-10T09:00:00.000Z';

/** A `Storage`-shaped device preference store, readable by the test. */
interface FakeStorage {
	readonly entries: Map<string, string>;
	getItem(key: string): string | null;
	setItem(key: string, value: string): void;
	removeItem(key: string): void;
}

function fakeStorage(initial: Record<string, string> = {}): FakeStorage {
	const entries = new Map(Object.entries(initial));
	return {
		entries,
		getItem: (key: string) => entries.get(key) ?? null,
		setItem: (key: string, value: string) => {
			entries.set(key, value);
		},
		removeItem: (key: string) => {
			entries.delete(key);
		}
	};
}

function eventRow(overrides: Partial<CalendarPageEventRow> = {}): CalendarPageEventRow {
	return {
		id: 'evt-1',
		masterId: null,
		occurrenceDate: null,
		title: 'Piano',
		description: null,
		location: null,
		date: '2026-03-10',
		start: '2026-03-10T10:00:00.000Z',
		end: '2026-03-10T11:00:00.000Z',
		allDay: false,
		calendarId: 'personal',
		ownerId: 'me',
		creatorName: null,
		rsvpStatus: null,
		attendance: null,
		recurrenceFrequency: null,
		...overrides
	};
}

function taskRow(overrides: Partial<CalendarPageTaskRow> = {}): CalendarPageTaskRow {
	return {
		id: 'task-1',
		title: 'Sign the slip',
		dueDate: '2026-03-10 09:00:00+00',
		calendarId: 'personal',
		assignedTo: 'me',
		assigneeFirstName: 'Mia',
		assigneeLastName: 'R',
		recurrenceFrequency: null,
		recurrenceInterval: null,
		...overrides
	};
}

function model(
	grid: Partial<CalendarPageGrid> = {},
	overrides: Partial<CalendarPageModel['shell']> = {}
): CalendarPageModel {
	return {
		shell: {
			viewerId: 'me',
			today: '2026-03-10',
			zone: 'UTC',
			weekStart: 'sunday',
			settings: {
				weekStart: 'sunday',
				defaultView: 'monthView',
				timeZone: 'UTC',
				color: null,
				showAdsAsEvents: false,
				defaultCalendarId: null
			},
			calendars: [
				{ id: 'personal', name: 'Personal Calendar', color: '#fa8072', kind: 'personal' },
				{ id: 'family', name: 'Riveras', color: '#e0ffff', kind: 'family' }
			],
			roster: [
				{ userId: 'me', firstName: 'Mia', lastName: 'R' },
				{ userId: 'kid', firstName: 'Leo', lastName: 'R' }
			],
			seeds: { date: null, view: null, edit: null, create: null },
			warnings: [],
			...overrides
		},
		grid: Promise.resolve({
			events: [eventRow()],
			tasks: [taskRow()],
			ads: [],
			warnings: [],
			...grid
		})
	};
}

const api = {
	listEvents: vi.fn(async () => ({
		ok: true as const,
		data: { window: { from: '2026-03-01', to: '2026-04-04' }, events: [] }
	})),
	updateEvent: vi.fn(async () => ({ ok: false as const, status: 500, error: 'no' })),
	bulkEdit: vi.fn(async () => ({ ok: false as const, status: 500, error: 'no' }))
} as unknown as CalendarApi;

async function stateOf(
	grid: Partial<CalendarPageGrid> = {},
	options: {
		shell?: Partial<CalendarPageModel['shell']>;
		storage?: FakeStorage;
		strip?: () => void;
	} = {}
): Promise<CalendarPageState> {
	const state = new CalendarPageState({
		model: model(grid, options.shell),
		api,
		toasts: memoryToasts(),
		clock: fixedClock(NOW),
		storage: options.storage ?? fakeStorage(),
		width: 1280,
		onstripquery: options.strip
	});
	await state.load(state.model);
	return state;
}

const titles = (rows: readonly { title: string | null }[]) => rows.map((row) => row.title);
const taskTitles = (rows: readonly { title: string | null }[]) => rows.map((row) => row.title);

describe('the one filter rung: calendars, then search, then people', () => {
	it('applies calendars, then search, then people to events and tasks', async () => {
		const state = await stateOf({
			events: [
				eventRow({ id: 'e1', title: 'Piano', calendarId: 'personal', ownerId: 'me' }),
				eventRow({ id: 'e2', title: 'Football practice', calendarId: 'family', ownerId: 'kid' })
			],
			tasks: [
				taskRow({ id: 't1', title: 'Kits', calendarId: 'family', assignedTo: 'kid' }),
				taskRow({ id: 't2', title: 'Slip', calendarId: 'personal', assignedTo: 'me' })
			]
		});

		expect(titles(state.visibleRows)).toEqual(['Piano', 'Football practice']);
		expect(taskTitles(state.visibleTasks)).toEqual(['Kits', 'Slip']);

		// The calendar rung narrows events AND the tasks that ride it.
		state.hiddenCalendarIds = ['family'];
		expect(titles(state.visibleRows)).toEqual(['Piano']);
		expect(taskTitles(state.visibleTasks)).toEqual(['Slip']);

		// The search rung narrows what is left; every word must match.
		state.setSearch('piano');
		expect(titles(state.visibleRows)).toEqual(['Piano']);
		state.setSearch('piano football');
		expect(titles(state.visibleRows)).toEqual([]);

		// The person rung is last, and tasks are read by their assignee.
		state.setSearch('');
		state.hiddenAssigneeIds = ['me'];
		expect(titles(state.visibleRows)).toEqual([]);
		expect(taskTitles(state.visibleTasks)).toEqual([]);
	});

	it('keeps an event that belongs to no calendar (an ad) through hide-all', async () => {
		const state = await stateOf({
			events: [],
			ads: [
				eventRow({
					id: 'ad-1',
					title: 'Toy drive',
					calendarId: null,
					ownerId: 'me',
					allDay: true
				})
			],
			tasks: []
		});

		state.hideAllCalendars(true);
		expect(titles(state.visibleRows)).toEqual(['Toy drive']);
		expect(state.showFilterEmpty).toBe(false);
		expect(state.nothingLeftToDraw).toBe(false);
	});

	it('lists a family member with nothing in this window, and says 0', async () => {
		const state = await stateOf({
			events: [eventRow({ ownerId: 'me' })],
			tasks: [],
			ads: []
		});
		state.hiddenAssigneeIds = ['me'];

		const viewer = state.assigneeRows.find((person) => person.id === 'me');
		expect(viewer?.name).toBe('You');
		expect(viewer?.count).toBe(0);
		// The member with nothing is still a row: a filter that hides its own
		// options is not a filter.
		expect(state.assigneeRows.map((person) => person.id)).toEqual(['me', 'kid']);
	});
});

describe('the empty states', () => {
	it('picks exactly one, in calendars → search → people order', async () => {
		const state = await stateOf({ events: [], tasks: [], ads: [] });

		state.hideAllCalendars(true);
		expect(state.showFilterEmpty).toBe(true);
		expect(state.showSearchEmpty).toBe(false);
		expect(state.showAssigneeEmpty).toBe(false);

		state.hideAllCalendars(false);
		state.setSearch('nothing');
		expect(state.showSearchEmpty).toBe(true);
		expect(state.showFilterEmpty).toBe(false);

		state.setSearch('');
		state.hiddenAssigneeIds = ['me', 'kid'];
		expect(state.showAssigneeEmpty).toBe(true);
		expect(state.showSearchEmpty).toBe(false);
	});

	it('never claims a filter is the cause when the family simply has nothing', async () => {
		const state = await stateOf({ events: [], tasks: [], ads: [] });
		expect(state.showFilterEmpty).toBe(false);
		expect(state.showSearchEmpty).toBe(false);
		expect(state.showAssigneeEmpty).toBe(false);
	});
});

describe('selection mode', () => {
	it('Escape leaves selection only when no modal is open', async () => {
		const state = await stateOf();
		state.setSelectionMode(true);
		state.openCreate();
		expect(state.handleEscape()).toBe(false);
		expect(state.selectionMode).toBe(true);

		state.closeCreate();
		expect(state.handleEscape()).toBe(true);
		expect(state.selectionMode).toBe(false);
	});

	it('toggles a chip by id and drops the selection when the mode ends', async () => {
		const state = await stateOf();
		state.setSelectionMode(true);
		state.toggleSelect('e1');
		state.toggleSelect('e2');
		expect([...state.selectedSet]).toEqual(['e1', 'e2']);
		state.toggleSelect('e1');
		expect([...state.selectedSet]).toEqual(['e2']);
		state.setSelectionMode(false);
		expect(state.selectedIds).toEqual([]);
	});
});

describe('the toasts', () => {
	it('toasts what a filter change did', async () => {
		const toasts = memoryToasts();
		const state = new CalendarPageState({
			model: model(),
			api,
			toasts,
			clock: fixedClock(NOW),
			storage: fakeStorage(),
			width: 1280
		});

		state.toggleCalendar('family');
		state.toggleCalendar('family');
		state.hideAllCalendars(true);
		state.hideAllCalendars(false);
		state.toggleAssignee('kid');
		state.showEveryone();

		expect(toasts.items.map((item) => item.text)).toEqual([
			'Hidden Riveras — its events and due tasks are out of every view.',
			'Showing Riveras again.',
			'All calendars hidden. Tap "Show all" to bring them back.',
			'All calendars shown.',
			'Hidden Leo — their events and due tasks are out of every view.',
			'Showing everyone again.'
		]);
	});
});

describe('the first-run card', () => {
	it('shows the first-run card only for an empty calendar (an ad is not content, Q-097 B)', async () => {
		const adOnly = await stateOf({
			events: [],
			tasks: [],
			ads: [eventRow({ id: 'ad-1', title: 'Toy drive', calendarId: null, allDay: true })]
		});
		expect(adOnly.showFirstRun).toBe(true);

		const withTask = await stateOf({ events: [], tasks: [taskRow()], ads: [] });
		expect(withTask.showFirstRun).toBe(false);

		withTask.dismissFirstRun();
		expect(withTask.showFirstRun).toBe(false);
	});
});

describe('the merged rows', () => {
	it('lets page-load rows win on the same occurrence across fetched months', async () => {
		const state = await stateOf({
			events: [eventRow({ id: 'e1', title: 'Piano (page load)' })],
			tasks: [],
			ads: []
		});
		// A fetched month repeats the same occurrence; the load's row already covers it.
		state.ranges.byMonth = {
			'2026-03': [eventRow({ id: 'e1', title: 'Piano (fetched)' })]
		};
		expect(titles(state.visibleRows)).toEqual(['Piano (page load)']);
	});
});

describe('the deep links', () => {
	it('opens Quick Add pre-parsed from the seed and strips the params once', async () => {
		const strip = vi.fn();
		const state = await stateOf(
			{},
			{
				shell: { seeds: { date: null, view: null, edit: null, create: { quickAdd: 'Lunch Friday', note: 'Shared text loaded — review and add.' } } },
				strip
			}
		);

		expect(state.createOpen).toBe(true);
		expect(state.createSeed?.quickAdd).toBe('Lunch Friday');
		expect(state.shareNote).toBe('Shared text loaded — review and add.');
		expect(strip).toHaveBeenCalledTimes(1);

		// A second load must not reopen it: the seed is read once.
		await state.load(state.model);
		expect(strip).toHaveBeenCalledTimes(1);
	});

	it('opens the linked event, else the not-found banner (Q-100)', async () => {
		const found = await stateOf(
			{ events: [eventRow({ id: 'e1', masterId: 'series-1' })] },
			{ shell: { seeds: { date: null, view: null, edit: 'series-1', create: null } } }
		);
		expect(found.editRow?.id).toBe('e1');
		expect(found.editNotFound).toBe(false);

		const missing = await stateOf(
			{ events: [eventRow({ id: 'e1' })] },
			{ shell: { seeds: { date: null, view: null, edit: 'gone', create: null } } }
		);
		expect(missing.editRow).toBe(null);
		expect(missing.editNotFound).toBe(true);
	});
});

describe('device preferences', () => {
	it('remembers the last-used view and the hidden filters for this user', async () => {
		const storage = fakeStorage();
		const first = await stateOf({}, { storage });
		first.setView('week');
		first.toggleCalendar('family');
		first.toggleAssignee('kid');

		const second = await stateOf({}, { storage });
		expect(second.view).toBe('week');
		expect(second.hiddenCalendarIds).toEqual(['family']);
		expect(second.hiddenAssigneeIds).toEqual(['kid']);
	});

	it('treats junk storage as "nothing hidden"', async () => {
		const storage = fakeStorage({ 'familyplanz:hiddenCalendars:me': '{not json' });
		const state = await stateOf({}, { storage });
		expect(state.hiddenCalendarIds).toEqual([]);
	});
});
