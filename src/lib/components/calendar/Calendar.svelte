<script lang="ts">
	import { writable, type Writable, get } from 'svelte/store';
	import { DateTime, Info } from 'luxon';
	import MonthView from './MonthView.svelte';
	import ListView from './ListView.svelte';
	import WeekView from './WeekView.svelte';
	import DayView from './DayView.svelte';
	import DailyVerseCard from './DailyVerseCard.svelte';

	export let currentDate: Writable<DateTime>;
	export let events: any[] = [];
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
	export let createAt: (date: DateTime) => void = () => {};
	export let selectionMode: boolean = false;
	export let selectedIds: string[] = [];
	export let onToggleSelectionMode: (on: boolean) => void = () => {};
	export let onToggleSelect: (event: any) => void = () => {};
	export let dailyVerse: {
		reference: string;
		text: string;
		attribution?: string;
	} | null = null;

	let view: 'month' | 'week' | 'list' | 'day' = (() => {
		const map: Record<string, 'month' | 'week' | 'list' | 'day'> = {
			monthView: 'month',
			weekView: 'week',
			listView: 'list',
			dayView: 'day'
		};
		if (initialView === 'month' || initialView === 'week' || initialView === 'day' || initialView === 'list') {
			return initialView;
		}
		// Restore last-used view from localStorage.
		try {
			const saved = localStorage.getItem('familyplanz:lastView') as 'month' | 'week' | 'list' | 'day' | null;
			if (saved && map[`${saved}View`]) return saved;
		} catch { /* SSR / private browsing */ }
		return map[defaultViewSetting] ?? 'month';
	})();
	let previousView: 'month' | 'week' | 'list' = 'month';
	let showMiniPicker = false;

	const views = [
		{ id: 'month', label: 'Month', icon: 'M3 3h18v18H3V3zm0 7.5h18v6.5H3v-6.5zm0 7.5h18v1.5H3v-1.5z' },
		{ id: 'week', label: 'Week', icon: 'M3 3h18v18H3V3zm0 7.5h18v12H3v-12zm2.5 2v8h2v-8h-2zm4 0v8h2v-8h-2zm4 0v8h2v-8h-2z' },
		{ id: 'list', label: 'List', icon: 'M4 6h16v2H4V6zm0 5h16v2H4v-2zm0 5h16v2H4v-2z' }
	] as const;

	function goToday() {
		currentDate.set(DateTime.now());
	}

	function goPrevious() {
		if (view === 'day') {
			currentDate.update(d => d.minus({ day: 1 }));
		} else if (view === 'week') {
			currentDate.update(d => d.minus({ week: 1 }));
		} else {
			currentDate.update(d => d.minus({ month: 1 }));
		}
	}

	function goNext() {
		if (view === 'day') {
			currentDate.update(d => d.plus({ day: 1 }));
		} else if (view === 'week') {
			currentDate.update(d => d.plus({ week: 1 }));
		} else {
			currentDate.update(d => d.plus({ month: 1 }));
		}
	}

	function changeView(newView: typeof view) {
		view = newView;
		try { localStorage.setItem('familyplanz:lastView', newView); } catch {}
	}

	function openDay(date: DateTime) {
		if (view !== 'day') previousView = view as 'month' | 'week' | 'list';
		currentDate.set(date);
		view = 'day';
		try { localStorage.setItem('familyplanz:lastView', 'day'); } catch {}
	}

	function backFromDay() {
		view = previousView;
		try { localStorage.setItem('familyplanz:lastView', previousView); } catch {}
	}

	function handleMonthSelect(month: number) {
		const current = get(currentDate).set({ month });
		currentDate.set(current);
		showMiniPicker = false;
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
		// Horizontal flings navigate; taps and vertical scrolls pass through.
		if (Math.abs(dx) > 60 && Math.abs(dx) > Math.abs(dy) * 1.5) {
			if (dx < 0) goNext();
			else goPrevious();
		}
	}

	$: currentMonthYear = $currentDate.toFormat('MMMM yyyy');
	$: currentYear = $currentDate.year;
	$: currentMonth = $currentDate.month;
	$: months = Info.months('long');
</script>

