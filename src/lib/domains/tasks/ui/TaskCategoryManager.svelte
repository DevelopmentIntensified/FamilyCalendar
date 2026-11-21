<!--
	Categories · N — the manage list: rename and delete the viewer's Task
	categories, optimistically (the state class applies the change and rolls it
	back with a toast). A disclosure, closed by default.

	Legacy reference: `components/tasks/TaskCategoryManager.svelte`.
-->
<script lang="ts">
	import { taskCategoryNameError } from '../tasks.editor.rules';
	import type { TasksPageState } from '../tasks.page.state.svelte';

	interface Props {
		state: TasksPageState;
		startOpen?: boolean;
	}

	let { state: manager, startOpen = false }: Props = $props();

	let open = $state(startOpen ? true : false);
	let renamingId = $state<string | null>(null);
	let renameDraft = $state('');
	let confirmDeleteId = $state<string | null>(null);
	let inlineError = $state('');

	function beginRename(id: string, name: string) {
		inlineError = '';
		confirmDeleteId = null;
		renamingId = id;
		renameDraft = name;
	}

	async function saveRename(id: string, previous: string) {
		const problem = taskCategoryNameError(renameDraft);
		if (problem) {
			inlineError = problem;
			return;
		}
		const name = renameDraft.trim();
		renamingId = null;
		if (name === previous) return;
		await manager.renameCategory(id, name);
	}

	async function confirmDelete(id: string) {
		confirmDeleteId = null;
		await manager.removeCategory(id);
	}
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
		<div id="task-category-manager" class="border-t border-slate-100 px-4 py-3">
			{#if inlineError}
				<p role="alert" class="mb-2 rounded-lg bg-red-50 px-3 py-2 text-xs text-red-600">{inlineError}</p>
			{/if}
			{#if manager.categories.length === 0}
				<p class="text-xs text-slate-500">
					No categories yet — set one on a task (or from TaskFocus) and it shows up here.
				</p>
			{:else}
				<ul class="space-y-1">
					{#each manager.categories as category (category.id)}
						<li class="flex min-h-[40px] items-center gap-2 rounded-lg px-1.5 hover:bg-slate-50">
							{#if renamingId === category.id}
								<form
									class="flex min-w-0 flex-1 items-center gap-1.5"
									onsubmit={(event) => {
										event.preventDefault();
										void saveRename(category.id, category.name);
									}}
								>
									<input
										type="text"
										value={renameDraft}
										oninput={(event) => (renameDraft = event.currentTarget.value)}
										maxlength={80}
										aria-label="New name for {category.name}"
										class="min-w-0 flex-1 rounded-lg border border-slate-300 px-2 py-1 text-sm focus:border-primary-500 focus:outline-none"
									/>
									<button
										type="submit"
										aria-label="Save name"
										class="rounded-md bg-primary-600 px-2.5 py-1 text-xs font-semibold text-white hover:bg-primary-700"
										>Save</button
									>
									<button
										type="button"
										onclick={() => (renamingId = null)}
										class="rounded-md px-2 py-1 text-xs text-slate-500 hover:bg-slate-100"
										>Cancel</button
									>
								</form>
							{:else}
								<span data-testid="category-name" class="min-w-0 flex-1 truncate text-sm text-slate-800"
									>{category.name}</span
								>
								{#if confirmDeleteId === category.id}
									<span class="text-xs text-slate-500">Tasks become uncategorized.</span>
									<button
										type="button"
										onclick={() => confirmDelete(category.id)}
										aria-label="Confirm delete {category.name}"
										class="rounded-md bg-red-600 px-2.5 py-1 text-xs font-semibold text-white hover:bg-red-700"
										>Delete</button
									>
									<button
										type="button"
										onclick={() => (confirmDeleteId = null)}
										class="rounded-md px-2 py-1 text-xs text-slate-500 hover:bg-slate-100"
										>Keep</button
									>
								{:else}
									<button
										type="button"
										onclick={() => beginRename(category.id, category.name)}
										aria-label="Rename {category.name}"
										class="rounded-md px-2 py-1 text-xs font-medium text-slate-600 hover:bg-slate-100"
										>Rename</button
									>
									<button
										type="button"
										onclick={() => {
											inlineError = '';
											renamingId = null;
											confirmDeleteId = category.id;
										}}
										aria-label="Delete {category.name}"
										class="rounded-md px-2 py-1 text-xs font-medium text-red-600 hover:bg-red-50"
										>Delete</button
									>
								{/if}
							{/if}
						</li>
					{/each}
				</ul>
			{/if}
		</div>
	{/if}
</section>
