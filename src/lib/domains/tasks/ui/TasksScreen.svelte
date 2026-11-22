<!--
	The `/calendar/tasks` page body: builds the two state classes from the load
	data and lays out the cards. Layout only — behaviour lives in
	`tasks.page.state.svelte.ts` and `tasks.quickadd.state.svelte.ts`.

	The kernel Toaster is mounted here (the calendar layout still renders the
	legacy one; the shell moves it when its own S7 lands).
-->
<script lang="ts">
	import { createToasts } from '$lib/kernel/client/toasts.svelte';
	import Toaster from '$lib/kernel/ui/Toaster.svelte';
	import { createTasksApi, type TasksApi } from '../tasks.api';
	import type { TaskPageData } from '../tasks.contract';
	import { TasksPageState } from '../tasks.page.state.svelte';
	import { TaskQuickAddState } from '../tasks.quickadd.state.svelte';
	import TaskAssignments from './TaskAssignments.svelte';
	import TaskList from './TaskList.svelte';
	import TaskQuickAdd from './TaskQuickAdd.svelte';

	interface Props {
		data: TaskPageData;
		/** SvelteKit `invalidateAll`, passed in by the route (wiring only). */
		refresh: () => Promise<void>;
		/** A fake client in tests; the real one in the browser. */
		api?: TasksApi;
	}

	let { data, refresh, api = createTasksApi() }: Props = $props();

	const toasts = createToasts();
	const currentUserId = data.user?.id;
	const categoryNames = $derived(data.taskCategories.map((category) => category.name));

	const page = new TasksPageState({
		api,
		toasts,
		refresh,
		sections: data.taskLists,
		loadWarnings: data.loadWarnings,
		categories: data.taskCategories,
		roster: data.familyMembers,
		currentUserId
	});
	const quickAdd = new TaskQuickAddState({
		api,
		toasts,
		refresh,
		roster: data.familyMembers,
		familyId: data.familyId,
		zone: data.userSettings?.timeZone ?? 'UTC',
		onAdded: (row) => page.addTask(row),
		onError: (message) => (page.error = message)
	});

	const warnings = $derived(page.warnings);

	// A re-read hands the Screen new load data; the state classes adopt it.
	let seenSections = data.taskLists;
	$effect(() => {
		if (data.taskLists !== seenSections) {
			seenSections = data.taskLists;
			page.syncSections(data.taskLists, data.loadWarnings);
		}
		page.syncCategories(data.taskCategories);
	});
</script>

<div class="min-h-screen bg-slate-50">
	<div class="mx-auto max-w-4xl px-3 py-4 pb-20 sm:px-4">
		<!-- Header card (family-hub hero pattern). -->
		<section class="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm" aria-labelledby="tasks-heading">
			<div class="min-w-0">
				<h1 id="tasks-heading" class="text-xl font-bold text-slate-900">Tasks</h1>
				<p class="mt-0.5 text-xs text-slate-400">
					{page.openTasks.length}
					{page.openTasks.length === 1 ? 'task' : 'tasks'} open · {page.completedTasks.length} completed
				</p>
			</div>
		</section>

		{#if warnings.length > 0}
			<div
				class="mt-4 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800"
				role="alert"
			>
				Couldn't load {warnings.join(', ')} just now — everything else is up to date.
			</div>
		{/if}

		<TaskQuickAdd state={quickAdd} categories={categoryNames} />

		{#if page.error}
			<div
				role="alert"
				class="mb-4 mt-4 flex items-center justify-between gap-2 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600"
			>
				<span>{page.error}</span>
				<button
					type="button"
					onclick={() => page.dismissError()}
					class="shrink-0 rounded-full p-0.5 text-red-400 transition-colors hover:bg-red-100 hover:text-red-600"
					aria-label="Dismiss error"
				>
					✕
				</button>
			</div>
		{/if}

		<TaskList state={page} {currentUserId} />

		{#if page.pendingAssignments.length > 0 || page.requestedByMe.length > 0}
			<TaskAssignments state={page} />
		{/if}

		<!-- The manager is a closed disclosure below the list; it rides its own chunk. -->
		{#await import('./TaskCategoryManager.svelte') then { default: TaskCategoryManager }}
			<TaskCategoryManager state={page} />
		{/await}
	</div>
</div>

{#if page.editing}
	{#key page.editing.id}
		{#await import('./TaskEditor.svelte') then { default: TaskEditor }}
			<TaskEditor
				task={page.editing}
				{currentUserId}
				roster={data.familyMembers}
				saving={page.editSaving}
				categories={categoryNames}
				onsave={(draft) => page.saveEdit(draft)}
				onclose={() => page.closeEditor()}
			/>
		{/await}
	{/key}
{/if}

<Toaster items={toasts.items} ondismiss={toasts.dismiss} />
