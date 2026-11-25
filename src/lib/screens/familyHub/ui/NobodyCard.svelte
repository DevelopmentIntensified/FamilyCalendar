<!--
	The approved "Nobody" card: a Task with no assignee belongs to no person's
	column, so it gets its own blush-washed card and an explanation instead of
	being invisible or filed under its creator.
	Legacy reference: `family/tasks/+page.svelte:365-400`.
-->
<script lang="ts">
	import type { FamilyBoardTask } from '../familyHub.contract';
	import type { FamilyBoardState } from '../familyHub.board.state.svelte';
	import BoardTaskRow from './BoardTaskRow.svelte';

	interface Props {
		state: FamilyBoardState;
		tasks: readonly FamilyBoardTask[];
	}

	let { state, tasks }: Props = $props();
</script>

<section
	class="mt-5 rounded-2xl border border-red-200 bg-gradient-to-br from-red-100/40 to-white p-4 shadow-sm"
	aria-label="Nobody’s open tasks"
>
	<h3 class="mb-2.5 flex items-center gap-2">
		<span class="text-sm font-semibold text-slate-900">Nobody</span>
		<span
			class="rounded-full bg-red-100 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-red-700"
		>
			unassigned
		</span>
		<span class="text-sm font-normal text-slate-400">· {tasks.length}</span>
	</h3>
	<div class="space-y-1.5">
		{#each tasks as task (task.id)}
			<BoardTaskRow {state} {task} />
		{/each}
	</div>
	<p class="mt-2.5 text-xs leading-relaxed text-slate-500">
		Nobody is on the hook for these. Assign one to a member, or leave it here — it is still on the
		family's list either way.
	</p>
</section>
