<script lang="ts">
	import { onMount } from 'svelte';
	import { type Writable, get } from 'svelte/store';
	import { DateTime, Info } from 'luxon';
	import type { Event } from '$lib/types';
	import MonthView from './MonthView.svelte';
	import ListView from './ListView.svelte';
	import WeekView from './WeekView.svelte';
	import DayView from './DayView.svelte';
	import DailyVerseCard from './DailyVerseCard.svelte';
	import CalendarToolbar from './CalendarToolbar.svelte';
	import { resolveInitialView, shouldSwipeNavigate, isCurrentPeriod, type CalendarView } from './calendarView';
	import {
		hiddenCalendarNames,
		isCalendarHidden,
		loadHiddenCalendars,
		saveHiddenCalendars,
		setAllCalendarsHidden,
		toggleCalendarVisibility,
		visibleByCalendar
	} from '$lib/utils/calendarVisibility';
	import { bySearch } from '$lib/utils/calendarSearch';
	import {
		assigneeCounts,
		assigneeRoster,
		hiddenAssigneeNames,
		loadHiddenAssignees,
		saveHiddenAssignees,
		toggleAssigneeVisibility,
		visibleByAssignee
	} from '$lib/utils/calendarAssignees';
	import { pushToast } from '$lib/client/toasts';

	export let currentDate: Writable<DateTime>;
	export let events: Event[] = [];
	export let removeEvent: (id: string) => void = () => {};
	export let preferedFirstDayOfWeek: string = 'sunday';
	export let calendarIds: { id: string; name: string; color?: string }[] = [];
	/** #069: the filter is stored per user on THIS device, so the key needs
	 *  the user id. It is a reading preference, not account data. */
	export let filterUserId: string | null = null;
	/** #127: the family roster the page already loaded, so the person filter can
	 *  list a member with nothing in this window (count 0) and can name one
	 *  whose only rows are personal-calendar events. Absent = derive the roster
	 *  from the rows alone, which is what the filter did before. */
	export let familyMembers: { userId: string; firstName: string }[] = [];
	export let defaultViewSetting: string = 'monthView';
	export let initialView: string | undefined = undefined;
	export let dueTasks: {
		id: string;
		title: string;
		dueDate: Date | string;
		/** #069: which calendar this task rides with, so hiding a calendar
		 *  takes its due tasks with it. */
		calendarId?: string | null;
		recurrenceFrequency?: string | null;
		recurrenceInterval?: number | null;
	}[] = [];
	export let createAt: (date: DateTime, end?: DateTime) => void = () => {};
	export let selectionMode: boolean = false;
	// Add mode (#047): explicit mobile range-select. Touch-drag on the
	// week/day grid selects a time range immediately (no long-press, no
	// scroll fight); default touch still scrolls. Mutually exclusive
	// with bulk-selection mode.
	let addMode = false;

	function toggleAddMode(on: boolean) {
		addMode = on;
		if (on) onToggleSelectionMode(false);
	}

	// Parent-owned bulk-select wins when re-enabled externally.
	$: if (selectionMode && addMode) addMode = false;
	export let selectedIds: string[] = [];
	export let onToggleSelectionMode: (on: boolean) => void = () => {};
	export let onToggleSelect: (event: Event) => void = () => {};
	export let dailyVerse: {
		reference: string;
		text: string;
		attribution?: string;
	} | null = null;

	type View = CalendarView;

	// Restore last-used view from localStorage (SSR-safe: null on server).
	let storedView: string | null = null;
	try {
		storedView = localStorage.getItem('familyplanz:lastView');
	} catch {
		/* SSR / private browsing */
	}

	// #104: the width, read in the same breath and for the same reason — the
	// opening view is the ONE decision the width gets a vote in, and it is
	// decided here, once. Resizing never re-runs it: a phone is a reason to
	// pick an opening, not to move somebody who is already looking at a view.
	let viewportWidth: number | null = null;
	try {
		viewportWidth = window.innerWidth;
	} catch {
		/* SSR / private browsing — resolveInitialView reads null as "wide",
		   which is exactly today's behaviour. */
	}

	let view: View = resolveInitialView(initialView, defaultViewSetting, storedView, viewportWidth);
	let previousView: 'month' | 'week' | 'list' = 'month';

	function goToday() {
		currentDate.set(DateTime.now());
	}

	function goPrevious() {
		if (view === 'day') {
			currentDate.update((d) => d.minus({ day: 1 }));
		} else if (view === 'week') {
			currentDate.update((d) => d.minus({ week: 1 }));
		} else {
			currentDate.update((d) => d.minus({ month: 1 }));
		}
	}

	function goNext() {
		if (view === 'day') {
			currentDate.update((d) => d.plus({ day: 1 }));
		} else if (view === 'week') {
			currentDate.update((d) => d.plus({ week: 1 }));
		} else {
			currentDate.update((d) => d.plus({ month: 1 }));
		}
	}

	function changeView(newView: View) {
		view = newView;
		try {
			localStorage.setItem('familyplanz:lastView', newView);
		} catch {
			/* localStorage unavailable (private mode) — view still switches */
		}
	}

	function openDay(date: DateTime) {
		if (view !== 'day') previousView = view;
		currentDate.set(date);
		view = 'day';
		try {
			localStorage.setItem('familyplanz:lastView', 'day');
		} catch {
			/* localStorage unavailable (private mode) — day view still opens */
		}
	}

	function backFromDay() {
		view = previousView;
		try {
			localStorage.setItem('familyplanz:lastView', previousView);
		} catch {
			/* localStorage unavailable (private mode) — fallback view still applies */
		}
	}

	function handleMonthSelect(month: number) {
		const current = get(currentDate).set({ month });
		currentDate.set(current);
	}

	function handleYearSelect(year: number) {
		const current = get(currentDate).set({ year });
		currentDate.set(current);
	}

	// ---- #069: per-calendar view filter ----
	// A VIEW filter: it says what to draw, not where new events land. The
	// default-calendar setting (`defaultCalendarId`, read by the create form)
	// is a different concern on a different store, and nothing here writes it.
	// Read after mount so the server HTML and the hydrated DOM agree; the read
	// is one synchronous localStorage get in the same tick as hydration.
	let hiddenCalendarIds: string[] = [];
	// #127 mark 1.11 — the person filter. A second reading filter on its own
	// key, in the same sense and with the same rules as the calendar one: it
	// says what to draw, it is stored per user on THIS device, and it never
	// decides where a new event or an assignment lands.
	let hiddenAssigneeIds: string[] = [];

	onMount(() => {
		hiddenCalendarIds = loadHiddenCalendars(window.localStorage, filterUserId);
		hiddenAssigneeIds = loadHiddenAssignees(window.localStorage, filterUserId);
	});

	function persistHidden(next: string[]) {
		hiddenCalendarIds = next;
		saveHiddenCalendars(window.localStorage, filterUserId, next);
	}

	function persistHiddenAssignees(next: string[]) {
		hiddenAssigneeIds = next;
		saveHiddenAssignees(window.localStorage, filterUserId, next);
	}

	function handleToggleCalendar(id: string) {
		const next = toggleCalendarVisibility(hiddenCalendarIds, id);
		persistHidden(next);
		const name = calendarIds.find((c) => c.id === id)?.name ?? 'that calendar';
		const nowHidden = next.includes(id);
		pushToast({
			message: nowHidden
				? `Hidden ${name} — its events and due tasks are out of every view.`
				: `Showing ${name} again.`
		});
	}

	function handleSetAllHidden(hide: boolean) {
		persistHidden(setAllCalendarsHidden(calendarIds, hide));
		pushToast(
			hide
				? { message: 'All calendars hidden. Tap "Show all" to bring them back.' }
				: { message: 'All calendars shown.' }
		);
	}

	// ---- #127: the person filter, owned here like the calendar one ----
	// The roster is the loaded family roster PLUS everyone with something here,
	// so a member with a clear month is a row that says 0 rather than a gap. The
	// counts come from the filtered rows, so a 0 is the reason the grid is empty.
	$: assignees = assigneeRoster(events, dueTasks, filterUserId, familyMembers);
	$: assigneeTally = assigneeCounts(visibleEvents, visibleTasks);
	$: assigneeRows = assignees.map((person) => ({
		...person,
		count: assigneeTally.get(person.id) ?? 0
	}));

	function handleToggleAssignee(id: string) {
		const next = toggleAssigneeVisibility(hiddenAssigneeIds, id);
		persistHiddenAssignees(next);
		const name = assignees.find((p) => p.id === id)?.name ?? 'That person';
		pushToast({
			message: next.includes(id)
				? `Hidden ${name} — their events and due tasks are out of every view.`
				: `Showing ${name} again.`
		});
	}

	function handleShowAllAssignees() {
		persistHiddenAssignees([]);
		pushToast({ message: 'Showing everyone again.' });
	}

	// ONE filter, applied above the views, so month, week, day and list can
	// never disagree about what is hidden. Tasks ride the same predicate.
	// #127 adds a SECOND reading filter on the same rung: the calendars, then
	// the query, then the people. They compose (each narrows the last) and none
	// of them replaces another.
	let searchQuery = '';
	$: calendarEvents = visibleByCalendar(events, hiddenCalendarIds);
	$: calendarTasks = visibleByCalendar(dueTasks, hiddenCalendarIds);
	$: unassignedEvents = bySearch(calendarEvents, searchQuery);
	$: unassignedTasks = bySearch(calendarTasks, searchQuery);
	$: visibleEvents = visibleByAssignee(unassignedEvents, hiddenAssigneeIds);
	$: visibleTasks = visibleByAssignee(unassignedTasks, hiddenAssigneeIds);

	// #120: search is a reading filter like the others — the page owns the
	// query, the toolbar only owns the field, so the two compose in one place
	// and the grid is the last word on what gets drawn. The "N of M" line
	// counts what is left of what the OTHER filters allow, so a person filter
	// moves N and never M.
	$: searchMatches = visibleEvents.length + visibleTasks.length;
	$: searchTotal = calendarEvents.length + calendarTasks.length;
	$: allCalendarsHidden =
		calendarIds.length > 0 && calendarIds.every((c) => isCalendarHidden(c.id, hiddenCalendarIds));
	// The empty state is for "you turned everything off and there is literally
	// nothing left to draw" — not merely "everything is off". A sponsored
	// event belongs to no calendar, so it survives hide-all; when one is on
	// screen the grid is not blank and an empty state would be a lie. Neither
	// is an empty week with calendars shown.
	// Search is NOT folded into this: a query that matches nothing is not the
	// same claim as a calendar being switched off, and reusing this card would
	// say "Every calendar is hidden" about a calendar that is very much on.
	$: nothingLeftToDraw = visibleEvents.length === 0 && visibleTasks.length === 0;
	$: showFilterEmpty = allCalendarsHidden && nothingLeftToDraw;
	$: hiddenNames = hiddenCalendarNames(calendarIds, hiddenCalendarIds);
	// …and a search that finds nothing gets its own words, because a blank
	// grid reads as "nothing scheduled", which is a different and wrong thing
	// to tell a family.
	$: showSearchEmpty =
		searchQuery.trim().length > 0 && !showFilterEmpty && visibleEvents.length === 0 && visibleTasks.length === 0;
	// #127: and a PERSON filter that matches nothing gets its own words too, for
	// the same reason — "Every calendar is hidden" about a calendar that is very
	// much on would be a lie, and so would reusing that card for a person. It is
	// last of the three so each card only ever appears for its own claim.
	$: hiddenAssigneeLabels = hiddenAssigneeNames(assignees, hiddenAssigneeIds);
	$: showAssigneeEmpty =
		hiddenAssigneeIds.length > 0 &&
		!showFilterEmpty &&
		!showSearchEmpty &&
		visibleEvents.length === 0 &&
		visibleTasks.length === 0;

	// Swipe / edge navigation
	let touchStartX = 0;
	let touchStartY = 0;

	function handleTouchStart(e: TouchEvent) {
		touchStartX = e.touches[0].clientX;
		touchStartY = e.touches[0].clientY;
	}

	function handleTouchEnd(e: TouchEvent) {
		const touch = e.changedTouches[0];
		const dx = touch.clientX - touchStartX;
		const dy = touch.clientY - touchStartY;
		// Month-only: week/day grids pan horizontally, so a fling there
		// is a pan, not navigation (#048).
		if (!shouldSwipeNavigate(view, dx, dy)) return;
		if (dx < 0) goNext();
		else goPrevious();
	}

	$: currentMonthYear = $currentDate.toFormat('MMMM yyyy');
	$: currentYear = $currentDate.year;
	$: currentMonth = $currentDate.month;
	$: months = Info.months('long');
	// #119: the page owns the date store and the view, so the page is what can
	// say whether the period on screen is this one. The shared DayNav mutes
	// Today when it is — a control that is still the way back, never hidden.
	$: onCurrentPeriod = isCurrentPeriod(view, $currentDate, DateTime.now());
