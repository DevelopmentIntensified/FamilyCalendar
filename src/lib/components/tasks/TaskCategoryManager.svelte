<script lang="ts">
	import { pushToast } from '$lib/client/toasts';
	import { deleteTaskCategory, renameTaskCategory } from '$lib/client/taskCategories';
	import {
		CATEGORY_MAX,
		categoryNameError,
		removeFromList,
		renameInList,
		type CategoryItem
	} from '$lib/utils/taskCategory';

	/** #280 manage-list: rename / delete the viewer's task categories.
	 * Optimistic (list changes on click), toast on the outcome, rollback +
	 * inline alert on error. One-way props + callbacks (#200). */
	interface Props {
		categories: CategoryItem[];
		/** Parent refreshes server data (invalidateAll) after a change. */
		onChanged?: () => void | Promise<void>;
		startOpen?: boolean;
	}

	let { categories, onChanged = () => {}, startOpen = false }: Props = $props();

	// Disclosure is local state; `startOpen` only opens it (tests, deep links).
	let open = $state(false);
	$effect.pre(() => {
		if (startOpen) open = true;
	});

	/** Optimistic overlay; null = show the server list. */
	let local: CategoryItem[] | null = $state(null);
	let list = $derived(local ?? categories);
	// Fresh server data replaces the overlay.
	$effect.pre(() => {
		void categories;
		local = null;
	});

	let renamingId: string | null = $state(null);
	let renameDraft = $state('');
	let confirmDeleteId: string | null = $state(null);
	let busyId: string | null = $state(null);
	let error = $state('');

	function beginRename(c: CategoryItem) {
		error = '';
		confirmDeleteId = null;
		renamingId = c.id;
		renameDraft = c.name;
	}

	async function saveRename(c: CategoryItem) {
		const problem = categoryNameError(renameDraft);
		if (problem) {
			error = problem;
			return;
		}
		const name = renameDraft.trim();
		renamingId = null;
		if (name === c.name) return;
		const before = list;
		error = '';
		busyId = c.id;
		local = renameInList(before, c.id, name);
		const out = await renameTaskCategory(c.id, name);
		busyId = null;
		if (!out.ok) {
			local = before;
			error = out.error;
			pushToast({ message: `Couldn't rename "${c.name}": ${out.error}` });
			return;
		}
		pushToast({
			message: `Renamed "${c.name}" to "${out.category.name}" — your tasks moved with it.`
		});
		await onChanged();
	}

	async function confirmDelete(c: CategoryItem) {
		confirmDeleteId = null;
		const before = list;
		error = '';
		busyId = c.id;
		local = removeFromList(before, c.id);
		const out = await deleteTaskCategory(c.id);
		busyId = null;
		// 404 = already gone (spec): keep it removed.
		if (!out.ok && out.status !== 404) {
			local = before;
			error = out.error;
			pushToast({ message: `Couldn't delete "${c.name}": ${out.error}` });
			return;
		}
		pushToast({ message: `Deleted "${c.name}" — its tasks are now uncategorized.` });
		await onChanged();
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
		<span>Categories · {list.length}</span>
		<span class="text-xs font-normal text-slate-400">{open ? 'Hide' : 'Manage'}</span>
	</button>

	{#if open}
		<div id="task-category-manager" class="border-t border-slate-100 px-4 py-3">
			{#if error}
				<p role="alert" class="mb-2 rounded-lg bg-red-50 px-3 py-2 text-xs text-red-600">{error}</p>
			{/if}
			{#if list.length === 0}
				<p class="text-xs text-slate-500">
					No categories yet — set one on a task (or from TaskFocus) and it shows up here.
				</p>
			{:else}
				<ul class="space-y-1">
					{#each list as c (c.id)}
						<li class="flex min-h-[40px] items-center gap-2 rounded-lg px-1.5 hover:bg-slate-50">
							{#if renamingId === c.id}
								<form
									class="flex min-w-0 flex-1 items-center gap-1.5"
									onsubmit={(e) => {
										e.preventDefault();
										saveRename(c);
									}}
								>
									<input
										type="text"
										value={renameDraft}
										oninput={(e) => (renameDraft = e.currentTarget.value)}
										maxlength={CATEGORY_MAX}
										aria-label="New name for {c.name}"
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
								<span
									data-testid="category-name"
									class="min-w-0 flex-1 truncate text-sm text-slate-800 {busyId === c.id
										? 'opacity-60'
										: ''}">{c.name}</span
								>
								{#if confirmDeleteId === c.id}
									<span class="text-xs text-slate-500">Tasks become uncategorized.</span>
									<button
										type="button"
										onclick={() => confirmDelete(c)}
										aria-label="Confirm delete {c.name}"
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
										onclick={() => beginRename(c)}
										disabled={busyId === c.id}
										aria-label="Rename {c.name}"
										class="rounded-md px-2 py-1 text-xs font-medium text-slate-600 hover:bg-slate-100 disabled:opacity-40"
										>Rename</button
									>
									<button
										type="button"
										onclick={() => {
											error = '';
											renamingId = null;
											confirmDeleteId = c.id;
										}}
										disabled={busyId === c.id}
										aria-label="Delete {c.name}"
										class="rounded-md px-2 py-1 text-xs font-medium text-red-600 hover:bg-red-50 disabled:opacity-40"
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
