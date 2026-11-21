<!--
	The "Your tasks" card: the filter line (owner chips, scope chips, search,
	sort), the jump bar with bucket counts, the two labelled lists (One-off
	leads, Recurring follows), the tail states, and "Clear completed".

	The behaviour is the state class's (`TasksPageState`); this component is the
	layout and the copy. Legacy reference: `components/tasks/TasksMainList.svelte`
	and `TaskToolbar.svelte`.
-->
<script lang="ts">
	import ConfirmAction from '$lib/kernel/ui/ConfirmAction.svelte';
	import type { TasksPageState } from '../tasks.page.state.svelte';
	import {
		TASK_CHIPS,
		TASK_OWNER_VIEWS,
		TASK_SORT_KEYS,
		TASK_TIME_FILTERS,
		type TaskChip,
		type TaskOwnerView,
		type TaskSortKey
	} from '../tasks.list.rules';
	import TaskDoneRow from './TaskDoneRow.svelte';
	import TaskRow from './TaskRow.svelte';

	interface Props {
		state: TasksPageState;
		currentUserId: string | undefined;
	}

	let { state, currentUserId }: Props = $props();

	/** Per-chip helper copy for the empty state. */
	const CHIP_EMPTY: Record<TaskChip, { title: string; hint: string }> = {
		all: { title: 'No tasks yet', hint: 'Add your first task above' },
		public: {
			title: 'No public tasks',
			hint: 'Public tasks also show on your family’s Public tasks tab'
		},
		private: {
			title: 'No private tasks',
			hint: 'Only you (and anyone you assign) can see private tasks'
		},
		family: {
			title: 'No family tasks assigned to you',
			hint: 'New assignments appear in “To accept” below'
		}
	};

	const empty = $derived(CHIP_EMPTY[state.chip]);
	const timeLabel = $derived(state.timeFilterLabel(state.timeFilter).toLowerCase());
</script>

<section
	class="mt-4 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm"
	aria-labelledby="tasks-list-heading"
