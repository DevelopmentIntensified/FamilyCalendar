<!--
	Categories · N — the manage list: rename and delete the viewer's Task
	categories, optimistically (the state class applies the change and rolls it
	back with a toast). A disclosure, closed by default.

	Only the header row is eager: the list itself is `TaskCategoryManagerBody`,
	imported the first time the disclosure opens, so a closed manager (every
	tasks page) ships no rename/delete markup or rules (ADR 0010).

	Legacy reference: `components/tasks/TaskCategoryManager.svelte`.
-->
<script lang="ts">
	import type { TasksPageState } from '../tasks.page.state.svelte';

	interface Props {
		state: TasksPageState;
		startOpen?: boolean;
	}

	let { state: manager, startOpen = false }: Props = $props();

	let open = $state(startOpen ? true : false);
</script>

<section class="mt-4 rounded-2xl border border-slate-200 bg-white shadow-sm">
	<button
		type="button"
		onclick={() => (open = !open)}
		aria-expanded={open}
		aria-controls="task-category-manager"
		class="flex w-full items-center justify-between gap-2 px-4 py-3 text-left text-sm font-semibold text-slate-900"
	>
		<span>Categories · {manager.categories.length}</span>
		<span class="text-xs font-normal text-slate-400">{open ? 'Hide' : 'Manage'}</span>
	</button>

	{#if open}
		{#await import('./TaskCategoryManagerBody.svelte') then { default: TaskCategoryManagerBody }}
			<TaskCategoryManagerBody state={manager} />
		{/await}
	{/if}
</section>
