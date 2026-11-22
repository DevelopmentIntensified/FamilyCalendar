<!--
	One month cell (legacy `MonthDayCell`), E's cell transcribed (#128 gaps 2/6):
	a FIXED height that clips rather than grows — a busy Tuesday is not allowed
	to push the bottom of the month off the screen — a weekend wash, a today ring
	with a filled disc, 3 Event chips and 2 due-Task chips, then `+N more`.

	The per-cell `+` and Day-dashboard links reveal on hover or focus at every
	width and are inert while invisible (an un-hovered 20px target under a thumb
	is not a control). A cell tap forks exactly once: Selection mode and wide
	screens open Day View; a narrow screen opens the day action sheet (#205).

	Chips fork the same way: a narrow cell keeps them inert so the whole cell
	stays one tap that opens the sheet, while a wide cell lets a chip open its
	own event (the legacy pre-#145 desktop answer — a pointer can aim).
-->
<script lang="ts">
	import { DateTime } from 'luxon';
	import type { CalendarPageState } from '../calendarPage.state.svelte';
	import { monthCellOverflow } from '../calendarPage.grid.rules';
	import CalendarChip from './CalendarChip.svelte';
	import TaskChip from './TaskChip.svelte';

	interface Props {
		state: CalendarPageState;
		day: DateTime;
		inMonth: boolean;
		/** Below the app's one breakpoint (`MonthView` reads it once per grid). */
		narrow: boolean;
	}

	let { state, day, inMonth, narrow }: Props = $props();

	// The cell IS a local midnight in the grid's zone (grid rules build it), so
	// its own ISO day is the day key: no formatter runs 35–42 times a render.
	const key = $derived(day.toISODate() ?? '');
	const bucket = $derived(state.days.get(key) ?? { rows: [], tasks: [] });
	const overflow = $derived(monthCellOverflow(bucket.rows.length, bucket.tasks.length));
	const isToday = $derived(key === state.todayKey);
	const isWeekend = $derived(day.weekday >= 6 && inMonth);
	const shownRows = $derived(bucket.rows.slice(0, overflow.events));
	const shownTasks = $derived(bucket.tasks.slice(0, overflow.tasks));

	function tap() {
		if (!state.selectionMode && narrow) state.openDaySheet(day);
		else state.openDay(day);
	}
</script>

<div
	data-testid="month-day-cell"
	class="group relative h-[72px] min-h-0 overflow-hidden rounded-[14px] border px-2 pb-2.5 pt-2 transition-colors md:h-[92px] lg:h-[104px] {isToday
		? 'border-primary-300 bg-primary-50/40 ring-1 ring-inset ring-primary-200'
		: !inMonth
			? 'border-slate-100 bg-slate-50/50'
			: isWeekend
				? 'border-slate-200 bg-gradient-to-b from-[#f8f6f3] to-white hover:from-white'
				: 'border-slate-200 bg-white hover:bg-slate-50'}"
>
	<button
		type="button"
		class="absolute inset-0 z-0 rounded-[14px] focus:outline-none focus:ring-2 focus:ring-primary-400"
		aria-label="Open {day.toFormat('MM-dd-yyyy')}"
		onclick={tap}
	></button>

	<div class="pointer-events-none relative z-10 flex h-full min-h-0 flex-col">
		<div
			class="absolute right-1 top-1 z-10 flex items-center gap-0.5 opacity-0 transition-opacity duration-150 focus-within:opacity-100 group-hover:opacity-100"
		>
			{#if inMonth}
				<button
					type="button"
					class="pointer-events-none flex h-5 w-5 items-center justify-center rounded p-1 text-slate-300 transition-colors hover:bg-slate-100 hover:text-primary-600 focus-visible:pointer-events-auto focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-primary-400 group-hover:pointer-events-auto"
					aria-label="Add on {day.toFormat('EEEE, MMMM d')}"
					title="Add on {day.toFormat('EEEE, MMMM d')}"
					onclick={(event) => {
						event.stopPropagation();
						state.openCreate(day);
					}}
				>
					<svg class="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2.5">
						<path stroke-linecap="round" stroke-linejoin="round" d="M12 4v16m8-8H4" />
					</svg>
				</button>
				<a
					href="/calendar/dashboard?date={key}"
					class="pointer-events-none flex h-5 w-5 items-center justify-center rounded p-1 text-slate-300 transition-colors hover:bg-slate-100 hover:text-primary-600 focus-visible:pointer-events-auto focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-primary-400 group-hover:pointer-events-auto {state.selectionMode
						? 'hidden'
						: ''}"
					aria-label="Day dashboard for {day.toFormat('EEEE, MMMM d')}"
					title="Day dashboard"
				>
					<svg class="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
						<path
							stroke-linecap="round"
							stroke-linejoin="round"
							d="M4 4h7v7H4zM13 4h7v7h-7zM4 13h7v7H4zM13 13h7v7h-7z"
						/>
					</svg>
				</a>
			{/if}
			{#if isToday}
				<span
					class="hidden whitespace-nowrap pr-0.5 text-[10px] font-medium uppercase tracking-wide text-primary-500 sm:inline"
					>today</span
				>
			{/if}
		</div>

		<div
			data-testid="month-chips"
			class="flex min-h-0 flex-1 flex-wrap content-start items-start gap-x-1 gap-y-[2px] overflow-hidden {state.selectionMode
				? 'pointer-events-auto'
				: narrow
					? 'pointer-events-none'
					: ''}"
			inert={!state.selectionMode && narrow ? true : undefined}
		>
			<span
				data-testid="day-disc"
				class="flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-[13px] font-bold {isToday
					? 'bg-primary-600 text-white'
					: !inMonth
						? 'text-slate-400'
						: 'text-slate-600'}"
			>
				{day.day}
			</span>
			{#each shownRows as row (row.id)}
				<CalendarChip
					{row}
					calendars={state.shell.calendars}
					density="glyph"
					selectionMode={state.selectionMode}
					selected={state.selectedSet.has(row.id)}
					onopen={(target) => state.openEdit(target.id)}
					onselect={(target) => state.toggleSelect(target.id)}
				/>
			{/each}
			{#each shownTasks as task (task.id)}
				<TaskChip {task} now={state.now} onopen={(row) => state.openTaskDetail(row.id)} density="glyph" />
			{/each}
		</div>

		{#if overflow.showOverflow && overflow.overflow > 0}
			<div class="relative z-10 mt-px shrink-0">
				<button
					type="button"
					data-chip-kind="overflow"
					onclick={(event) => {
						event.stopPropagation();
						state.openDayList(day);
					}}
					class="pointer-events-auto inline-flex min-h-[32px] min-w-[44px] items-center justify-center rounded px-2 text-[18px] font-medium leading-[18px] text-slate-600 transition-colors hover:text-primary-600 sm:h-auto sm:min-h-0 sm:min-w-0 sm:px-0.5 sm:text-[11px] sm:leading-tight sm:text-slate-400"
				>
					+{overflow.overflow} more
				</button>
			</div>
		{/if}
	</div>
</div>