</script>

<div class="mb-2 bg-white pt-4">
	<CalendarToolbar
		{currentMonthYear}
		{currentYear}
		{currentMonth}
		{months}
		{view}
		{selectionMode}
		{addMode}
		calendars={calendarIds}
		{hiddenCalendarIds}
		dashboardDate={$currentDate.toISODate() ?? ''}
		isCurrentPeriod={onCurrentPeriod}
		onToday={goToday}
		onPrevious={goPrevious}
		onNext={goNext}
		onMonthSelect={handleMonthSelect}
		onYearSelect={handleYearSelect}
		onViewChange={changeView}
		{onToggleSelectionMode}
		onToggleAddMode={toggleAddMode}
		onToggleCalendar={handleToggleCalendar}
		onSetAllHidden={handleSetAllHidden}
		assignees={assigneeRows}
		{hiddenAssigneeIds}
		onToggleAssignee={handleToggleAssignee}
		onShowAllAssignees={handleShowAllAssignees}
		{searchQuery}
		{searchMatches}
		{searchTotal}
		onSearch={(q) => (searchQuery = q)}
	/>
	<div
		class="group/cal relative mx-auto w-full max-w-screen-2xl px-2 sm:px-4 lg:px-8"
		ontouchstart={handleTouchStart}
		ontouchend={handleTouchEnd}
	>
		{#if dailyVerse}
			<div class="mb-3">
				<DailyVerseCard
					reference={dailyVerse.reference}
					text={dailyVerse.text}
					attribution={dailyVerse.attribution}
				/>
			</div>
		{/if}
		<!-- #119: these hover arrows sit over the grid, and below `md` a cell tap
		     opens the day-action sheet instead. `md`, so they never land on a cell
		     that is in sheet mode. -->
		<button
			onclick={goPrevious}
			aria-label="Previous period"
			class="absolute -left-1 top-1/2 z-20 hidden h-9 w-9 -translate-y-1/2 items-center justify-center rounded-full border border-slate-200 bg-white text-slate-600 opacity-0 shadow-md transition-opacity hover:bg-slate-50 focus-visible:opacity-100 group-hover/cal:opacity-100 md:flex"
		>
			<svg class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
				<path stroke-linecap="round" stroke-linejoin="round" d="M15 19l-7-7 7-7" />
			</svg>
		</button>
		<button
			onclick={goNext}
			aria-label="Next period"
			class="absolute -right-1 top-1/2 z-20 hidden h-9 w-9 -translate-y-1/2 items-center justify-center rounded-full border border-slate-200 bg-white text-slate-600 opacity-0 shadow-md transition-opacity hover:bg-slate-50 focus-visible:opacity-100 group-hover/cal:opacity-100 md:flex"
		>
			<svg class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
				<path stroke-linecap="round" stroke-linejoin="round" d="M9 5l7 7-7 7" />
			</svg>
		</button>
		{#if showFilterEmpty}
			<!-- #069: hiding everything is a choice, not an empty calendar. Say
				so, name what is off, and make the way back one tap. It replaces
				the grid on purpose: a blank grid reads as "nothing scheduled",
				which is a different (and wrong) thing to tell a family. -->
			<div
				class="flex flex-col items-center px-2 py-14 text-center sm:py-20"
				data-testid="calendar-filter-empty"
			>
				<svg
					class="mb-4 h-12 w-12 text-slate-300"
					fill="none"
					viewBox="0 0 24 24"
					stroke="currentColor"
					stroke-width="1.5"
					aria-hidden="true"
				>
					<path
						stroke-linecap="round"
						stroke-linejoin="round"
						d="M3 5h18M6 12h12M10 19h4"
					/>
				</svg>
				<p class="text-[11px] font-semibold uppercase tracking-wide text-slate-400">
					Filtered
				</p>
				<h2 class="mt-1 max-w-[16rem] text-lg font-medium text-slate-700 sm:max-w-none">
					Every calendar is hidden
				</h2>
				<p class="mt-2 max-w-sm text-sm leading-relaxed text-slate-500">
					{hiddenNames.length > 0
						? `${hiddenNames.join(', ')} ${hiddenNames.length === 1 ? 'is' : 'are'} hidden.`
						: 'Every calendar is hidden.'}
					Nothing is drawn until you turn one back on — your events and due tasks are all
					still here.
				</p>
				<button
					type="button"
					data-testid="calendar-filter-show-all"
					onclick={() => handleSetAllHidden(false)}
					class="mt-5 rounded-lg bg-primary-600 px-4 py-2.5 text-sm font-medium text-white transition-all hover:bg-primary-700 active:scale-[0.98]"
				>
					Show all calendars
				</button>
			</div>
		{:else if showSearchEmpty}
			<!-- #120: a search that matched nothing is not a calendar switched
				off, and it is not an empty month. It says so, and the way back is
				one tap. -->
			<div
				class="flex flex-col items-center px-2 py-14 text-center sm:py-20"
				data-testid="search-empty"
			>
				<svg
					class="mb-4 h-12 w-12 text-slate-300"
					fill="none"
					viewBox="0 0 24 24"
					stroke="currentColor"
					stroke-width="1.5"
					aria-hidden="true"
				>
					<path
						stroke-linecap="round"
						stroke-linejoin="round"
						d="M21 21l-4.35-4.35M17 11a6 6 0 11-12 0 6 6 0 0112 0z"
					/>
				</svg>
				<p class="text-[11px] font-semibold uppercase tracking-wide text-slate-400">
					Searching
				</p>
				<h2 class="mt-1 max-w-[16rem] text-lg font-medium text-slate-700 sm:max-w-none">
					Nothing matches &ldquo;{searchQuery.trim()}&rdquo;
				</h2>
				<p class="mt-2 max-w-sm text-sm leading-relaxed text-slate-500">
					Nothing on this calendar matches those words. Everything is still here — only the view is
					narrowed.
				</p>
				<button
					type="button"
					onclick={() => (searchQuery = '')}
					class="mt-5 rounded-lg bg-primary-600 px-4 py-2.5 text-sm font-medium text-white transition-all hover:bg-primary-700 active:scale-[0.98]"
				>
					Clear search
				</button>
			</div>
		{:else if showAssigneeEmpty}
			<!-- #127 mark 1.11. A person filter that matches nothing is not an
			     empty month and not a hidden calendar, and a blank grid reads as
			     "nothing scheduled" — which is a different and wrong thing to
			     tell a family. It names who is switched off, and the way back is
			     one tap. -->
			<div
				class="flex flex-col items-center px-2 py-14 text-center sm:py-20"
				data-testid="assignee-empty"
			>
				<svg
					class="mb-4 h-12 w-12 text-slate-300"
					fill="none"
					viewBox="0 0 24 24"
					stroke="currentColor"
					stroke-width="1.5"
					aria-hidden="true"
				>
					<path
						stroke-linecap="round"
						stroke-linejoin="round"
						d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z"
					/>
				</svg>
				<p class="text-[11px] font-semibold uppercase tracking-wide text-slate-400">
					Filtered
				</p>
				<h2 class="mt-1 max-w-[16rem] text-lg font-medium text-slate-700 sm:max-w-none">
					{hiddenAssigneeLabels.length === 1
						? `Nothing for ${hiddenAssigneeLabels[0]} in this view`
						: 'Nothing left in this view'}
				</h2>
				<p class="mt-2 max-w-sm text-sm leading-relaxed text-slate-500">
					{hiddenAssigneeLabels.length === 1
						? `${hiddenAssigneeLabels[0]} is switched off, and another filter has taken what was left of their plans. Everything is still here — only the view is narrowed.`
						: 'Everyone is switched off, and another filter has taken the rest. Everything is still here — only the view is narrowed.'}
				</p>
				<button
					type="button"
					onclick={handleShowAllAssignees}
					class="mt-5 rounded-lg bg-primary-600 px-4 py-2.5 text-sm font-medium text-white transition-all hover:bg-primary-700 active:scale-[0.98]"
				>
					Show everyone
				</button>
			</div>
		{:else if view === 'month'}
			<MonthView
				{currentDate}
				events={visibleEvents}
				{preferedFirstDayOfWeek}
				{calendarIds}
				{openDay}
				dueTasks={visibleTasks}
				{createAt}
				{selectionMode}
				{selectedIds}
				{onToggleSelect}
			/>
		{:else if view === 'week'}
			<WeekView
				{currentDate}
				events={visibleEvents}
				{removeEvent}
				{preferedFirstDayOfWeek}
				{calendarIds}
				{openDay}
				dueTasks={visibleTasks}
				{createAt}
				{selectionMode}
				{addMode}
				{selectedIds}
				{onToggleSelectionMode}
				{onToggleSelect}
			/>
		{:else if view === 'day'}
			<DayView
				{currentDate}
				events={visibleEvents}
				{calendarIds}
				dueTasks={visibleTasks}
				{createAt}
				{selectionMode}
				{addMode}
				{selectedIds}
				{onToggleSelectionMode}
				{onToggleSelect}
				on:back={backFromDay}
			/>
		{:else if view === 'list'}
			<ListView {currentDate} events={visibleEvents} {calendarIds} dueTasks={visibleTasks} />
		{/if}
	</div>
</div>
