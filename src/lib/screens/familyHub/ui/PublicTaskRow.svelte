<!--
	One Public Task row on the board's Public tab: title, due date, "by
	{creator}", tags and category, and the read-only 🌐 pill. No action: another
	member's personal Task is readable, never writable (issue 019).
	Legacy reference: `components/tasks/FamilyTaskRow.svelte` (`variant="public"`).
-->
<script lang="ts">
	import Pill from '$lib/kernel/ui/Pill.svelte';
	import type { FamilyBoardTask } from '../familyHub.contract';
	import type { FamilyBoardState } from '../familyHub.board.state.svelte';

	interface Props {
		state: FamilyBoardState;
		task: FamilyBoardTask;
	}

	let { state, task }: Props = $props();

	const overdue = $derived(state.lateChip(task) !== null);
</script>

<div class="flex items-center gap-3 rounded-xl border border-slate-200 bg-white p-3">
	<div class="min-w-0 flex-1">
		<p class="truncate text-sm font-medium text-slate-900">{task.title}</p>
		<div class="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-slate-500">
			{#if task.dueDate}
				<span class={overdue ? 'font-semibold text-red-600' : ''}>{state.dueLabel(task)}</span>
			{/if}
			<span>by {task.creatorFirstName || 'a family member'}</span>
		</div>
		{#if task.tags.length || task.category}
			<div class="mt-1 flex flex-wrap items-center gap-1">
				{#if task.category}
					<Pill tone="category" size="compact">{task.category}</Pill>
				{/if}
				{#each task.tags as tag (tag)}
					<Pill tone="accent" size="compact">#{tag}</Pill>
				{/each}
			</div>
		{/if}
	</div>
	<span
		class="shrink-0 rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-medium text-slate-500"
		title="Public task — read-only for other members"
	>
		🌐 Public
	</span>
</div>
