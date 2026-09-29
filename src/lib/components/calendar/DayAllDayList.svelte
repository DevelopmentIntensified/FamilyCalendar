<script lang="ts">
	import type { Event } from '$lib/types';
	import AttendanceBadge from './AttendanceBadge.svelte';
	import CreatorBadge from './CreatorBadge.svelte';
	import { rsvpVisual } from '$lib/utils/eventChip';
	import { chipKindOf, chipSurfaceStyle, chipTreatment } from '$lib/utils/chipVocabulary';
	import { freqNoun } from '$lib/utils/taskDisplay';
	import ChipKindMark from './ChipKindMark.svelte';
	import type { CalendarTask } from './TaskDetailModal.svelte';

	interface Props {
		allDayEvents: Event[];
		dayTasks: CalendarTask[];
		selectionMode: boolean;
		isSelected: (event: Event) => boolean;
		onEventClick: (event: Event) => void;
		onOpenTask: (task: CalendarTask) => void;
	}

	let { allDayEvents, dayTasks, selectionMode, isSelected, onEventClick, onOpenTask }: Props =
		$props();
</script>

<!-- Day all-day + tasks sections (#046 split out of DayView) -->
{#if allDayEvents.length > 0}
	<div class="mb-3 rounded-xl bg-slate-50 p-3">
		<h3 class="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">All day</h3>
		<div class="space-y-1.5">
			{#each allDayEvents as event}
				{@const rv = rsvpVisual(event.rsvpStatus)}
				{@const kind = chipKindOf(event)}
				{@const treatment = chipTreatment(kind)}
				<button
					type="button"
					data-chip-kind={kind}
					onclick={() => onEventClick(event)}
					aria-pressed={selectionMode ? isSelected(event) : undefined}
					class="flex w-full items-center gap-2 overflow-hidden rounded bg-white px-3 py-2 text-left text-sm font-medium text-slate-900 transition-all hover:opacity-90 active:scale-[0.99] {treatment.containerClass} {rv?.containerClass ??
						''} {selectionMode && isSelected(event)
						? 'bg-primary-50/70 ring-2 ring-primary-400'
						: ''}"
					style={chipSurfaceStyle(event)}
				>
					<span class="flex min-w-0 items-center gap-1.5">
						{#if selectionMode}
							<span
								class="flex h-4 w-4 shrink-0 items-center justify-center rounded border transition-all {isSelected(
									event
								)
									? 'border-primary-600 bg-primary-600 text-white'
									: 'border-slate-300 bg-white'}"
								aria-hidden="true"
							>
								<svg
									class="h-2.5 w-2.5 transition-transform {isSelected(event)
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
						{#if rv}
							<span
								class="shrink-0 rounded-full px-1.5 py-0.5 text-[10px] font-bold leading-none {rv.badgeClass}"
								>{rv.icon} {rv.label}</span
							>
						{/if}
						<!-- #068: a full-width row has room, so the same all-day
							event that showed only a bar in the month cell says it. -->
						<ChipKindMark {kind} density="word" />
						<span class="truncate">{event.title}</span>
						{#if event.creatorName}
							<CreatorBadge name={event.creatorName} />
						{/if}
						{#if event.attendance && event.attendance.invited > 1}
							<AttendanceBadge attendance={event.attendance} />
						{/if}
					</span>
				</button>
			{/each}
		</div>
	</div>
{/if}

{#if dayTasks.length > 0}
	<div class="mb-3 rounded-xl border border-dashed border-slate-300 bg-slate-50 p-3">
		<h3 class="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">Tasks</h3>
		<div class="space-y-1.5">
			{#each dayTasks as task (task.id)}
				{@const taskTreatment = chipTreatment('task')}
				<button
					type="button"
					data-chip-kind="task"
					onclick={() => onOpenTask(task)}
					title="View task details"
					class="relative flex w-full items-center gap-2 overflow-hidden rounded border border-dashed bg-white px-3 py-2 text-left text-sm font-medium text-slate-700 transition-colors hover:bg-slate-50 {taskTreatment.containerClass}"
				>
					<span class="absolute -inset-2" aria-hidden="true"></span>
					<ChipKindMark kind="task" density="word" />
					<span class="truncate">{task.title}</span>
					{#if task.recurrenceFrequency}
						<span
							class="ml-auto shrink-0 text-[10px] font-semibold uppercase tracking-wide text-purple-500"
						>
							🔁 {task.recurrenceInterval && task.recurrenceInterval > 1
								? `${task.recurrenceInterval}× `
								: ''}{freqNoun(task.recurrenceFrequency) ?? task.recurrenceFrequency}
						</span>
					{/if}
				</button>
			{/each}
		</div>
	</div>
{/if}
