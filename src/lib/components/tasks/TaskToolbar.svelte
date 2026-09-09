<script lang="ts" module>
	/** Main-list filter chips (issue 019). 'family' = family tasks assigned to me. */
	export type TaskChip = 'all' | 'public' | 'private' | 'family';

	export const CHIPS: { value: TaskChip; label: string }[] = [
		{ value: 'all', label: 'All' },
		{ value: 'public', label: 'Public' },
		{ value: 'private', label: 'Private' },
		{ value: 'family', label: 'Family' }
	];
</script>

<script lang="ts">
	import type { TaskSortKey } from '$lib/utils/taskSort';

	interface Props {
		chip: TaskChip;
		searchQuery: string;
		sortBy: TaskSortKey;
		tagFilter: string;
	}

	let {
		chip = $bindable(),
		searchQuery = $bindable(),
		sortBy = $bindable(),
		tagFilter = $bindable()
	}: Props = $props();
</script>

<!-- Filter chips (issue 019): single-select pills over the ONE main list -->
<div class="mb-3 mt-3 flex flex-wrap gap-1.5" role="group" aria-label="Filter tasks by scope">
	{#each CHIPS as c (c.value)}
		<button
			type="button"
			onclick={() => (chip = c.value)}
			aria-pressed={chip === c.value}
			class="min-h-[44px] rounded-full border px-3.5 text-sm font-medium transition-colors {chip ===
			c.value
				? 'border-slate-900 bg-slate-900 text-white'
				: 'border-slate-200 bg-white text-slate-600 hover:border-slate-300 hover:bg-slate-50'}"
		>
			{c.label}
		</button>
	{/each}
</div>
<!-- Search + sort + tag filter -->
<div class="mb-4 space-y-2">
	<div class="flex flex-col gap-2 sm:flex-row">
		<div class="relative flex-1">
			<input
				type="text"
				bind:value={searchQuery}
				placeholder="Search tasks…"
				aria-label="Search tasks"
				class="w-full rounded-lg border border-slate-300 bg-white py-2 pl-8 pr-8 text-sm text-slate-700 placeholder:text-slate-400 focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500"
			/>
			<svg
				class="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400"
				fill="none"
				viewBox="0 0 24 24"
				stroke="currentColor"
				stroke-width="2"
			>
				<path
					stroke-linecap="round"
					stroke-linejoin="round"
					d="M21 21l-4.35-4.35M17 11a6 6 0 11-12 0 6 6 0 0112 0z"
				/>
			</svg>
			{#if searchQuery}
				<button
					type="button"
					onclick={() => (searchQuery = '')}
					class="absolute right-1 top-1/2 -translate-y-1/2 rounded-full p-1.5 text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-600"
					aria-label="Clear search"
					title="Clear search"
				>
					<svg
						class="h-4 w-4"
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
		<label class="flex w-full items-center gap-2 text-sm text-slate-500 sm:w-auto">
			<span class="shrink-0">Sort</span>
			<select
				bind:value={sortBy}
				aria-label="Sort tasks"
				class="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-700 focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500 sm:w-auto"
			>
				<option value="due">Due date</option>
				<option value="priority">Priority</option>
				<option value="created">Created</option>
				<option value="title">Title A–Z</option>
			</select>
		</label>
	</div>
	<div class="relative">
		<span
			class="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-sm font-bold text-slate-400"
			aria-hidden="true">#</span
		>
		<input
			type="text"
			bind:value={tagFilter}
			placeholder="Filter by #tag…"
			aria-label="Filter tasks by tag"
			title="Prefix match: typing “gro” matches #groceries"
			class="w-full rounded-lg border border-slate-300 bg-white py-2 pl-8 pr-8 text-sm text-slate-700 placeholder:text-slate-400 focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500"
		/>
		{#if tagFilter}
			<button
				type="button"
				onclick={() => (tagFilter = '')}
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
</div>
