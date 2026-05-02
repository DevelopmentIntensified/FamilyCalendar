<script lang="ts">
	import { writable, type Writable, get } from 'svelte/store';
	import { DateTime } from 'luxon';
	import MonthView from './MonthView.svelte';
	import ListView from './ListView.svelte';
	import WeekView from './WeekView.svelte';
	import DateSelector from './DateSelector.svelte';

	export let currentDate: Writable<DateTime>;
	export let events;
	export let removeEvent: (id: string) => void = () => {};
	export let preferedFirstDayOfWeek: string = 'sunday';
	let view: 'month' | 'week' | 'list' = 'month';
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
		if (view === 'week') {
			currentDate.update(d => d.minus({ week: 1 }));
		} else {
			currentDate.update(d => d.minus({ month: 1 }));
		}
	}

	function goNext() {
		if (view === 'week') {
			currentDate.update(d => d.plus({ week: 1 }));
		} else {
			currentDate.update(d => d.plus({ month: 1 }));
		}
	}

	function changeView(newView: typeof view) {
		view = newView;
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

	$: currentMonthYear = get(currentDate).toFormat('MMMM yyyy');
	$: currentYear = get(currentDate).year;
	$: currentMonth = get(currentDate).month;
	$: months = DateTime.now().monthNamesLong;
</script>

<div class="mb-2 bg-white pt-4">
	<!-- Modern Header -->
	<div class="mb-6 flex flex-col items-center gap-4 px-4 sm:flex-row sm:justify-between">
		<div class="flex items-center gap-2">
			<button
				onclick={goToday}
				class="rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 hover:border-slate-300 transition-colors"
			>
				Today
			</button>
		<div class="flex items-center gap-1">
			<button
				onclick={goPrevious}
				class="flex h-9 w-9 items-center justify-center rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50 hover:border-slate-300 transition-colors"
				aria-label="Previous"
			>
				<svg class="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
					<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 19l-7-7 7-7" />
				</svg>
			</button>
			<button
				onclick={goNext}
				class="flex h-9 w-9 items-center justify-center rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50 hover:border-slate-300 transition-colors"
				aria-label="Next"
			>
				<svg class="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
					<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7" />
				</svg>
			</button>
		</div>
			<!-- Mini Month Picker -->
			<div class="relative">
				<button
					onclick={() => showMiniPicker = !showMiniPicker}
					class="text-xl font-semibold text-slate-900 sm:text-2xl hover:text-primary-600 transition-colors"
				>
					{currentMonthYear}
				</button>
				{#if showMiniPicker}
					<div class="absolute top-full left-0 z-20 mt-2 w-64 rounded-xl border border-slate-200 bg-white p-4 shadow-xl">
						<div class="mb-4 flex items-center justify-between">
							<button
								onclick={() => handleYearSelect(currentYear - 1)}
								class="flex h-8 w-8 items-center justify-center rounded-lg text-slate-600 hover:bg-slate-100"
							>
								<svg class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
									<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 19l-7-7 7-7" />
								</svg>
							</button>
							<span class="font-semibold text-slate-900">{currentYear}</span>
							<button
								onclick={() => handleYearSelect(currentYear + 1)}
								class="flex h-8 w-8 items-center justify-center rounded-lg text-slate-600 hover:bg-slate-100"
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

		<!-- View Toggle -->
		<div class="flex items-center gap-1 rounded-lg bg-slate-100 p-1">
			{#each views as v}
				<button
					onclick={() => changeView(v.id)}
					class="flex items-center gap-2 rounded-md px-3 py-1.5 text-sm font-medium transition-all {view === v.id ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-600 hover:text-slate-900'}"
				>
					<svg class="h-4 w-4" fill="currentColor" viewBox="0 0 24 24">
						<path d={v.icon} />
					</svg>
					<span class="hidden sm:inline">{v.label}</span>
				</button>
			{/each}
		</div>
	</div>

	{#if view === 'month'}
		<MonthView {currentDate} {events} {removeEvent} {preferedFirstDayOfWeek} />
	{:else if view === 'week'}
		<WeekView {currentDate} {events} {removeEvent} {preferedFirstDayOfWeek} />
	{:else if view === 'list'}
		<ListView {currentDate} {events} {removeEvent} />
	{/if}
</div>
