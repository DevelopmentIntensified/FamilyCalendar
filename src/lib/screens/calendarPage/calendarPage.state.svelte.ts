/**
 * calendarPage state: the screen's one state class.
 *
 * It owns what the legacy page and `Calendar.svelte` owned between them — the
 * date and the view, the one filter rung (hidden Calendars → search → hidden
 * people), selection mode, the modals, the deep-link seeds, the fetched-month
 * cache and the first-run card — and derives everything a view reads from the
 * typed load model (`CalendarPageModel`).
 *
 * Rules kept from legacy (`+page.svelte`, `Calendar.svelte:183-372`):
 * - selection is a `Set` for lookups, so a chip never scans an array;
 * - a row on no calendar is a Sponsored Event and survives every filter;
 * - the person counts read the rows the other filters left, so a `0` explains
 *   the empty grid;
 * - the empty states are mutually exclusive and each names its own cause;
 * - the first-run card weighs family content only (owner Q-097 B: an ad is not
 *   the family's content);
 * - every toast names what the filter change did.
 *
 * Side effects are explicit methods (no `$effect`), so the class is testable in
 * node with fake api/toasts/storage (R9).
 *
 * Doc: ./README.md#the-reading-filters
 */
import { DateTime } from 'luxon';
import { buildMovePayload, type CalendarApi } from '$lib/domains/calendar/index';
import type { Toasts } from '$lib/kernel/client/toasts.svelte';
import { localPref } from '$lib/kernel/client/localPref';
import type { Clock } from '$lib/kernel/time/clock';
import { dayKey } from '$lib/kernel/time/dates';
import {
	HIDDEN_CALENDARS_VERSION,
	hiddenCalendarNames,
	hiddenCalendarsKey,
	isVisibleByCalendar,
	parseHiddenCalendars,
	serialiseHiddenCalendars,
	setAllCalendarsHidden,
	toggleCalendarVisibility
} from './calendarPage.calendars.rules';
import type {
	CalendarCreateSeed,
	CalendarPageCalendar,
	CalendarPageEventRow,
	CalendarPageGrid,
	CalendarPageModel,
	CalendarPageTaskRow
} from './calendarPage.contract';
import {
	HIDDEN_ASSIGNEES_VERSION,
	assigneeCounts,
	assigneeRoster,
	hiddenAssigneeNames,
	hiddenAssigneesKey,
	isVisibleByAssignee,
	parseHiddenAssignees,
	serialiseHiddenAssignees,
	toggleAssigneeVisibility
} from './calendarPage.people.rules';
import {
	monthKey,
	normaliseCalendarWeekStart,
	type CalendarWeekStart
} from './calendarPage.grid.rules';
import {
	CalendarRangeCache,
	calendarRangeRowOf,
	type CalendarRangeSource
} from './calendarPage.range.state.svelte';
import { byCalendarSearch } from './calendarPage.search.rules';
import { canSwipeNavigate, resolveCalendarInitialView, type CalendarView } from './calendarPage.view.rules';
import { resolveCalendarEditLink } from './calendarPage.url.rules';
import { CalendarBulkState, type CalendarBulkReport } from './calendarPage.bulk.state.svelte';

/** The last-used view and the first-run dismissal are device preferences. */
const LAST_VIEW_KEY = 'familyplanz:lastView';
const FIRST_RUN_KEY = 'familyplanz:firstRunDismissed';

/** An Event row plus the one fact the chip needs that the row cannot infer. */
export interface CalendarPageDisplayRow extends CalendarPageEventRow {
	readonly isAd: boolean;
}

/** A day's rows, built once per rows change (kernel `groupByDay` semantics). */
export interface CalendarPageDayRows {
	readonly rows: readonly CalendarPageDisplayRow[];
	readonly tasks: readonly CalendarPageTaskRow[];
}

export type CalendarPageStateOptions = {
	readonly model: CalendarPageModel;
	readonly api: CalendarApi;
	readonly toasts: Toasts;
	readonly clock: Clock;
	readonly storage?: Pick<Storage, 'getItem' | 'setItem' | 'removeItem'> | null;
	/** The opening-view width; absent counts as wide (SSR, a broken reading). */
	readonly width?: number | null;
	/** Reloads the page data after a write (the route's `invalidateAll`). */
	readonly onrefresh?: () => Promise<void>;
	/** Strips a consumed deep-link param (the route's `replaceState`). */
	readonly onstripquery?: () => void;
	readonly onreportphrase?: CalendarBulkReport;
};

