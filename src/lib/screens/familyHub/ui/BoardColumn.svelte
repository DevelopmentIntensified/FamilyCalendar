<!--
	One assignee card of the board: the avatar and name with the open count, then
	that person's Tasks in urgency order.
	Legacy reference: `family/tasks/+page.svelte:305-350`.
-->
<script lang="ts">
	import { idColor } from '$lib/kernel/ui/colorHash';
	import type { BoardColumn } from '../familyHub.board.rules';
	import type { FamilyBoardTask } from '../familyHub.contract';
	import type { FamilyBoardState } from '../familyHub.board.state.svelte';
	import BoardTaskRow from './BoardTaskRow.svelte';

	interface Props {
		state: FamilyBoardState;
		column: BoardColumn<FamilyBoardTask>;
	}

	let { state, column }: Props = $props();

	const initial = $derived((column.name === 'You' ? 'Y' : column.name)[0] ?? '?');
</script>

<section
	data-board-column
	class="min-w-0 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm"
	aria-label="{column.name}’s open tasks"
>
	<div class="mb-3 flex items-center gap-2">
		<span
			class="grid h-8 w-8 shrink-0 place-items-center rounded-full text-xs font-extrabold {idColor(
				column.ownerId
			)}"
			aria-hidden="true"
		>
			{initial}
		</span>
		<h3 class="min-w-0 flex-1 truncate text-[15px] font-extrabold text-slate-900">{column.name}</h3>
		<span class="shrink-0 text-xs font-bold text-slate-400">{column.tasks.length}</span>
	</div>
	<div class="space-y-1.5">
		{#each column.tasks as task (task.id)}
			<BoardTaskRow {state} {task} />
		{/each}
	</div>
</section>
