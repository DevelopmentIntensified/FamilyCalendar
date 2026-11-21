<!--
	`+N more`: the day's full list (legacy `DayEventsModal`). Events first with
	their clock and place, then a `Tasks` group; closing notifies the parent so
	the same cell can open it again. Day keys are ISO here — the legacy
	`MM-dd-yyyy` parse died with the cell's `formatDate()` key.
-->
<script lang="ts">
	import type { DateTime } from 'luxon';
	import { formatClockTime } from '$lib/kernel/time/dates';
	import Sheet from '$lib/kernel/ui/Sheet.svelte';
	import type { CalendarPageState } from '../calendarPage.state.svelte';
	import CalendarChip from './CalendarChip.svelte';
	import TaskChip from './TaskChip.svelte';

	interface Props {
		state: CalendarPageState;
		open: boolean;
		day: DateTime;
		onclose: () => void;
	}

	let { state, open, day, onclose }: Props = $props();

	const bucket = $derived(state.days.get(day.toISODate() ?? '') ?? { rows: [], tasks: [] });
</script>

<Sheet
	{open}
	{onclose}
	title={day.toFormat('EEEE, MMMM d, yyyy')}
	testid="day-events"
	closeLabel="Close"
>
	{#if bucket.rows.length === 0 && bucket.tasks.length === 0}
		<p class="py-8 text-center text-slate-500">No events for this day</p>
	{:else}
		<div class="divide-y divide-slate-100">
			{#each bucket.rows as row (row.id)}
				<button
					type="button"
					class="w-full py-3 text-left transition-colors hover:bg-slate-50"
					onclick={() => {
						onclose();
						state.openEdit(row.id);
					}}
				>
					<h3 class="truncate text-sm font-semibold text-slate-900">{row.title}</h3>
					<CalendarChip
						{row}
						calendars={state.shell.calendars}
						density="word"
						onopen={(target) => state.openEdit(target.id)}
						class="w-full px-1 py-0.5 text-sm"
					/>
					<div class="mt-1 flex flex-wrap items-center gap-2 text-sm text-slate-600">
						{#if !row.allDay && row.start}
							<span>{formatClockTime(row.start, state.zone)}</span>
						{/if}
						{#if row.location}
							<span class="truncate">· {row.location}</span>
						{/if}
					</div>
					{#if state.calendarOf(row.calendarId)}
						<div class="mt-1 text-xs text-slate-500">{state.calendarOf(row.calendarId)?.name}</div>
					{/if}
				</button>
			{/each}
		</div>

		{#if bucket.tasks.length > 0}
			<h3 class="mt-3 text-xs font-semibold uppercase tracking-wide text-slate-400">Tasks</h3>
			<div class="mt-2 space-y-2">
				{#each bucket.tasks as task (task.id)}
					<div class="flex items-center gap-2">
						<TaskChip {task} now={state.now} onopen={(row) => state.openTaskDetail(row.id)} density="word" title="Due task" />
						<span class="text-xs text-slate-500">Due task</span>
					</div>
				{/each}
			</div>
		{/if}
	{/if}
</Sheet>