export class CalendarPageState {
	readonly ranges: CalendarRangeCache;
	readonly bulk: CalendarBulkState;

	/** The load model last handed in; `load()` awaits its `grid` promise. */
	model: CalendarPageModel;

	grid = $state<CalendarPageGrid | null>(null);
	gridFailed = $state(false);
	/** The live clock (the ticker feeds it); the constructor seeds both. */
	now = $state<Date>(new Date(0));
	date = $state<DateTime>(DateTime.fromMillis(0));
	view = $state<CalendarView>('month');
	search = $state('');
	hiddenCalendarIds = $state<string[]>([]);
	hiddenAssigneeIds = $state<string[]>([]);
	selectionMode = $state(false);
	selectedIds = $state<string[]>([]);
	/** Add mode (#047): a touch drag on a grid paints a range immediately. */
	addMode = $state(false);
	/** The inline "exit selection to move this event?" ask a drag raises. */
	exitAsk = $state(false);
	/** A failed drag-move's copy, shown above the grid. */
	moveError = $state('');
	filtersOpen = $state(false);
	createOpen = $state(false);
	createSeed = $state<CalendarCreateSeed | null>(null);
	createStart = $state<DateTime | null>(null);
	editRowId = $state<string | null>(null);
	editNotFound = $state(false);
	daySheetDate = $state<DateTime | null>(null);
	dayListDate = $state<DateTime | null>(null);
	/** The task whose detail sheet is open (tasks' component, this screen opens it). */
	taskDetailId = $state<string | null>(null);
	shareNote = $state('');
	firstRunDismissed = $state(false);

	private readonly clock: Clock;
	/** Calendar's client api: the modals and the grids write through it. */
	readonly api: CalendarApi;
	/** The kernel toaster: every acknowledgement goes through it. */
	readonly toasts: Toasts;
	private readonly onrefresh: () => Promise<void>;
	private readonly onstripquery: (() => void) | undefined;
	private readonly writeHiddenCalendars: (ids: readonly string[]) => void;
	private readonly writeHiddenAssignees: (ids: readonly string[]) => void;
	private readonly loadRange: CalendarRangeSource | null;
	private readonly lastView: { read(): string | null; write(value: string | null): void };
	private readonly firstRun: { read(): boolean; write(value: boolean): void };
	private loadGeneration = 0;
	private seededOnce = false;
	private previousView: CalendarView = 'month';

	constructor(options: CalendarPageStateOptions) {
		const { shell } = options.model;
		this.model = options.model;
		this.clock = options.clock;
		this.api = options.api;
		this.toasts = options.toasts;
		this.onrefresh = options.onrefresh ?? (async () => {});
		this.onstripquery = options.onstripquery;

		this.lastView = localPref<string | null>({
			key: LAST_VIEW_KEY,
			version: 1,
			fallback: null,
			parse: (raw) => (typeof raw === 'string' ? raw : null),
			storage: options.storage
		});
		this.firstRun = localPref<boolean>({
			key: FIRST_RUN_KEY,
			version: 1,
			fallback: false,
			parse: (raw) => (typeof raw === 'boolean' ? raw : null),
			storage: options.storage
		});
		// The filter keys are per user on this device (#069/#127): a reading
		// preference, never account data.
		const calendarPref = localPref<string[]>({
			key: hiddenCalendarsKey(shell.viewerId),
			version: HIDDEN_CALENDARS_VERSION,
			fallback: [],
			parse: (raw) => parseHiddenCalendars(raw),
			storage: options.storage
		});
		const peoplePref = localPref<string[]>({
			key: hiddenAssigneesKey(shell.viewerId),
			version: HIDDEN_ASSIGNEES_VERSION,
			fallback: [],
			parse: (raw) => parseHiddenAssignees(raw),
			storage: options.storage
		});

		const zone = shell.zone || 'UTC';
		const today = DateTime.fromISO(shell.today, { zone });
		this.now = this.clock.now();
		this.date = (shell.seeds.date ? DateTime.fromISO(shell.seeds.date, { zone }) : today).startOf(
			'day'
		);
		this.view = resolveCalendarInitialView(
			shell.seeds.view ?? undefined,
			shell.settings.defaultView,
			this.lastView.read(),
			options.width
		);
		this.hiddenCalendarIds = calendarPref.read();
		this.hiddenAssigneeIds = peoplePref.read();
		this.firstRunDismissed = this.firstRun.read();
		this.writeHiddenCalendars = (ids) => calendarPref.write(serialiseHiddenCalendars(ids));
		this.writeHiddenAssignees = (ids) => peoplePref.write(serialiseHiddenAssignees(ids));

		this.loadRange = (from, to) =>
			options.api.listEvents(from, to).then((result) => {
				if (!result.ok) throw new Error(result.error);
				return result.data.events.map(calendarRangeRowOf);
			});
		this.ranges = new CalendarRangeCache({
			weekStart: normaliseCalendarWeekStart(shell.weekStart),
			zone,
			serverLoadedMonths: [monthKey(this.date)],
			toasts: options.toasts
		});
		this.bulk = new CalendarBulkState({
			api: options.api,
			toasts: options.toasts,
			calendars: shell.calendars,
			events: () => this.rows,
			todayKey: () => this.todayKey,
			onapplied: async () => {
				this.setSelectionMode(false);
				await this.onrefresh();
			},
			report: options.onreportphrase
		});
	}

