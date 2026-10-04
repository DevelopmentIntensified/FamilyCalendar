<script lang="ts" module>
	/** Main-list filter chips (issue 019). 'family' = family tasks assigned to me. */
	export type TaskChip = 'all' | 'public' | 'private' | 'family';

	export const CHIPS: { value: TaskChip; label: string }[] = [
		{ value: 'all', label: 'Every scope' },
		{ value: 'public', label: 'Public' },
		{ value: 'private', label: 'Private' },
		{ value: 'family', label: 'Family' }
	];

	/**
	 * The approved owner axis (`tasks.html`). Which bucket of the queue is on
	 * screen — the prototype's own four, in its own order.
	 *
	 * Its third bucket was labelled "Assigned to me" while its predicate was
	 * "assigned to somebody else". The structure is approved and kept; the label
	 * is made true, because a control that lies about what it filters is not a
	 * vocabulary.
	 */
	export type TaskView = 'open' | 'mine' | 'unassigned' | 'done';

	export const VIEWS: { value: TaskView; label: string }[] = [
		{ value: 'open', label: 'Open' },
		{ value: 'mine', label: 'Mine' },
		{ value: 'unassigned', label: 'Unassigned' },
		{ value: 'done', label: 'Done' }
	];
</script>

<script lang="ts">
	import type { TaskSortKey } from '$lib/utils/taskSort';

	interface Props {
		chip: TaskChip;
		searchQuery: string;
		sortBy: TaskSortKey;
		tagFilter: string;
		/** The approved owner axis. `Open` is the default, as it is on the page. */
		view?: TaskView;
		/** What every control on this line left, so pressing one is never a
		 *  control that did nothing. With a query it also names the total it
		 *  narrowed, which is the only place `totalCount` is read. */
		matchCount?: number;
		totalCount?: number;
	}

	let {
		chip = $bindable(),
		searchQuery = $bindable(),
		sortBy = $bindable(),
		tagFilter = $bindable(),
		view = $bindable('open'),
		matchCount = 0,
		totalCount = 0
	}: Props = $props();

	let query = $derived(searchQuery.trim());
</script>

<!-- `tasks.html`, approved: ONE filter line, under one live title. The review
     mark that produced the page was "add small search on this line", and the app
     had three rows — chips, a full-width field under them, then the tag filter.
     The field shares the line now. -->
<div class="mb-3 mt-3 flex items-baseline gap-2">
	<span class="shrink-0 text-sm font-medium text-slate-900">Filter</span>
	<span
		data-testid="task-filter-count"
		aria-live="polite"
		class="truncate text-xs tabular-nums text-slate-400"
	>
		{query ? `${matchCount} of ${totalCount} match “${query}”` : `${matchCount} tasks`}
	</span>
</div>

<div
	data-testid="task-filter-line"
	class="mb-3 flex flex-wrap items-center gap-1.5"
>
	<!-- The approved chips lead: they are the vocabulary the owner approved, and
	     they answer "whose queue am I looking at". -->
	<div class="flex flex-wrap gap-1.5" role="group" aria-label="Filter tasks by owner">
		{#each VIEWS as v (v.value)}
			<button
				type="button"
				onclick={() => (view = v.value)}
				aria-pressed={view === v.value}
				class="min-h-[44px] rounded-full border px-3.5 text-sm font-medium transition-colors {view ===
				v.value
					? 'border-slate-900 bg-slate-900 text-white'
					: 'border-slate-200 bg-white text-slate-600 hover:border-slate-300 hover:bg-slate-50'}"
			>
				{v.label}
			</button>
		{/each}
	</div>

	<div class="h-6 w-px shrink-0 bg-slate-200" aria-hidden="true"></div>

	<!-- 019's scope chips are a DIFFERENT axis and capability the prototype
	     cannot show, so they stay — beside the owner chips rather than under
	     them. `Every scope` rather than `All`: the time jump bar below already
	     owns the word `All`, and two chips with one name is a trap. -->
	<div class="flex flex-wrap gap-1.5" role="group" aria-label="Filter tasks by scope">
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

	<!-- `type="search"` gives the native clear ✕ for free: at 115px (the 320px
	     case) a bespoke clear button would cost a fifth of the field. -->
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
			bind:value={searchQuery}
			placeholder="Search…"
			aria-label="Search tasks"
			class="h-11 w-full rounded-lg border border-slate-300 bg-white pl-8 pr-2 text-sm text-slate-700 placeholder:text-slate-400 focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500"
		/>
	</div>

	<label class="flex items-center gap-2 text-sm text-slate-500">
		<span class="shrink-0">Sort</span>
		<select
			bind:value={sortBy}
			aria-label="Sort tasks"
			class="h-11 rounded-lg border border-slate-300 bg-white px-2 text-sm text-slate-700 focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500"
		>
			<!-- Urgency is 101's default and stays first; the prototype's three
			     are all here, and `Created` is capability it has no field for. -->
			<option value="urgency">Urgency</option>
			<option value="due">Due date</option>
			<option value="priority">Priority</option>
			<option value="created">Created</option>
			<option value="title">Title A–Z</option>
		</select>
	</label>
</div>

<!-- The tag filter stays on its own row: it is a third axis the approved page
     has no control for, and merging it into the line would bury it. -->
<div class="relative mb-4">
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