<!--
	List view (legacy `ListView`): the month's Events and due Tasks grouped under
	sticky day headers, today marked with a pill, and the legacy empty line when
	the whole month is bare. Event rows carry the calendar name and the clock;
	Task rows carry their kind word and cadence.
-->
<script lang="ts">
	import { DateTime } from 'luxon';
	import { formatClockTime } from '$lib/kernel/time/dates';
	import { taskFreqNoun } from '$lib/domains/tasks/index';
	import type { CalendarPageState } from '../calendarPage.state.svelte';
	import CalendarChip from './CalendarChip.svelte';
	import TaskChip from './TaskChip.svelte';

	interface Props {
		state: CalendarPageState;
	}

	let { state }: Props = $props();

	const month = $derived(state.date.toFormat('yyyy-MM'));

	/** Day keys in the month with something on them, in order. */
	const days = $derived.by(() => {
		const keys = [...state.days.keys()]
			.filter((key) => key.startsWith(month))
			.filter((key) => {
				const bucket = state.days.get(key);
				return bucket ? bucket.rows.length > 0 || bucket.tasks.length > 0 : false;
			})
			.sort();
		return keys;
	});

	function clock(row: { start: string | null; allDay: boolean }): string | null {
		if (row.allDay || !row.start) return null;
		return formatClockTime(row.start, state.zone);
	}

	function cadence(frequency: string | null, interval: number | null): string | null {
		const noun = taskFreqNoun(frequency);
		if (!noun) return null;
		return interval && interval > 1 ? `every ${interval} ${noun}s` : `every ${noun}`;
	}
</script>

<div class="space-y-6">
	{#if days.length === 0}
		<div class="flex flex-col items-center justify-center py-12 text-center">
			<svg
				class="mx-auto mb-4 h-24 w-auto text-slate-300"
				fill="none"
				viewBox="0 0 24 24"
				stroke="currentColor"
				stroke-width="1.5"
				aria-hidden="true"
			>
				<path stroke-linecap="round" stroke-linejoin="round" d="M4 6h16M4 12h10M4 18h7" />
			</svg>
			<p class="max-w-xs text-lg font-medium text-slate-700">
				A whole month of nothing. Suspicious. Add something fun?
			</p>
		</div>
	{/if}

	{#each days as key (key)}
		{@const bucket = state.days.get(key) ?? { rows: [], tasks: [] }}
		{@const day = DateTime.fromISO(key, { zone: state.zone })}
		{@const isToday = key === state.todayKey}
		<div data-testid="calendar-list-day">
			<h3
				class="sticky top-0 z-10 mb-3 bg-white py-2 text-sm font-semibold {isToday
					? 'text-primary-600'
					: 'text-slate-500'}"
			>
				{day.toFormat('EEEE, MMMM d')}
				{#if isToday}
					<span
						class="ml-2 rounded-full bg-primary-100 px-2 py-0.5 text-xs font-medium text-primary-700"
						>Today</span
					>
				{/if}
			</h3>
			<div class="space-y-2">
				{#each bucket.rows as row (row.id)}
					{@const calendar = state.calendarOf(row.calendarId)}
					{@const time = clock(row)}
					<div class="flex items-center gap-3">
						<span
							class="h-10 w-1 shrink-0 rounded-full"
							style="background-color: {calendar?.color ?? (row.isAd ? '#f59e0b' : '#94a3b8')}"
							aria-hidden="true"
						></span>
						<div class="min-w-0 flex-1">
							<CalendarChip
								{row}
								calendars={state.shell.calendars}
								density="word"
								selectionMode={state.selectionMode}
								selected={state.selectedSet.has(row.id)}
								onopen={(target) => state.openEdit(target.id)}
								onselect={(target) => state.toggleSelect(target.id)}
								class="w-full px-2 py-1.5 text-sm"
							/>
							{#if calendar || time || row.location}
								<div class="mt-1 flex flex-wrap items-center gap-x-3 text-sm text-slate-500">
									{#if calendar}
										<span class="flex items-center gap-1">
											<span
												class="h-2 w-2 rounded-full"
												style="background-color: {calendar.color}"
											></span>
											{calendar.name}
										</span>
									{/if}
									{#if time}
										<span>{time}</span>
									{/if}
									{#if row.location}
										<span class="max-w-[150px] truncate">{row.location}</span>
									{/if}
								</div>
							{/if}
						</div>
					</div>
				{/each}
				{#each bucket.tasks as task (task.id)}
					{@const cadence = cadence(task.recurrenceFrequency, task.recurrenceInterval)}
					<div class="flex items-center gap-2">
						<TaskChip {task} now={state.now} onopen={(row) => state.openTaskDetail(row.id)} density="word" title="Due task" />
						{#if cadence}
							<span class="shrink-0 text-xs text-purple-500">🔁 {cadence}</span>
						{/if}
					</div>
				{/each}
			</div>
		</div>
	{/each}
</div>
