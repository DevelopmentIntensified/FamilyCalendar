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
	import { resolveInitialView, shouldSwipeNavigate, type CalendarView } from './calendarView';
	import {
		hiddenCalendarNames,
		isCalendarHidden,
		loadHiddenCalendars,
		saveHiddenCalendars,
		setAllCalendarsHidden,
		toggleCalendarVisibility,
		visibleByCalendar
	} from '$lib/utils/calendarVisibility';
	import { pushToast } from '$lib/client/toasts';

	export let currentDate: Writable<DateTime>;
	export let events: Event[] = [];
	export let removeEvent: (id: string) => void = () => {};
	export let preferedFirstDayOfWeek: string = 'sunday';
	export let calendarIds: { id: string; name: string; color?: string }[] = [];
	/** #069: the filter is stored per user on THIS device, so the key needs
	 *  the user id. It is a reading preference, not account data. */
	export let filterUserId: string | null = null;
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

	let view: View = resolveInitialView(initialView, defaultViewSetting, storedView);
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

	onMount(() => {
		hiddenCalendarIds = loadHiddenCalendars(window.localStorage, filterUserId);
	});

	function persistHidden(next: string[]) {
		hiddenCalendarIds = next;
		saveHiddenCalendars(window.localStorage, filterUserId, next);
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

	// ONE filter, applied above the views, so month, week, day and list can
	// never disagree about what is hidden. Tasks ride the same predicate.
	$: visibleEvents = visibleByCalendar(events, hiddenCalendarIds);
	$: visibleTasks = visibleByCalendar(dueTasks, hiddenCalendarIds);
	$: allCalendarsHidden =
		calendarIds.length > 0 && calendarIds.every((c) => isCalendarHidden(c.id, hiddenCalendarIds));
	// The empty state is for "you turned everything off and there is literally
	// nothing left to draw" — not merely "everything is off". A sponsored
	// event belongs to no calendar, so it survives hide-all; when one is on
	// screen the grid is not blank and an empty state would be a lie. Neither
	// is an empty week with calendars shown.
	$: nothingLeftToDraw = visibleEvents.length === 0 && visibleTasks.length === 0;
	$: showFilterEmpty = allCalendarsHidden && nothingLeftToDraw;
	$: hiddenNames = hiddenCalendarNames(calendarIds, hiddenCalendarIds);

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
		<button
			onclick={goPrevious}
			aria-label="Previous period"
			class="absolute -left-1 top-1/2 z-20 hidden h-9 w-9 -translate-y-1/2 items-center justify-center rounded-full border border-slate-200 bg-white text-slate-600 opacity-0 shadow-md transition-opacity hover:bg-slate-50 focus-visible:opacity-100 group-hover/cal:opacity-100 sm:flex"
		>
			<svg class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
				<path stroke-linecap="round" stroke-linejoin="round" d="M15 19l-7-7 7-7" />
			</svg>
		</button>
		<button
			onclick={goNext}
			aria-label="Next period"
			class="absolute -right-1 top-1/2 z-20 hidden h-9 w-9 -translate-y-1/2 items-center justify-center rounded-full border border-slate-200 bg-white text-slate-600 opacity-0 shadow-md transition-opacity hover:bg-slate-50 focus-visible:opacity-100 group-hover/cal:opacity-100 sm:flex"
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