	// --- Facts ----------------------------------------------------------------

	get shell() {
		return this.model.shell;
	}

	get zone(): string {
		return this.shell.zone || 'UTC';
	}

	get weekStart(): CalendarWeekStart {
		return normaliseCalendarWeekStart(this.shell.weekStart);
	}

	get todayKey(): string {
		return dayKey(this.now, this.zone);
	}

	get monthOnScreen(): string {
		return monthKey(this.date);
	}

	/** The period on screen is this one — the toolbar's Today reads as current. */
	get onCurrentPeriod(): boolean {
		const now = DateTime.fromJSDate(this.now, { zone: this.zone });
		const unit = this.view === 'month' ? 'month' : this.view === 'week' ? 'week' : 'day';
		return this.date.hasSame(now, unit);
	}

	selectedSet = $derived(new Set(this.selectedIds));

	// --- Rows and the one filter rung ----------------------------------------

	/**
	 * Every row the grid can draw. Page-load rows come first and win on a
	 * duplicate occurrence key (`masterId|day`), then the fetched months, then
	 * the Sponsored Events — which are marked so no filter can mistake one for
	 * a plan.
	 */
	rows = $derived.by((): CalendarPageDisplayRow[] => {
		const grid = this.grid;
		if (!grid) return [];
		const seen = new Set<string>();
		const out: CalendarPageDisplayRow[] = [];
		const push = (row: CalendarPageEventRow, isAd: boolean) => {
			const key = `${row.masterId ?? row.id}|${dayKey(row.date, this.zone)}`;
			if (seen.has(key)) return;
			seen.add(key);
			out.push({ ...row, isAd });
		};
		for (const row of grid.events) push(row, false);
		for (const row of this.ranges.rows()) push(row, false);
		for (const row of grid.ads) push(row, true);
		return out;
	});

	tasks = $derived<CalendarPageTaskRow[]>(this.grid?.tasks ?? []);

	/** Rows the calendar filter keeps (an ad has no calendar and always survives). */
	private calendarRows = $derived(isVisibleByCalendar(this.rows, this.hiddenCalendarIds));

	private calendarTasks = $derived(isVisibleByCalendar(this.tasks, this.hiddenCalendarIds));

	/** Rows the search keeps; an empty query keeps everything (never persisted). */
	searchRows = $derived(byCalendarSearch(this.calendarRows, this.search));

	private searchTasks = $derived(byCalendarSearch(this.calendarTasks, this.search));

	/** What the grid actually draws: the person filter is the last rung. */
	visibleRows = $derived(isVisibleByAssignee(this.searchRows, this.hiddenAssigneeIds));

	visibleTasks = $derived(isVisibleByAssignee(this.searchTasks, this.hiddenAssigneeIds));

