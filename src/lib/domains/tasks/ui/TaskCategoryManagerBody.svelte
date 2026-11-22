<!--
	The open body of the Categories disclosure: the rename/delete list for the
	viewer's Task categories, optimistic through the state class (it applies the
	change and rolls it back with a toast). `TaskCategoryManager` imports it
	lazily the first time the disclosure opens (ADR 0010).

	Legacy reference: `components/tasks/TaskCategoryManager.svelte`.
-->
<script lang="ts">
	import { taskCategoryNameError } from '../tasks.editor.rules';
	import type { TasksPageState } from '../tasks.page.state.svelte';

	interface Props {
		state: TasksPageState;
	}

	let { state: manager }: Props = $props();

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