<div class="mb-2 bg-white pt-4">
	<!-- Modern Header -->
	<div class="mb-6 flex flex-col items-center gap-3 px-4 sm:flex-row sm:flex-wrap sm:justify-between sm:gap-x-4 sm:gap-y-2">
		<div class="flex w-full items-center justify-between gap-3 sm:w-auto sm:justify-start">
			<!-- Nav cluster: Today / prev / next as one joined control -->
			<div class="flex items-center overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
				<button
					onclick={goToday}
					class="px-3.5 py-2.5 text-sm font-semibold text-slate-700 transition-colors hover:bg-slate-100 active:bg-slate-200"
				>
					Today
				</button>
				<button
					onclick={goPrevious}
					class="flex h-10 w-11 items-center justify-center text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-800 active:bg-slate-200"
					aria-label="Previous"
				>
					<svg class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
						<path stroke-linecap="round" stroke-linejoin="round" d="M15 19l-7-7 7-7" />
					</svg>
				</button>
				<button
					onclick={goNext}
					class="flex h-10 w-11 items-center justify-center text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-800 active:bg-slate-200"
					aria-label="Next"
				>
					<svg class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
						<path stroke-linecap="round" stroke-linejoin="round" d="M9 5l7 7-7 7" />
					</svg>
				</button>
			</div>

			<!-- Mini Month Picker -->
			<div class="relative">
				<button
					onclick={() => showMiniPicker = !showMiniPicker}
					class="text-lg font-bold tracking-tight text-slate-900 transition-colors hover:text-primary-600 sm:text-2xl"
				>
					{currentMonthYear}
				</button>
				{#if showMiniPicker}
					<div class="absolute top-full left-0 z-20 mt-2 w-64 rounded-xl border border-slate-200 bg-white p-4 shadow-xl">
						<div class="mb-4 flex items-center justify-between">
				<button
					onclick={() => handleYearSelect(currentYear - 1)}
					class="flex h-10 w-10 items-center justify-center rounded-lg text-slate-600 hover:bg-slate-100"
					aria-label="Previous year"
				>
								<svg class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
									<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 19l-7-7 7-7" />
								</svg>
							</button>
							<span class="font-semibold text-slate-900">{currentYear}</span>
				<button
					onclick={() => handleYearSelect(currentYear + 1)}
					class="flex h-10 w-10 items-center justify-center rounded-lg text-slate-600 hover:bg-slate-100"
					aria-label="Next year"
				>
								<svg class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
									<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7" />
								</svg>
							</button>
						</div>
						<div class="grid grid-cols-3 gap-2">
							{#each months as monthName, i}
								<button
									onclick={() => handleMonthSelect(i + 1)}
									class="rounded-lg py-2 text-sm font-medium transition-colors {currentMonth === i + 1 ? 'bg-primary-600 text-white' : 'text-slate-700 hover:bg-slate-100'}"
								>
									{monthName.slice(0, 3)}
								</button>
							{/each}
						</div>
					</div>
				{/if}
			</div>
		</div>

		<!-- Right cluster: views + actions, one cohesive control row -->
		<div class="flex w-full min-w-0 items-center justify-between gap-2 sm:w-auto sm:flex-wrap sm:justify-end">
			<!-- View Toggle -->
			<div class="flex min-w-0 items-center gap-1 rounded-xl bg-slate-100 p-1 shadow-sm">
				{#each views as v}
					<button
						onclick={() => changeView(v.id)}
						class="flex h-10 items-center gap-2 rounded-lg px-3 text-sm font-medium transition-all active:scale-[0.97] {view === v.id ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-900'}"
					>
						<svg class="h-4 w-4" fill="currentColor" viewBox="0 0 24 24">
							<path d={v.icon} />
						</svg>
						<span class="sr-only sm:not-sr-only">{v.label}</span>
					</button>
				{/each}
			</div>

			<!-- Selection mode toggle -->
			<button
				onclick={() => onToggleSelectionMode(!selectionMode)}
				aria-pressed={selectionMode}
				title="Select events to edit in bulk"
				class="flex h-10 items-center gap-1.5 rounded-xl border px-3 text-sm font-medium transition-all active:scale-[0.97] {selectionMode
					? 'border-primary-300 bg-primary-50 text-primary-700'
					: 'border-slate-200 bg-white text-slate-400 hover:text-slate-800'}"
			>
				<svg class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
					<path stroke-linecap="round" stroke-linejoin="round" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" />
				</svg>
				<span class="sr-only sm:not-sr-only">Select</span>
			</button>

			<!-- Actions: import · print · settings -->
			<div class="flex min-w-0 max-w-full items-center overflow-x-auto overflow-y-hidden rounded-xl border border-slate-200 bg-white divide-x divide-slate-200 shadow-sm">
				<a
					href="/calendar/import"
					class="flex h-10 w-11 items-center justify-center text-slate-400 transition-colors hover:bg-slate-100 hover:text-primary-600"
					aria-label="Import events from a file"
					title="Import from Google / Apple / Outlook (.ics)"
				>
					<svg class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
						<path stroke-linecap="round" stroke-linejoin="round" d="M4 16v2a2 2 0 002 2h12a2 2 0 002-2v-2M12 4v12m0 0l-4-4m4 4l4-4" />
					</svg>
				</a>
				<a
					href="/calendar/print"
					class="flex h-10 w-11 items-center justify-center text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-800"
					aria-label="Print month for the fridge"
					title="Print for the fridge"
				>
					<svg class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
						<path stroke-linecap="round" stroke-linejoin="round" d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z" />
					</svg>
				</a>

				<a
					href="/calendar/dashboard?date={$currentDate.toISODate()}"
					class="flex h-10 w-11 items-center justify-center text-slate-400 transition-colors hover:bg-slate-100 hover:text-primary-600"
					aria-label="Day dashboard"
					title="Day dashboard"
				>
					<svg class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.5">
						<path stroke-linecap="round" stroke-linejoin="round" d="M4 4h7v7H4zM13 4h7v7h-7zM4 13h7v7H4zM13 13h7v7h-7z" />
					</svg>
				</a>

				<a
					href="/account#calendar"
					class="flex h-10 w-11 items-center justify-center text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-800"
					aria-label="Calendar Settings"
					title="Calendar settings"
				>
					<svg class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
						<path d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.066 2.573c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.573 1.066c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.066-2.573c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
						<path d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
					</svg>
				</a>
			</div>
		</div>
	</div>

	<div class="group/cal relative mx-auto w-full max-w-screen-2xl px-2 sm:px-4 lg:px-8"
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
			class="absolute -left-1 top-1/2 z-20 hidden h-9 w-9 -translate-y-1/2 items-center justify-center rounded-full border border-slate-200 bg-white text-slate-600 shadow-md opacity-0 transition-opacity hover:bg-slate-50 focus-visible:opacity-100 group-hover/cal:opacity-100 sm:flex"
		>
			<svg class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
				<path stroke-linecap="round" stroke-linejoin="round" d="M15 19l-7-7 7-7" />
			</svg>
		</button>
		<button
			onclick={goNext}
			aria-label="Next period"
			class="absolute -right-1 top-1/2 z-20 hidden h-9 w-9 -translate-y-1/2 items-center justify-center rounded-full border border-slate-200 bg-white text-slate-600 shadow-md opacity-0 transition-opacity hover:bg-slate-50 focus-visible:opacity-100 group-hover/cal:opacity-100 sm:flex"
		>
			<svg class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
				<path stroke-linecap="round" stroke-linejoin="round" d="M9 5l7 7-7 7" />
			</svg>
		</button>
	{#if view === 'month'}
		<MonthView {currentDate} {events} {removeEvent} {preferedFirstDayOfWeek} {calendarIds} {openDay} {dueTasks} {createAt} selectionMode={selectionMode} selectedIds={selectedIds} onToggleSelect={onToggleSelect} />
	{:else if view === 'week'}
		<WeekView {currentDate} {events} {removeEvent} {preferedFirstDayOfWeek} {calendarIds} {openDay} {dueTasks} />
	{:else if view === 'day'}
		<DayView {currentDate} {events} {calendarIds} {dueTasks} on:back={backFromDay} />
	{:else if view === 'list'}
		<ListView {currentDate} {events} {removeEvent} {calendarIds} {dueTasks} />
	{/if}
	</div>
</div>