	/** A day's rows, built once per rows change. */
	days = $derived.by((): Map<string, CalendarPageDayRows> => {
		const map = new Map<string, CalendarPageDayRows>();
		for (const row of this.visibleRows) {
			const key = dayKey(row.date, this.zone);
			const bucket = map.get(key) ?? { rows: [], tasks: [] };
			map.set(key, { rows: [...bucket.rows, row], tasks: bucket.tasks });
		}
		for (const task of this.visibleTasks) {
			const key = dayKey(task.dueDate, this.zone);
			const bucket = map.get(key) ?? { rows: [], tasks: [] };
			map.set(key, { rows: bucket.rows, tasks: [...bucket.tasks, task] });
		}
		return map;
	});

	/** The person filter's rows: the loaded roster ∪ everyone with a row. */
	assignees = $derived(
		assigneeRoster(this.rows, this.tasks, this.shell.viewerId, this.shell.roster)
	);

	/** Counts read the rows the other filters left, so a 0 explains a blank grid. */
	assigneeRows = $derived.by(() => {
		const tally = assigneeCounts(this.visibleRows, this.visibleTasks);
		return this.assignees.map((person) => ({ ...person, count: tally.get(person.id) ?? 0 }));
	});

	hiddenCalendarLabels = $derived(
		hiddenCalendarNames(this.shell.calendars, this.hiddenCalendarIds)
	);

	hiddenAssigneeLabels = $derived(hiddenAssigneeNames(this.assignees, this.hiddenAssigneeIds));

	searchMatches = $derived(this.visibleRows.length + this.visibleTasks.length);

	searchTotal = $derived(this.calendarRows.length + this.calendarTasks.length);

	/** Every calendar switched off AND nothing left to draw (an ad is a survivor). */
	allCalendarsHidden = $derived(
		this.shell.calendars.length > 0 &&
			this.shell.calendars.every((calendar) => this.hiddenCalendarIds.includes(calendar.id))
	);

	nothingLeftToDraw = $derived(this.visibleRows.length === 0 && this.visibleTasks.length === 0);

	showFilterEmpty = $derived(this.allCalendarsHidden && this.nothingLeftToDraw);

	showSearchEmpty = $derived(
		this.search.trim().length > 0 &&
			!this.showFilterEmpty &&
			this.visibleRows.length === 0 &&
			this.visibleTasks.length === 0
	);

	showAssigneeEmpty = $derived(
		this.hiddenAssigneeIds.length > 0 &&
			!this.showFilterEmpty &&
			!this.showSearchEmpty &&
			this.visibleRows.length === 0 &&
			this.visibleTasks.length === 0
	);

	/** Family content only: Sponsored Events do not count (owner Q-097 B). */
	showFirstRun = $derived(
		this.grid !== null &&
			!this.firstRunDismissed &&
			this.grid.events.length === 0 &&
			this.grid.tasks.length === 0
	);

	/** The row `?edit=` resolved to, once rows land. */
	editRow = $derived(
		this.editRowId
			? (this.rows.find((row) => row.id === this.editRowId || row.masterId === this.editRowId) ??
				null)
			: null
	);

	/** The day list `+N more` opened, with its rows and due Tasks. */
	dayList = $derived(
		this.dayListDate
			? (this.days.get(dayKey(this.dayListDate.toJSDate(), this.zone)) ?? { rows: [], tasks: [] })
			: null
	);

	/** The day sheet the month cell opened, with the day's Events. */
	daySheet = $derived(
		this.daySheetDate
			? (this.days.get(dayKey(this.daySheetDate.toJSDate(), this.zone))?.rows ?? [])
			: []
	);

	// --- Loading and deep links ----------------------------------------------

	/**
	 * Await the load model's `grid`. A newer load makes an older one stale
	 * (navigation or `invalidateAll` can overlap); after a reload the fetched
	 * months are stale too, so the cache is invalidated around the month on
	 * screen — whose rows stay drawn until the replacement lands.
	 */
	async load(model: CalendarPageModel): Promise<void> {
		this.model = model;
		const generation = ++this.loadGeneration;
		const reload = this.seededOnce;
		this.gridFailed = false;
		try {
			const grid = await model.grid;
			if (generation !== this.loadGeneration) return;
			if (reload) this.ranges.invalidate(this.monthOnScreen);
			this.grid = grid;
			if (!this.seededOnce) {
				this.seededOnce = true;
				this.applySeeds();
			}
			this.syncRange();
		} catch {
			if (generation === this.loadGeneration) this.gridFailed = true;
		}
	}

