<!--
	Day view (legacy `DayView` + `DayHeader`): Back returns to the previous
	view, the header names the date and marks Today, a day with nothing draws
	the legacy copy plus Add event, the all-day band names the kind, and the
	hour grid does the rest.
-->
<script lang="ts">
	import { DateTime } from 'luxon';
	import type { CalendarPageState } from '../calendarPage.state.svelte';
	import DayAllDayList from './DayAllDayList.svelte';
	import HourGrid from './HourGrid.svelte';

	interface Props {
		state: CalendarPageState;
	}

	let { state }: Props = $props();

	const bucket = $derived(state.days.get(state.date.toISODate() ?? '') ?? { rows: [], tasks: [] });
	const isToday = $derived((state.date.toISODate() ?? '') === state.todayKey);
	const timedRows = $derived(bucket.rows.filter((row) => !row.allDay));
	const empty = $derived(bucket.rows.length === 0 && bucket.tasks.length === 0);
</script>

<div class="min-w-0 overflow-x-hidden">
	<div class="mb-4 flex items-center gap-3 border-b border-slate-200 pb-3">
		<button
			type="button"
			onclick={() => state.backFromDay()}
			class="flex h-11 w-11 items-center justify-center rounded-lg border border-slate-200 text-slate-600 transition-colors hover:bg-slate-50"
			aria-label="Back"
		>
			<svg class="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
				<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 19l-7-7 7-7" />
			</svg>
		</button>
		<h2 class="text-xl font-semibold text-slate-900 sm:text-2xl">
			{state.date.toFormat('EEEE, MMMM d')}
			{#if isToday}
				<span
					class="ml-2 rounded-full bg-primary-100 px-2 py-0.5 align-middle text-xs font-medium text-primary-700"
					>Today</span
				>
			{/if}
		</h2>
	</div>

	<DayAllDayList {state} day={state.date} />

	{#if empty}
		<div class="flex flex-col items-center justify-center py-16 text-center">
			<svg
				class="mb-4 h-14 w-14 text-slate-300"
				fill="none"
				viewBox="0 0 24 24"
				stroke="currentColor"
			>
				<path
					stroke-linecap="round"
					stroke-linejoin="round"
					stroke-width="1.5"
					d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"
				/>
			</svg>
			<p class="max-w-xs text-lg font-medium text-slate-700">
				Nothing scheduled. A free day is a gift — or add something fun.
			</p>
			<button
				type="button"
				onclick={() => state.openCreate(state.date)}
				class="mt-4 rounded-lg bg-primary-600 px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-primary-700"
			>
				Add event
			</button>
		</div>
	{:else if timedRows.length > 0}
		<HourGrid {state} days={[DateTime.fromJSDate(state.date.toJSDate(), { zone: state.zone })]} variant="day" />
	{/if}
</div>
