<script lang="ts">
	import type { TaskSortKey } from '$lib/utils/taskSort';
	import TaskTagFilter from './TaskTagFilter.svelte';

	interface Props {
		searchQuery: string;
		sortBy: TaskSortKey;
		tagFilter: string;
	}

	let {
		searchQuery = $bindable(),
		sortBy = $bindable(),
		tagFilter = $bindable()
	}: Props = $props();

	let queryActive = $derived(searchQuery.trim().length > 0);
	let filterActive = $derived(tagFilter.trim().length > 0 || queryActive);
</script>

<div class="mb-4 space-y-2">
	<div class="flex flex-col gap-2 sm:flex-row">
		<div class="relative flex-1">
			<input
				type="text"
				bind:value={searchQuery}
				placeholder="Search tasks…"
				aria-label="Search tasks"
				class="w-full rounded-lg border border-slate-300 bg-white py-2 pl-9 pr-9 text-sm text-slate-700 placeholder:text-slate-400 focus:border-primary-500 focus:outline-none"
			/>
			<svg
				class="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400"
				fill="none"
				viewBox="0 0 24 24"
				stroke="currentColor"
				stroke-width="2"
			>
				<path
					stroke-linecap="round"
					stroke-linejoin="round"
					d="M21 21l-4.35-4.35M17 10.5a6.5 6.5 0 11-13 0 6.5 6.5 0 0113 0z"
				/>
			</svg>
			{#if searchQuery.trim()}
				<button
					type="button"
					onclick={() => (searchQuery = '')}
					aria-label="Clear search"
					class="absolute right-2 top-1/2 flex h-5 w-5 -translate-y-1/2 items-center justify-center rounded-full text-slate-400 hover:bg-slate-100 hover:text-slate-600"
				>
					<svg
						class="h-3.5 w-3.5"
						fill="none"
						viewBox="0 0 24 24"
						stroke="currentColor"
						stroke-width="2"
					>
						<path stroke-linecap="round" stroke-linejoin="round" d="M6 18L18 6M6 6l12 12" />
					</svg>
				</button>
			{/if}
		</div>
		<label class="flex items-center gap-2 text-sm text-slate-500">
			<span class="shrink-0">Sort</span>
			<select
				bind:value={sortBy}
				aria-label="Sort tasks"
				class="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-700 focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500"
			>
				<option value="due">Due date</option>
				<option value="priority">Priority</option>
				<option value="created">Created</option>
				<option value="title">Title A–Z</option>
			</select>
		</label>
	</div>
	<TaskTagFilter bind:tagFilter showNote={false} />
	{#if filterActive}
		<p class="text-xs text-sky-600">
			{#if tagFilter.trim()}
				Filtering by <span class="font-medium">#{tagFilter.trim().toLowerCase()}</span>
				{#if queryActive}·{/if}
			{/if}
			{#if queryActive}Searching “{searchQuery.trim()}”{/if}
		</p>
	{/if}
</div>
