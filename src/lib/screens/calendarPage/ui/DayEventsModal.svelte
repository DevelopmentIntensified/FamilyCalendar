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
	import type { CalendarPageDisplayRow, CalendarPageState } from '../calendarPage.state.svelte';
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

	/** `7:00 PM - 8:00 PM`; all-day (the mark carries the word) and untimed rows have none. */
	function clockOf(row: CalendarPageDisplayRow): string {
		if (row.allDay || !row.start) return '';
		const start = formatClockTime(row.start, state.zone);
		const end = row.end ? formatClockTime(row.end, state.zone) : '';
		return end ? `${start} - ${end}` : start;
	}

	/** A missing place is no place: blank and the placeholder `N/A` both drop out. */
	function placeOf(location: string | null): string {
		const place = location?.trim() ?? '';
		return /^n\/?a$/i.test(place) ? '' : place;
	}
</script>

<Sheet
	{open}
	{onclose}
	title={day.toFormat('EEEE, MMMM d, yyyy')}
	testid="day-events"
	closeLabel="Close"
>
	{#if bucket.rows.length === 0 && bucket.tasks.length === 0}
		<p class="px-6 py-12 text-center text-slate-500">No events for this day</p>
	{:else}
		<ul class="divide-y divide-slate-100" data-testid="day-events-list">
			{#each bucket.rows as row (row.id)}
				{@const calendar = state.calendarOf(row.calendarId)}
				{@const clock = clockOf(row)}
				{@const place = placeOf(row.location)}
				<li class="px-6 py-4" data-testid="day-event-row">
					<!-- The chip is the row: mark, title and badges once, and the one button. -->
					<CalendarChip
						{row}
						calendars={state.shell.calendars}
						density="word"
						onopen={(target) => {
							onclose();
							state.openEdit(target.id);
						}}
						class="w-full !px-1 !py-1 !text-base font-semibold"
					/>
					{#if clock || place}
						<div class="mt-1 flex flex-wrap items-center gap-x-2 text-sm text-slate-600">
							{#if clock}<span>{clock}</span>{/if}
							{#if place}<span class="truncate">{clock ? '· ' : ''}{place}</span>{/if}
						</div>
					{/if}
					{#if calendar}
						<div class="mt-1 flex items-center gap-1.5 text-xs text-slate-500">
							<span
								class="h-2 w-2 shrink-0 rounded-full"
								style="background-color: {calendar.color}"
								data-testid="day-event-calendar-dot"
								aria-hidden="true"
							></span>
							{calendar.name}
						</div>
					{/if}
				</li>
			{/each}
		</ul>

		{#if bucket.tasks.length > 0}
			<h3 class="mt-3 px-6 text-xs font-semibold uppercase tracking-wide text-slate-400">Tasks</h3>
			<div class="mt-2 space-y-2 px-6 pb-4">
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