	/** `?edit=`/`?quickadd=` are read once; the params are stripped after. */
	private applySeeds(): void {
		const { seeds } = this.model.shell;
		if (seeds.create) {
			this.createSeed = seeds.create;
			this.createStart = null;
			this.createOpen = true;
			this.shareNote = seeds.create.note;
		}
		if (seeds.edit) {
			const found = resolveCalendarEditLink(seeds.edit, this.rows);
			if (found) this.openEdit(found.id);
			else this.editNotFound = true;
		}
		if (seeds.create || seeds.edit) this.onstripquery?.();
	}

	/** Ask for the month on screen's rows, if it is not the one the load covered. */
	syncRange(): void {
		if (!this.loadRange) return;
		void this.ranges.request(this.monthOnScreen, this.loadRange);
	}

	/** The kernel ticker hands the live clock in, so no render reads one (R5). */
	tick(now: Date): void {
		this.now = now;
	}

	// --- Navigation -----------------------------------------------------------

	setView(view: CalendarView): void {
		this.view = view;
		this.lastView.write(view);
	}

	openDay(day: DateTime): void {
		if (this.view !== 'day') this.previousView = this.view;
		this.date = day.startOf('day');
		this.view = 'day';
		this.lastView.write('day');
		this.daySheetDate = null;
		this.syncRange();
	}

	backFromDay(): void {
		this.setView(this.previousView === 'day' ? 'month' : this.previousView);
	}

	private step(unit: 'month' | 'week' | 'day', direction: 1 | -1): void {
		this.date = direction > 0 ? this.date.plus({ [unit]: 1 }) : this.date.minus({ [unit]: 1 });
		this.syncRange();
	}

	goToday(): void {
		this.date = DateTime.fromJSDate(this.now, { zone: this.zone }).startOf('day');
		this.syncRange();
	}

	goPrevious(): void {
		this.step(this.view === 'day' ? 'day' : this.view === 'week' ? 'week' : 'month', -1);
	}

	goNext(): void {
		this.step(this.view === 'day' ? 'day' : this.view === 'week' ? 'week' : 'month', 1);
	}

	/** Swipe: month-only (#048) — a week/day fling pans, the list scrolls. */
	swipe(dx: number, dy: number): void {
		if (!canSwipeNavigate(this.view, dx, dy)) return;
		if (dx < 0) this.goNext();
		else this.goPrevious();
	}

	selectMonth(month: number): void {
		this.date = this.date.set({ month });
		this.syncRange();
	}

	selectYear(year: number): void {
		this.date = this.date.set({ year });
		this.syncRange();
	}

	// --- The reading filters ---------------------------------------------------

	setSearch(query: string): void {
		this.search = query;
	}

	toggleCalendar(id: string): void {
		const next = toggleCalendarVisibility(this.hiddenCalendarIds, id);
		this.hiddenCalendarIds = next;
		this.writeHiddenCalendars(next);
		const name =
			this.shell.calendars.find((calendar) => calendar.id === id)?.name ?? 'that calendar';
		this.toasts.success(
			next.includes(id)
				? `Hidden ${name} — its events and due tasks are out of every view.`
				: `Showing ${name} again.`
		);
	}

	hideAllCalendars(hide: boolean): void {
		const next = setAllCalendarsHidden(this.shell.calendars, hide);
		this.hiddenCalendarIds = next;
		this.writeHiddenCalendars(next);
		this.toasts.success(
			hide ? 'All calendars hidden. Tap "Show all" to bring them back.' : 'All calendars shown.'
		);
	}

	toggleAssignee(id: string): void {
		const next = toggleAssigneeVisibility(this.hiddenAssigneeIds, id);
		this.hiddenAssigneeIds = next;
		this.writeHiddenAssignees(next);
		const name = this.assignees.find((person) => person.id === id)?.name ?? 'That person';
		this.toasts.success(
			next.includes(id)
				? `Hidden ${name} — their events and due tasks are out of every view.`
				: `Showing ${name} again.`
		);
	}

