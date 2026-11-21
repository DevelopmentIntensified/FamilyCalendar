<!--
	The list's side rail: the scope filter chips with their counts, the
	"No family yet…" line, the search box with its "Searching “…”" hint and its
	clear button, the quick-add form with the explicit "Add to" scope, the Store
	Memory suggestion chip, the `known-stores` datalist, and the inline error
	region.

	Search is a filter over what is already loaded, not a request: both scopes
	are on the page. Same copy and classes as the legacy page (the visual check
	compares it).

	Doc: ../README.md#public-interface
-->
<script lang="ts">
	import type { GroceriesListState } from '../groceries.list.state.svelte';
	import { GROCERY_SCOPE_FILTERS } from '../groceries.scope.rules';

	interface Props {
		state: GroceriesListState;
	}

	let { state }: Props = $props();
</script>

<div class="min-w-0 space-y-4">
	<!-- One list, one filter — the same single-select chip idiom the tasks page
	     uses, so the two pages filter the same way. -->
	<div class="flex flex-wrap gap-1.5" role="group" aria-label="Filter groceries by scope">
		{#each GROCERY_SCOPE_FILTERS as scope (scope.key)}
			<button
				type="button"
				aria-pressed={state.filter === scope.key}
				class="min-h-[44px] shrink-0 rounded-full border px-3.5 text-sm font-medium transition-colors {state.filter ===
				scope.key
					? 'border-slate-900 bg-slate-900 text-white'
					: 'border-slate-200 bg-white text-slate-600 hover:border-slate-300 hover:bg-slate-50'}"
				onclick={() => state.setFilter(scope.key)}
				>{scope.label}<span class="ml-1.5 text-xs font-normal opacity-70"
					>{state.count(scope.key)}</span
				></button
			>
		{/each}
	</div>

	<!-- A statement about the FAMILY scope, not about the page. -->
	{#if !state.hasFamily && state.filter !== 'mine'}
		<p class="text-sm text-slate-600">
			No family yet — join or create one to use the shared list.
		</p>
	{/if}

	<div class="relative">
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
			type="text"
			class="w-full rounded-lg border border-slate-300 bg-white py-2 pl-8 pr-8 text-sm text-slate-700 placeholder:text-slate-400 focus:border-primary-500 focus:outline-none"
			placeholder="Search items or stores…"
			aria-label="Search groceries"
			value={state.searchQuery}
			oninput={(event) => state.setSearch(event.currentTarget.value)}
		/>
		{#if state.searchQuery.trim()}
			<button
				type="button"
				class="absolute right-1 top-1/2 -translate-y-1/2 rounded-full p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-600"
				aria-label="Clear search"
				onclick={() => state.clearSearch()}
			>
				<svg
					class="h-4 w-4"
					fill="none"
					viewBox="0 0 24 24"
					stroke="currentColor"
					stroke-width="2"
					aria-hidden="true"
				>
					<path stroke-linecap="round" stroke-linejoin="round" d="M18 6L6 18M6 6l12 12" />
				</svg>
			</button>
		{/if}
	</div>
	{#if state.queryActive}
		<p class="text-xs text-sky-600">Searching “{state.searchQuery.trim()}”</p>
	{/if}

	<form
		class="flex min-w-0 flex-col gap-2"
		aria-label="Add a grocery item"
		onsubmit={(event) => {
			event.preventDefault();
			void state.add();
		}}
	>
		<div class="flex min-w-0 gap-2">
			<input
				class="min-w-0 flex-1 rounded-lg border border-slate-300 bg-white text-slate-700 placeholder:text-slate-400 focus:border-primary-500 focus:outline-none px-3 py-2"
				placeholder="Quick-add, e.g. “milk 2”"
				value={state.input}
				oninput={(event) => state.setInput(event.currentTarget.value)}
				aria-label="Add grocery item"
			/>
			<button
				type="submit"
				disabled={state.adding || !state.input.trim()}
				class="shrink-0 rounded-lg bg-primary-600 px-4 hover:bg-primary-700 py-2 text-sm font-semibold text-white disabled:opacity-40"
			>
				{state.adding ? 'Adding…' : 'Add'}
			</button>
		</div>

		<!-- The scope the new row will use is stated on the form, not inferred
		     from a tab that no longer exists. -->
		<label class="flex items-center gap-2 text-xs text-slate-500">
			<span class="shrink-0">Add to</span>
			<select
				class="min-w-0 flex-1 rounded-lg border border-slate-300 bg-white px-2 py-1.5 text-sm text-slate-700"
				aria-label="Add to"
				value={state.addScope}
				onchange={(event) =>
					state.setAddScope(event.currentTarget.value === 'family' ? 'family' : 'mine')}
			>
				{#if state.hasFamily}<option value="family">Family (shared)</option>{/if}
				<option value="mine">Mine (private)</option>
			</select>
		</label>

		{#if state.suggested && !state.storeInput}
			<div class="flex flex-wrap items-center gap-1.5 text-xs text-slate-500">
				<span>Store Memory:</span>
				<button
					type="button"
					class="rounded-full border border-slate-300 bg-white px-2.5 py-1 font-semibold text-slate-700 hover:border-primary-500"
					aria-label="Use store {state.suggested}"
					onclick={() => state.useSuggestion()}>{state.suggested}</button
				>
			</div>
		{/if}

		<input
			class="w-full min-w-0 rounded-lg border border-slate-300 bg-white text-slate-700 placeholder:text-slate-400 focus:border-primary-500 focus:outline-none px-3 py-1.5 text-sm"
			placeholder="Store (optional, comma = alternates)"
			list="known-stores"
			value={state.storeInput}
			oninput={(event) => state.setStoreInput(event.currentTarget.value)}
			aria-label="Stores for this item"
		/>
		<!-- Free text means a typo is a second store, and so a second colour.
		     Offer the shops already on the lists first. -->
		<datalist id="known-stores">
			{#each state.knownStores as store (store)}
				<option value={store}></option>
			{/each}
		</datalist>
	</form>

	{#if state.error}
		<p class="text-sm text-red-600" role="alert">{state.error}</p>
	{/if}
</div>
