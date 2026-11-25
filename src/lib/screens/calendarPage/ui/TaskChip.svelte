<!--
	One due-Task chip. A Task rides the day it is due and wears no calendar
	colour — it is due, not owned — so the receipt is the task kind plus a
	recurrence mark. `word` density spells the kind out where there is room.

	Opening it hands the id to tasks' own detail sheet (`TaskDetailModal`),
	which the screen mounts — a chip is a tap, not a checkbox.
-->
<script lang="ts">
	import { describeEventChip } from '$lib/domains/calendar/index';
	import CalendarMark from './CalendarMark.svelte';
	import type { CalendarPageTaskRow } from '../calendarPage.contract';

	interface Props {
		task: CalendarPageTaskRow;
		density?: 'glyph' | 'word';
		/** The viewer's instant, so "late" is judged by the caller's clock (R5). */
		now: Date;
		title?: string;
		/** Opens tasks' detail sheet for this row. */
		onopen?: (task: CalendarPageTaskRow) => void;
	}

	let { task, density = 'glyph', now, title = 'Due task', onopen }: Props = $props();

	const overdue = $derived(
		task.dueDate ? new Date(task.dueDate).getTime() < now.getTime() : false
	);
	const chip = $derived(describeEventChip({ kind: 'task', density, overdue }));
</script>

<button
	type="button"
	data-chip-kind="task"
	title={title}
	onclick={() => onopen?.(task)}
	class="relative flex min-w-0 items-center gap-1 overflow-hidden rounded-md border border-dashed bg-white px-1 py-0.5 text-[11px] font-medium leading-tight text-slate-600 {chip.containerClass} {overdue
		? 'text-red-600'
		: ''}"
>
	<CalendarMark kind={chip.kind} density={chip.markDensity} />
	<span class="min-w-0 truncate">{task.title}</span>
	{#if task.recurrenceFrequency}
		<svg
			class="ml-auto h-3 w-3 shrink-0 text-purple-400"
			fill="none"
			viewBox="0 0 24 24"
			stroke="currentColor"
			stroke-width="2"
			aria-label="Recurring"
		>
			<path
				stroke-linecap="round"
				stroke-linejoin="round"
				d="M4 4v5h5M20 20v-5h-5M4 9a8 8 0 0114-3m2 9a8 8 0 01-14 3"
			/>
		</svg>
	{/if}
</button>
