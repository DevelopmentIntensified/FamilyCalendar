<!--
	The Family Task Board body: heading and "My tasks", the waiting-for-your-
	response banner, the two scope tabs, the tag filter, the per-assignee cards,
	the Nobody card, the completed list, the Public list and the owner-only edit
	sheet. Layout only — the decisions live in `FamilyBoardState`.

	Legacy reference: `family/tasks/+page.svelte`.
-->
<script lang="ts">
	import { createToasts } from '$lib/kernel/client/toasts.svelte';
	import Toaster from '$lib/kernel/ui/Toaster.svelte';
	import { TaskEditor } from '$lib/domains/tasks/ui';
	import { createTasksApi, type TasksApi } from '$lib/domains/tasks/index';
	import type { FamilyBoardModel } from '../familyHub.contract';
	import { FamilyBoardState } from '../familyHub.board.state.svelte';
	import BoardColumn from './BoardColumn.svelte';
	import CompletedTasks from './CompletedTasks.svelte';
	import NobodyCard from './NobodyCard.svelte';
	import PublicTaskRow from './PublicTaskRow.svelte';
	import TagFilter from './TagFilter.svelte';

	interface Props {
		data: FamilyBoardModel;
		/** SvelteKit's `invalidateAll`, passed in by the route. */
		refresh: () => Promise<void>;
		/** The task api; the screen's test replaces it with a fake. */
		api?: TasksApi;
	}

	let { data, refresh, api = createTasksApi() }: Props = $props();

	const toasts = createToasts();
	const state = new FamilyBoardState({ api, toasts, refresh, data });

	$effect(() => {
		state.data = data;
	});

	const empty = $derived(state.emptyState);

	const tabClass = (active: boolean) =>
		`min-h-[44px] flex-1 rounded-full border px-3.5 text-sm font-medium transition-colors ${
			active
				? 'border-slate-900 bg-slate-900 text-white'
				: 'border-slate-200 bg-white text-slate-600 hover:border-slate-300 hover:bg-slate-50'
		}`;
</script>

<div class="mx-auto max-w-5xl p-4 sm:p-6">
	<div class="mb-6">
		<a href="/family" class="text-sm text-slate-500 hover:text-slate-700">← Family</a>
		<div class="mt-1 flex items-center justify-between">
			<h1 class="text-2xl font-bold text-slate-900">Family Tasks</h1>
			<a
				href="/calendar/tasks"
				class="rounded-lg border border-slate-300 px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50"
			>
				My tasks
			</a>
		</div>
		{#if state.pendingForMe.length > 0}
			<p class="mt-2 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-800">
				📋 {state.pendingForMe.length} task{state.pendingForMe.length === 1 ? '' : 's'} waiting for
				your response below.
			</p>
		{/if}
	</div>

	<div class="mb-4 flex gap-1.5" role="tablist" aria-label="Task lists">
		<button
			type="button"
			role="tab"
			aria-selected={state.tab === 'family'}
			onclick={() => state.setTab('family')}
			class={tabClass(state.tab === 'family')}
		>
			Family tasks
		</button>
		<button
			type="button"
			role="tab"
			aria-selected={state.tab === 'public'}
			onclick={() => state.setTab('public')}
			class={tabClass(state.tab === 'public')}
		>
			{state.publicLabel}
		</button>
	</div>

	{#if state.tab === 'family'}
		<TagFilter value={state.tagFilter} onchange={(value) => state.setTagFilter(value)} />

		{#if empty.kind === 'no-match'}
			<div class="flex flex-col items-center justify-center py-16 text-center">
				<p class="text-lg font-medium text-slate-700">
					No tasks match #<span class="font-semibold">{empty.tag}</span>
				</p>
				<p class="text-sm text-slate-500">Clear the filter to see all tasks</p>
			</div>
		{:else if empty.kind === 'no-family-tasks'}
			<div class="flex flex-col items-center justify-center py-16 text-center">
				<p class="text-lg font-medium text-slate-700">No family tasks yet</p>
				<p class="text-sm text-slate-500">
					Create one from <a href="/calendar/tasks" class="font-medium text-primary-600 underline"
						>My Tasks</a
					>
					and assign it to a family member.
				</p>
			</div>
		{:else if empty.kind === 'all-caught-up'}
			<div class="rounded-xl border border-dashed border-slate-200 py-10 text-center">
				<p class="text-sm font-medium text-emerald-600">All caught up 🎉</p>
				<p class="text-sm text-slate-500">Nothing open right now</p>
			</div>
		{/if}

		{#if state.boardGroups.length > 0}
			<div
				class="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4"
				role="region"
				aria-label="Open tasks by assignee"
			>
				{#each state.boardGroups as column (column.ownerId)}
					<BoardColumn {state} {column} />
				{/each}
			</div>
		{/if}

		<CompletedTasks tasks={state.completedTasks} total={state.completedTotal} />

		{#if state.unassignedTasks.length > 0}
			<NobodyCard {state} tasks={state.unassignedTasks} />
		{/if}
	{:else if empty.kind === 'no-public-tasks'}
		<div class="flex flex-col items-center justify-center py-16 text-center">
			<p class="text-lg font-medium text-slate-700">No public tasks yet</p>
			<p class="text-sm text-slate-500">Tasks your family marks public (🌐) show up here.</p>
		</div>
	{:else}
		<div class="space-y-1.5">
			{#each state.publicTasks as task (task.id)}
				<PublicTaskRow {state} {task} />
			{/each}
		</div>
	{/if}
</div>

{#if state.editing}
	{#key state.editing.id}
		<TaskEditor
			task={state.editing}
			currentUserId={state.data.userId}
			roster={state.data.familyRoster}
			saving={state.editSaving}
			categories={state.categoryNames}
			onsave={(draft) => state.saveEdit(draft)}
			onclose={() => state.closeEdit()}
		/>
	{/key}
{/if}

<Toaster items={toasts.items} ondismiss={toasts.dismiss} />
