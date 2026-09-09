<script lang="ts">
	import TaskRow, { type TaskRowTask } from './TaskRow.svelte';
	import TaskCompletedRow from './TaskCompletedRow.svelte';
	import TaskToolbar, { type TaskChip } from './TaskToolbar.svelte';

	interface Props {
		chip: TaskChip;
		searchQuery: string;
		sortBy: 'due' | 'priority' | 'created' | 'title';
		tagFilter: string;
		loaded: boolean;
		openCount: number;
		completedCount: number;
		completedThisWeek: number;
		filteredOpen: TaskRowTask[];
		filteredCompleted: TaskRowTask[];
		currentUserId: string | undefined;
		busyId: string | null;
		celebratingId: string | null;
		confirmDeleteId: string | null;
		confirmClear: boolean;
		clearBusy: boolean;
		assigneeName: (task: TaskRowTask) => string;
		onToggle: (id: string) => void;
		onEdit: (task: TaskRowTask) => void;
		onRespond: (task: TaskRowTask, accept: boolean) => void;
		onAdvance: (id: string) => void;
		onDelete: (id: string) => void;
		onAskDelete: (id: string) => void;
		onCancelDelete: () => void;
		onBeginClear: () => void;
		onCancelClear: () => void;
		onClearCompleted: () => void;
	}

	let {
		chip = $bindable(),
		searchQuery = $bindable(),
		sortBy = $bindable(),
		tagFilter = $bindable(),
		confirmClear = $bindable(),
		loaded,
		openCount,
		completedCount,
		completedThisWeek,
		filteredOpen,
		filteredCompleted,
		currentUserId,
		busyId,
		celebratingId,
		confirmDeleteId,
		clearBusy,
		assigneeName,
		onToggle,
		onEdit,
		onRespond,
		onAdvance,
		onDelete,
		onAskDelete,
		onCancelDelete,
		onBeginClear,
		onCancelClear,
		onClearCompleted
	}: Props = $props();

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

	let tagFilterActive = $derived(tagFilter.trim().length > 0);
	let queryActive = $derived(searchQuery.trim().length > 0);
	let filterActive = $derived(tagFilterActive || queryActive);
	let chipActive = $derived(chip !== 'all');
</script>

<section
	class="mt-4 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm"
	aria-labelledby="tasks-list-heading"
>
	<h2 id="tasks-list-heading" class="text-sm font-semibold text-slate-900">Your tasks</h2>
	<p class="mt-0.5 text-xs text-slate-400">Filter, search, and sort your list</p>

	<TaskToolbar bind:chip bind:searchQuery bind:sortBy bind:tagFilter />

	{#if filterActive || chipActive}
		<p class="mb-3 text-xs font-medium text-sky-600">
			{#if chipActive}
				Showing
				<span class="rounded-full bg-sky-100 px-1.5 py-0.5 text-[10px] font-medium text-sky-700">
					{chip === 'family' ? 'family tasks assigned to you' : `${chip} tasks`}
				</span>
				{#if tagFilterActive || queryActive}·{/if}
			{/if}
			{#if tagFilterActive}
				Filtering by <span
					class="rounded-full bg-sky-100 px-1.5 py-0.5 text-[10px] font-medium text-sky-700"
					>#{tagFilter.trim().toLowerCase()}</span
				>
				{#if queryActive}·
				{/if}
			{/if}
			{#if queryActive}
				Searching “{searchQuery.trim()}”
			{/if}
		</p>
	{/if}

	{#if !loaded}
		<div class="space-y-1.5" aria-hidden="true">
			{#each Array(5) as _, i (i)}
				<div class="h-14 animate-pulse rounded-lg bg-slate-100"></div>
			{/each}
		</div>
	{:else if filteredOpen.length === 0 && filteredCompleted.length === 0}
		<div class="flex flex-col items-center justify-center py-16 text-center">
			<svg
				class="mb-4 h-14 w-14 text-slate-300"
				fill="none"
				viewBox="0 0 24 24"
				stroke="currentColor"
			>
				<path
					stroke-linecap="round"
					stroke-linejoin="round"
					stroke-width="1.5"
					d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4"
				/>
			</svg>
			<p class="text-lg font-medium text-slate-700">
				{filterActive || chipActive ? 'No matching tasks' : CHIP_EMPTY[chip].title}
			</p>
			<p class="text-sm text-slate-500">
				{filterActive || chipActive
					? 'Try another chip, or clear the search and filters'
					: CHIP_EMPTY[chip].hint}
			</p>
		</div>
	{/if}

	<!-- Open tasks -->
	{#if filteredOpen.length > 0}
		<h2
			class="mb-2 flex items-baseline gap-2 text-xs font-semibold uppercase tracking-wide text-slate-400"
		>
			<span>Open ({filteredOpen.length})</span>
		</h2>
	{/if}
	<div class="space-y-1.5">
		{#each filteredOpen as task (task.id)}
			<TaskRow
				{task}
				{currentUserId}
				assigneeName={assigneeName(task)}
				busy={busyId === task.id}
				celebrating={celebratingId === task.id}
				confirmDelete={confirmDeleteId === task.id}
				onToggle={() => onToggle(task.id)}
				onEdit={() => onEdit(task)}
				onAccept={() => onRespond(task, true)}
				onDecline={() => onRespond(task, false)}
				onAdvance={() => onAdvance(task.id)}
				onDelete={() => onDelete(task.id)}
				onAskDelete={() => onAskDelete(task.id)}
				{onCancelDelete}
			/>
		{/each}
	</div>

	{#if openCount === 0 && completedCount > 0 && !filterActive && !chipActive}
		<div class="rounded-xl border border-dashed border-slate-200 py-10 text-center">
			<p class="text-sm font-medium text-emerald-600">All caught up 🎉</p>
			<p class="text-sm text-slate-500">Nothing open right now</p>
		</div>
	{/if}

	<!-- Completed -->
	{#if filteredCompleted.length > 0}
		<h2
			class="mb-2 mt-8 flex items-baseline gap-2 text-xs font-semibold uppercase tracking-wide text-slate-400"
		>
			<span>Completed ({filteredCompleted.length})</span>
			{#if completedThisWeek > 0}
				<span class="ml-1 font-normal normal-case text-emerald-600"
					>· {completedThisWeek} this week</span
				>
			{/if}
			{#if confirmClear}
				<span class="ml-auto flex items-center gap-1.5 font-normal normal-case">
					<span class="text-xs font-medium text-red-600">Delete all completed?</span>
					<button
						type="button"
						onclick={onClearCompleted}
						disabled={clearBusy}
						class="rounded-full bg-red-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-red-700 disabled:opacity-50"
					>
						{clearBusy ? 'Deleting…' : 'Yes, delete'}
					</button>
					<button
						type="button"
						onclick={onCancelClear}
						disabled={clearBusy}
						class="rounded-full bg-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-300"
					>
						No
					</button>
				</span>
			{:else}
				<button
					type="button"
					class="ml-auto font-medium normal-case text-slate-400 transition-colors hover:text-red-500"
					onclick={onBeginClear}
				>
					Clear completed
				</button>
			{/if}
		</h2>
		<div class="space-y-1.5">
			{#each filteredCompleted as task (task.id)}
				<TaskCompletedRow
					{task}
					busy={busyId === task.id}
					confirmDelete={confirmDeleteId === task.id}
					onToggle={() => onToggle(task.id)}
					onDelete={() => onDelete(task.id)}
					onAskDelete={() => onAskDelete(task.id)}
					{onCancelDelete}
				/>
			{/each}
		</div>
	{/if}
</section>
