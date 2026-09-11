<script lang="ts">
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

	export let currentDate: Writable<DateTime>;
	export let events: Event[] = [];
	export let removeEvent: (id: string) => void = () => {};
	export let preferedFirstDayOfWeek: string = 'sunday';
	export let calendarIds: { id: string; name: string; color?: string }[] = [];
	export let defaultViewSetting: string = 'monthView';
	export let initialView: string | undefined = undefined;
	export let dueTasks: {
		id: string;
		title: string;
		dueDate: Date | string;
		recurrenceFrequency?: string | null;
		recurrenceInterval?: number | null;
	}[] = [];
	export let createAt: (date: DateTime, end?: DateTime) => void = () => {};
	export let selectionMode: boolean = false;
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
		dashboardDate={$currentDate.toISODate() ?? ''}
		onToday={goToday}
		onPrevious={goPrevious}
		onNext={goNext}
		onMonthSelect={handleMonthSelect}
		onYearSelect={handleYearSelect}
		onViewChange={changeView}
		{onToggleSelectionMode}
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
		{#if view === 'month'}
			<MonthView
				{currentDate}
				{events}
				{preferedFirstDayOfWeek}
				{calendarIds}
				{openDay}
				{dueTasks}
				{createAt}
				{selectionMode}
				{selectedIds}
				{onToggleSelect}
			/>
		{:else if view === 'week'}
			<WeekView
				{currentDate}
				{events}
				{removeEvent}
				{preferedFirstDayOfWeek}
				{calendarIds}
				{openDay}
				{dueTasks}
				{createAt}
				{selectionMode}
				{selectedIds}
				{onToggleSelectionMode}
				{onToggleSelect}
			/>
		{:else if view === 'day'}
			<DayView
				{currentDate}
				{events}
				{calendarIds}
				{dueTasks}
				{createAt}
				{selectionMode}
				{selectedIds}
				{onToggleSelectionMode}
				{onToggleSelect}
				on:back={backFromDay}
			/>
		{:else if view === 'list'}
			<ListView {currentDate} {events} {calendarIds} {dueTasks} />
		{/if}
	</div>
</div>
