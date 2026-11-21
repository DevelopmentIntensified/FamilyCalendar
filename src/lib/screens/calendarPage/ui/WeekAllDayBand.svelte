<!--
	The week's header and all-day band (legacy `WeekHeader` + `WeekAllDayRow`):
	seven columns behind one hour gutter, the day buttons open Day View, the band
	shows all-day chips glyph-only (the band header already reads "All day") plus
	that day's due Tasks.
-->
<script lang="ts">
	import type { DateTime } from 'luxon';
	import type { CalendarPageState } from '../calendarPage.state.svelte';
	import CalendarChip from './CalendarChip.svelte';
	import TaskChip from './TaskChip.svelte';

	interface Props {
		state: CalendarPageState;
		weekDays: readonly DateTime[];
	}

	let { state, weekDays }: Props = $props();

	const gutter = 'w-14 shrink-0 border-r border-slate-200';
</script>

<div class="sticky top-0 z-10 grid grid-cols-8 border-b border-slate-200 bg-slate-50">
	<div class={gutter}></div>
	{#each weekDays as day (day.toISODate() ?? day.toMillis())}
		<div class="min-w-0 flex-1 border-r border-slate-100 last:border-r-0">
			<button
				type="button"
				class="w-full py-2 text-center transition-colors hover:bg-slate-100 active:bg-slate-200"
				onclick={() => state.openDay(day)}
				aria-label="Open {day.toFormat('EEEE, MMMM d')}"
			>
				<div
					class="text-xs font-medium uppercase {day.toISODate() === state.todayKey
						? 'text-primary-600'
						: 'text-slate-500'}"
				>
					{day.toFormat('EEE')}
				</div>
				<div
					class="text-lg font-semibold {day.toISODate() === state.todayKey
						? 'text-primary-600'
						: 'text-slate-900'}"
				>
					{day.day}
				</div>
			</button>
		</div>
	{/each}
</div>

<div class="grid grid-cols-8 border-b border-slate-200 bg-slate-50/50">
	<div
		class="flex w-14 shrink-0 items-center justify-end border-r border-slate-200 px-1 py-1 pr-2 text-xs text-slate-500"
	>
		All day
	</div>
	{#each weekDays as day (day.toISODate() ?? day.toMillis())}
		{@const bucket = state.days.get(day.toISODate() ?? '') ?? { rows: [], tasks: [] }}
		{@const allDay = bucket.rows.filter((row) => row.allDay)}
		<div class="min-h-[40px] min-w-0 flex-1 space-y-0.5 border-r border-slate-100 p-0.5 last:border-r-0">
			{#each allDay as row (row.id)}
				<CalendarChip
					{row}
					calendars={state.shell.calendars}
					density="glyph"
					selectionMode={state.selectionMode}
					selected={state.selectedSet.has(row.id)}
					onopen={(target) => state.openEdit(target.id)}
					onselect={(target) => state.toggleSelect(target.id)}
					class="w-full px-1 py-0.5 text-xs"
				/>
			{/each}
			{#each bucket.tasks as task (task.id)}
				<TaskChip {task} now={state.now} onopen={(row) => state.openTaskDetail(row.id)} density="glyph" />
			{/each}
		</div>
	{/each}
</div>
