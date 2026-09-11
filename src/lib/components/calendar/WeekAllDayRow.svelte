<script lang="ts">
	import type { DateTime } from 'luxon';
	import type { Event } from '$lib/types';
	import AttendanceBadge from './AttendanceBadge.svelte';
	import CreatorBadge from './CreatorBadge.svelte';
	import { rsvpVisual } from '$lib/utils/eventChip';
	import type { CalendarTask } from './TaskDetailModal.svelte';

	interface Props {
		weekDays: DateTime[];
		eventsForDay: (day: DateTime) => Event[];
		tasksForDay: (day: DateTime) => CalendarTask[];
		selectionMode: boolean;
		isSelected: (event: Event) => boolean;
		onEventClick: (event: Event) => void;
		onOpenTask: (task: CalendarTask) => void;
	}

	let { weekDays, eventsForDay, tasksForDay, selectionMode, isSelected, onEventClick, onOpenTask }: Props = $props();
</script>

<!-- All-Day Events Row (#046 split: pure markup out of WeekView) -->
<div class="grid grid-cols-8 border-b border-slate-200 bg-slate-50/50">
	<div
		class="flex w-14 shrink-0 items-center justify-end border-r border-slate-200 px-1 py-1 pr-2 text-xs text-slate-500"
	>
		All day
	</div>
	{#each weekDays as wd}
		{@const allDayEvents = eventsForDay(wd).filter((e) => e.allDay)}
		{@const dayTasks = tasksForDay(wd)}
		<div
			class="min-h-[40px] flex-1 space-y-0.5 border-r border-slate-100 p-0.5 last:border-r-0"
		>
			{#each allDayEvents as event}
				{@const rv = rsvpVisual(event.rsvpStatus)}
				<button
					type="button"
					onclick={() => onEventClick(event)}
					aria-pressed={selectionMode ? isSelected(event) : undefined}
					class="flex w-full cursor-pointer items-center gap-1 truncate rounded bg-white px-1 py-0.5 text-left text-xs font-medium transition-all hover:opacity-90 active:scale-[0.99] active:opacity-70 {rv?.containerClass ??
						''} {selectionMode && isSelected(event)
						? 'bg-primary-50/70 ring-2 ring-primary-400'
						: ''}"
				>
					{#if selectionMode}
						<span
							class="flex h-3 w-3 shrink-0 items-center justify-center rounded-sm border transition-all {isSelected(
								event
							)
								? 'border-primary-600 bg-primary-600 text-white'
								: 'border-slate-400 bg-white'}"
							aria-hidden="true"
						>
							<svg
								class="h-2 w-2 transition-transform {isSelected(event)
									? 'scale-100'
									: 'scale-0'}"
								fill="none"
								viewBox="0 0 24 24"
								stroke="currentColor"
								stroke-width="4"
							>
								<path stroke-linecap="round" stroke-linejoin="round" d="M5 13l4 4L19 7" />
							</svg>
						</span>
					{/if}
					style="border-left: 3px solid {event.color || '#94a3b8'}" >
					{#if rv}
						<span class="mr-0.5 shrink-0 rounded px-0.5 text-[9px] font-bold {rv.badgeClass}"
							>{rv.icon}</span
						>
					{/if}
					<span class="truncate">{event.title}</span>
					{#if event.creatorName}
						<CreatorBadge name={event.creatorName} />
					{/if}
					{#if event.attendance && event.attendance.invited > 1}
						<AttendanceBadge attendance={event.attendance} />
					{/if}
				</button>
			{/each}
			{#each dayTasks as task (task.id)}
				<button
					type="button"
					onclick={() => onOpenTask(task)}
					title="View task details"
					class="relative flex w-full items-center gap-1 rounded border border-dashed border-slate-400 bg-slate-50 px-1 py-0.5 text-xs font-medium text-slate-600 transition-colors hover:border-slate-500 hover:bg-slate-100 active:bg-slate-200"
				>
					<span class="absolute -inset-2" aria-hidden="true"></span>
					<span class="h-3 w-3 shrink-0 rounded-full border-2 border-slate-300"></span>
					<span class="truncate">{task.title}</span>
				</button>
			{/each}
		</div>
	{/each}
</div>