>
	<h2 id="tasks-list-heading" class="text-sm font-semibold text-slate-900">Your tasks</h2>
	<p class="mt-0.5 text-xs text-slate-400">Filter, search, and sort your list</p>

	<!-- ONE filter line, under one live count. -->
	<div class="mb-3 mt-3 flex items-baseline gap-2">
		<span class="shrink-0 text-sm font-medium text-slate-900">Filter</span>
		<span
			data-testid="task-filter-count"
			aria-live="polite"
			class="truncate text-xs tabular-nums text-slate-400"
		>
			{state.queryActive
				? `${state.matched.length} of ${state.openTasks.length + state.completedTasks.length} match “${state.searchQuery.trim()}”`
				: `${state.matched.length} tasks`}
		</span>
	</div>

	<div data-testid="task-filter-line" class="mb-3 flex flex-wrap items-center gap-1.5">
		<div class="flex flex-wrap gap-1.5" role="group" aria-label="Filter tasks by owner">
			{#each TASK_OWNER_VIEWS as view (view.value)}
				<button
					type="button"
					onclick={() => state.setView(view.value as TaskOwnerView)}
					aria-pressed={state.view === view.value}
					class="min-h-[44px] rounded-full border px-3.5 text-sm font-medium transition-colors {state.view ===
					view.value
						? 'border-slate-900 bg-slate-900 text-white'
						: 'border-slate-200 bg-white text-slate-600 hover:border-slate-300 hover:bg-slate-50'}"
				>
					{view.label}
				</button>
			{/each}
		</div>

		<div class="h-6 w-px shrink-0 bg-slate-200" aria-hidden="true"></div>

		<div class="flex flex-wrap gap-1.5" role="group" aria-label="Filter tasks by scope">
			{#each TASK_CHIPS as chip (chip.value)}
				<button
					type="button"
					onclick={() => state.setChip(chip.value)}
					aria-pressed={state.chip === chip.value}
					class="min-h-[44px] rounded-full border px-3.5 text-sm font-medium transition-colors {state.chip ===
					chip.value
						? 'border-slate-900 bg-slate-900 text-white'
						: 'border-slate-200 bg-white text-slate-600 hover:border-slate-300 hover:bg-slate-50'}"
				>
					{chip.label}
				</button>
			{/each}
		</div>

		<div class="relative min-w-[8rem] flex-1">
			<svg
				class="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400"
				fill="none"
				viewBox="0 0 24 24"
				stroke="currentColor"
				stroke-width="2"
				aria-hidden="true"
			>
				<path
					stroke-linecap="round"
					stroke-linejoin="round"
					d="M21 21l-4.35-4.35M17 11a6 6 0 11-12 0 6 6 0 0112 0z"
				/>
			</svg>
			<input
				type="search"
				value={state.searchQuery}
				oninput={(event) => state.setSearchQuery(event.currentTarget.value)}
				placeholder="Search…"
				aria-label="Search tasks"
				class="h-11 w-full rounded-lg border border-slate-300 bg-white pl-8 pr-2 text-sm text-slate-700 placeholder:text-slate-400 focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500"
			/>
		</div>

		<label class="flex items-center gap-2 text-sm text-slate-500">
			<span class="shrink-0">Sort</span>
			<select
				value={state.sortBy}
				onchange={(event) => state.setSortBy(event.currentTarget.value as TaskSortKey)}
				aria-label="Sort tasks"
				class="h-11 rounded-lg border border-slate-300 bg-white px-2 text-sm text-slate-700 focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500"
			>
				{#each TASK_SORT_KEYS as option (option.value)}
					<option value={option.value}>{option.label}</option>
				{/each}
			</select>
		</label>
	</div>

	<!-- The tag filter keeps its own row: it is a third axis. -->
	<div class="relative mb-4">
		<span
			class="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-sm font-bold text-slate-400"
			aria-hidden="true">#</span
		>
		<input
			type="text"
			value={state.tagFilter}
			oninput={(event) => state.setTagFilter(event.currentTarget.value)}
			placeholder="Filter by #tag…"
			aria-label="Filter tasks by tag"
			title="Prefix match: typing “gro” matches #groceries"
			class="w-full rounded-lg border border-slate-300 bg-white py-2 pl-8 pr-8 text-sm text-slate-700 placeholder:text-slate-400 focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500"
		/>
		{#if state.tagFilter}
			<button
				type="button"
				onclick={() => state.setTagFilter('')}
				class="absolute right-1 top-1/2 -translate-y-1/2 rounded-full p-1.5 text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-600"
				aria-label="Clear tag filter"
				title="Clear tag filter"
			>
				<svg class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
					<path stroke-linecap="round" stroke-linejoin="round" d="M6 18L18 6M6 6l12 12" />
				</svg>
			</button>
		{/if}
	</div>

	<!-- The jump bar: time is a filter state, carrying the bucket counts. -->
	<div class="mb-3 flex flex-wrap gap-1.5" role="group" aria-label="Filter tasks by time">
		{#each TASK_TIME_FILTERS as filter (filter.value)}
			{@const n =
				filter.value === 'all' ? state.matched.length : state.counts[filter.value]}
			<button
				type="button"
				onclick={() => state.setTimeFilter(filter.value)}
				aria-pressed={state.timeFilter === filter.value}
				class="min-h-[44px] rounded-full border px-3 text-sm font-medium transition-colors {state.timeFilter ===
				filter.value
					? 'border-slate-900 bg-slate-900 text-white'
					: filter.value === 'overdue' && n > 0
						? 'border-red-200 bg-red-50 text-red-700 hover:bg-red-100'
						: 'border-slate-200 bg-white text-slate-600 hover:border-slate-300 hover:bg-slate-50'}"
			>
				{filter.label} <span class="font-bold tabular-nums">{n}</span>
			</button>
		{/each}
	</div>

	{#if state.anyFilterActive}
		<p class="mb-3 text-xs font-medium text-sky-600">
			{#if state.viewActive}
				Showing <span
					class="rounded-full bg-sky-100 px-1.5 py-0.5 text-[10px] font-medium text-sky-700"
					>{TASK_OWNER_VIEWS.find((view) => view.value === state.view)?.label} tasks</span
				>
				{#if state.tagFilterActive || state.queryActive || state.chipActive || state.timeActive}·{/if}
			{/if}
			{#if state.chipActive}
				Showing
				<span class="rounded-full bg-sky-100 px-1.5 py-0.5 text-[10px] font-medium text-sky-700">
					{state.chip === 'family' ? 'family tasks assigned to you' : `${state.chip} tasks`}
				</span>
				{#if state.tagFilterActive || state.queryActive || state.timeActive}·{/if}
			{/if}
			{#if state.tagFilterActive}
				Filtering by <span
					class="rounded-full bg-sky-100 px-1.5 py-0.5 text-[10px] font-medium text-sky-700"
					>#{state.tagFilter.trim().toLowerCase()}</span
				>
				{#if state.queryActive || state.timeActive}·{/if}
			{/if}
			{#if state.queryActive}
				Searching “{state.searchQuery.trim()}”
			{/if}
			{#if state.timeActive}
				{#if state.queryActive}·{/if}
				<span class="rounded-full bg-sky-100 px-1.5 py-0.5 text-[10px] font-medium text-sky-700"
					>{state.timeFilterLabel(state.timeFilter)}</span
				>
			{/if}
		</p>
	{/if}

	{#if state.matched.length === 0}
		<div class="flex flex-col items-center justify-center py-16 text-center">
			<svg class="mb-4 h-14 w-14 text-slate-300" fill="none" viewBox="0 0 24 24" stroke="currentColor">
				<path
					stroke-linecap="round"
					stroke-linejoin="round"
					stroke-width="1.5"
					d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4"
				/>
			</svg>
			<p class="text-lg font-medium text-slate-700">
				{state.anyFilterActive ? 'No matching tasks' : empty.title}
			</p>
			<p class="text-sm text-slate-500">
				{state.anyFilterActive
					? 'Try another chip, or clear the search and filters'
					: empty.hint}
			</p>
		</div>
	{/if}

	<!-- Two labelled lists cut from the same synced read: one-off leads,
	     recurring follows; an empty bucket prints no label at all. -->
	<div class="space-y-5">
		{#each [{ label: 'One-off', list: state.split.oneOff }, { label: 'Recurring', list: state.split.recurring }] as group (group.label)}
			{#if group.list.length > 0}
				<div data-testid="group-{group.label.toLowerCase()}">
					<h3
						class="mb-1.5 flex items-baseline gap-1.5 text-xs font-semibold uppercase tracking-wide text-slate-400"
					>
						{group.label}
						<span data-testid="group-count" class="tabular-nums">({group.list.length})</span>
					</h3>
					<div class="space-y-1.5">
						{#each group.list as task (task.id)}
							{#if task.completedAt}
								<TaskDoneRow
									{task}
									busy={state.busyId === task.id}
									onToggle={() => state.toggle(task.id)}
									onDelete={() => state.remove(task.id)}
								/>
							{:else}
								<TaskRow
									{task}
									{currentUserId}
									assigneeName={task.assignedTo ? state.memberName(task.assignedTo) : ''}
									busy={state.busyId === task.id}
									focusBusy={state.focusBusyId === task.id}
									celebrating={state.celebratingId === task.id}
									onToggle={() => state.toggle(task.id)}
									onFocus={() => state.toggleFocus(task)}
									onEdit={() => state.openEditor(task)}
									onAccept={() => state.respond(task, true)}
									onDecline={() => state.respond(task, false)}
									onSkip={() => state.skip(task.id)}
									onDelete={() => state.remove(task.id)}
								/>
							{/if}
						{/each}
					</div>
				</div>
			{/if}
		{/each}
	</div>

	{#if state.matched.length > 0 && state.rows.length === 0}
		<p
			class="rounded-xl border border-dashed border-slate-200 py-8 text-center text-sm text-slate-500"
		>
			Nothing {timeLabel} right now.
			<button
				type="button"
				onclick={() => state.setTimeFilter('all')}
				class="font-semibold text-primary-600 hover:underline">Show all {state.matched.length}</button
			>
		</p>
	{/if}

	{#if state.openTasks.length === 0 && state.completedTasks.length > 0 && !state.anyFilterActive}
		<div class="rounded-xl border border-dashed border-slate-200 py-10 text-center">
			<p class="text-sm font-medium text-emerald-600">All caught up 🎉</p>
			<p class="text-sm text-slate-500">Nothing open right now</p>
		</div>
	{/if}

	{#if state.filteredDone.length > 0}
		<div class="mt-6 flex items-center justify-end gap-2 border-t border-slate-100 pt-3">
			{#if state.completedThisWeek > 0}
				<span class="mr-auto text-xs text-emerald-600">· {state.completedThisWeek} completed this week</span>
			{/if}
			<ConfirmAction
				label="Clear completed"
				ask="Delete all completed?"
				confirmLabel="Yes, delete"
				cancelLabel="No"
				pendingLabel="Deleting…"
				testid="clear-completed"
				onconfirm={() => state.clearCompleted()}
			/>
		</div>
	{/if}
</section>
