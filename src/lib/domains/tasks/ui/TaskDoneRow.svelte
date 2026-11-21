<!--
	One completed Task: the check (mark incomplete), the struck-through title, the
	due/recurrence chips, the category and tag chips, and the delete affordance.
	Data and callbacks in, events out.

	Legacy reference: `components/tasks/TaskCompletedRow.svelte`.
-->
<script lang="ts">
	import ConfirmAction from '$lib/kernel/ui/ConfirmAction.svelte';
	import Pill from '$lib/kernel/ui/Pill.svelte';
	import type { TaskPageRow } from '../tasks.contract';
	import { formatTaskDue, taskFreqNoun } from '../tasks.display.rules';

	interface Props {
		task: TaskPageRow;
		busy: boolean;
		onToggle: () => void;
		onDelete: () => Promise<void>;
	}

	let { task, busy, onToggle, onDelete }: Props = $props();

	const cadence = $derived(taskFreqNoun(task.recurrenceFrequency));
</script>

<div
	class="group flex min-w-0 flex-wrap items-center gap-2.5 overflow-hidden rounded-lg border border-slate-100 bg-slate-50/60 px-2.5 py-2 transition-colors hover:bg-slate-100"
	data-testid="task-done-row"
>
	<button
		type="button"
		onclick={onToggle}
		disabled={busy}
		class="relative flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-primary-500 text-white active:bg-primary-600"
		aria-label="Mark incomplete"
	>
		<span class="absolute -inset-2" aria-hidden="true"></span>
		<svg class="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="3">
			<path stroke-linecap="round" stroke-linejoin="round" d="M5 13l4 4L19 7" />
		</svg>
	</button>
	<p class="min-w-0 flex-1 truncate text-sm text-slate-400 line-through">
		{task.title}
		{#if task.eventTitle}<span class="ml-1 text-xs font-normal text-slate-400 no-underline"
				>({task.eventTitle})</span
			>{/if}
	</p>
	{#if task.dueDate}
		<Pill tone="neutral" testid="done-due">{formatTaskDue(task.dueDate)}</Pill>
	{/if}
	{#if task.recurrenceFrequency}
		<Pill
			tone="neutral"
			title="Repeats every {cadence ?? task.recurrenceFrequency}"
			testid="done-recurrence"
		>
			every {cadence ?? task.recurrenceFrequency}
		</Pill>
	{/if}
	{#if (task.tags ?? []).length > 0 || task.category}
		<div class="flex flex-wrap gap-1">
			{#if task.category?.trim()}
				<Pill tone="categoryMuted" size="compact" truncate testid="done-category"
					>{task.category.trim()}</Pill
				>
			{/if}
			{#each task.tags ?? [] as tag (tag)}
				<Pill tone="neutral" size="compact" testid="done-tag">#{tag}</Pill>
			{/each}
		</div>
	{/if}
	<ConfirmAction
		variant="icon"
		label="Delete task"
		ask="Delete?"
		confirmLabel="Yes"
		cancelLabel="No"
		pendingLabel="Deleting…"
		disabled={busy}
		testid="done-delete"
		onconfirm={onDelete}
	/>
</div>