	showEveryone(): void {
		this.hiddenAssigneeIds = [];
		this.writeHiddenAssignees([]);
		this.toasts.success('Showing everyone again.');
	}

	// --- Selection, modals, the first-run card --------------------------------

	setSelectionMode(on: boolean): void {
		this.selectionMode = on;
		this.selectedIds = [];
		this.bulk.reset();
		this.daySheetDate = null;
	}

	toggleSelect(id: string): void {
		this.selectedIds = this.selectedIds.includes(id)
			? this.selectedIds.filter((entry) => entry !== id)
			: [...this.selectedIds, id];
	}

	/** Escape leaves selection only when no modal is open (legacy `+page.svelte:175`). */
	handleEscape(): boolean {
		if (this.selectionMode && !this.createOpen && !this.editRowId) {
			this.setSelectionMode(false);
			return true;
		}
		return false;
	}

	openCreate(start: DateTime | null = null): void {
		this.createSeed = null;
		this.createStart = start;
		this.createOpen = true;
	}

	/**
	 * "Create event from selection": the picked text drives Quick Add, exactly
	 * like the share target's seed.
	 */
	openCreateFromText(text: string): void {
		const trimmed = text.trim();
		if (!trimmed) return;
		this.openCreate();
		this.createSeed = { quickAdd: trimmed, note: '' };
	}

	closeCreate(): void {
		this.createOpen = false;
		this.createSeed = null;
		this.createStart = null;
		this.shareNote = '';
	}

	openEdit(id: string): void {
		this.editRowId = id;
		this.editNotFound = false;
	}

	closeEdit(): void {
		this.editRowId = null;
	}

	/** Add mode and Selection mode are mutually exclusive (#047). */
	setAddMode(on: boolean): void {
		this.addMode = on;
		if (on) this.setSelectionMode(false);
	}

	/** A drag inside Selection mode asks before leaving it. */
	raiseExitAsk(): void {
		this.exitAsk = true;
	}

	confirmExitSelection(): void {
		this.exitAsk = false;
		this.setSelectionMode(false);
	}

	stayInSelection(): void {
		this.exitAsk = false;
	}

	/**
	 * A drop moves the Event (duration preserved) through calendar's `PUT`, then
	 * reloads. Calendar mode never moves an Event — a drag there asks first.
	 */
	async moveEvent(row: CalendarPageDisplayRow, day: DateTime, minutes: number): Promise<void> {
		if (this.selectionMode) {
			this.raiseExitAsk();
			return;
		}
		this.moveError = '';
		const targetId = row.masterId || row.id;
		try {
			const result = await this.api.updateEvent(
				targetId,
				buildMovePayload(
					{
						id: row.id,
						start: row.start ?? '',
						end: row.end,
						title: row.title ?? '',
						description: row.description,
						location: row.location,
						masterId: row.masterId,
						recurrenceFrequency: row.recurrenceFrequency,
						occurrenceDate: row.occurrenceDate
					},
					{ day, minutes }
				)
			);
			if (!result.ok) {
				this.moveError = result.error || 'Could not move the event. Try again.';
				return;
			}
			await this.refresh();
		} catch {
			this.moveError = 'Could not move the event. Try again.';
		}
	}

	openDaySheet(day: DateTime): void {
		this.daySheetDate = day;
	}

	openDayList(day: DateTime): void {
		this.dayListDate = day;
	}

	/** The due Task a chip tapped, from the rows the grid already holds. */
	taskDetail = $derived(
		this.taskDetailId ? (this.tasks.find((task) => task.id === this.taskDetailId) ?? null) : null
	);

	openTaskDetail(id: string): void {
		this.taskDetailId = id;
	}

	closeTaskDetail(): void {
		this.taskDetailId = null;
	}

	dismissFirstRun(): void {
		this.firstRunDismissed = true;
		this.firstRun.write(true);
	}

	async refresh(): Promise<void> {
		await this.onrefresh();
	}

	/** The calendar a chip resolves its colour from (personal or family). */
	calendarOf(id: string | null): CalendarPageCalendar | undefined {
		return id ? this.shell.calendars.find((calendar) => calendar.id === id) : undefined;
	}
}
