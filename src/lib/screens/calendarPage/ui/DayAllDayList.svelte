<!--
	Day view's all-day band and Tasks group (legacy `DayAllDayList`). A full-width
	row has room, so the same all-day Event that showed only a glyph in a month
	cell says its kind here; the day's due Tasks get their own dashed group and
	name their cadence (`🔁 2× Weekly`).
-->
<script lang="ts">
	import type { DateTime } from 'luxon';
	import { taskFreqNoun } from '$lib/domains/tasks/index';
	import type { CalendarPageState } from '../calendarPage.state.svelte';
	import CalendarChip from './CalendarChip.svelte';
	import TaskChip from './TaskChip.svelte';

	interface Props {
		state: CalendarPageState;
		day: DateTime;
	}

	let { state, day }: Props = $props();

	const bucket = $derived(state.days.get(day.toISODate() ?? '') ?? { rows: [], tasks: [] });
	const allDay = $derived(bucket.rows.filter((row) => row.allDay));

	function cadence(frequency: string | null, interval: number | null): string | null {
		const noun = taskFreqNoun(frequency);
		if (!noun) return null;
		return interval && interval > 1 ? `${interval}× ${noun}` : noun;
	}
</script>

{#if allDay.length > 0}
	<div class="mb-3 rounded-xl bg-slate-50 p-3">
		<h3 class="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">All day</h3>
		<div class="space-y-1.5">
			{#each allDay as row (row.id)}
				<CalendarChip
					{row}
					calendars={state.shell.calendars}
					density="word"
					selectionMode={state.selectionMode}
					selected={state.selectedSet.has(row.id)}
					onopen={(target) => state.openEdit(target.id)}
					onselect={(target) => state.toggleSelect(target.id)}
					class="w-full px-3 py-2 text-sm"
				/>
			{/each}
		</div>
	</div>
{/if}

{#if bucket.tasks.length > 0}
	<div class="mb-3 rounded-xl border border-dashed border-slate-300 bg-slate-50 p-3">
		<h3 class="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">Tasks</h3>
		<div class="space-y-1.5">
			{#each bucket.tasks as task (task.id)}
				{@const cadenceLabel = cadence(task.recurrenceFrequency, task.recurrenceInterval)}
				<div class="flex w-full items-center gap-2">
					<TaskChip {task} now={state.now} onopen={(row) => state.openTaskDetail(row.id)} density="word" title="Due task" />
					{#if cadenceLabel}
						<span
							class="ml-auto shrink-0 text-[10px] font-semibold uppercase tracking-wide text-purple-500"
						>
							🔁 {cadenceLabel}
						</span>
					{/if}
				</div>
			{/each}
		</div>
	</div>
{/if}
