<!--
	One Store group: the colour bar + dot, "<n> items · <total> total", the
	collision line ("shares Mint with …"), and the inline Colour picker with
	Everyone / Just me and Done. The rows inside it are `GroceryRow`s.

	The legacy `groceries/+page.svelte` header is the reference for the copy,
	classes and the picker's shape (the visual check compares that page). A
	group with no colour is the "Any store" group — the absence of a shop, so it
	gets no bar tint and no picker.

	Doc: ../README.md#public-interface
-->
<script lang="ts">
	import {
		STORE_COLOURS,
		groceryStoreKey,
		type GroceryColourScope,
		type GroceryGroup
	} from '../groceries.colours.rules';
	import type { GroceryListItem } from '../groceries.contract';
	import type { GroceriesListState } from '../groceries.list.state.svelte';
	import GroceryRow from './GroceryRow.svelte';

	interface Props {
		state: GroceriesListState;
		group: GroceryGroup<GroceryListItem>;
		/** The other shops on this swatch, named rather than hidden. */
		twins: readonly string[];
	}

	let { state, group, twins }: Props = $props();

	const tint = $derived(group.colour);
	const editing = $derived(state.colourStore === group.store);
	const choice = $derived(state.pickerValue(group.store, state.colourScope));

	function choose(scope: GroceryColourScope): void {
		state.setColourScope(scope);
	}
</script>

<section aria-label={group.store} class="mb-4 rounded-2xl border border-slate-200">
	<div
		class="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-t-2xl px-3 py-2 {tint
			? tint.bar
			: 'bg-slate-50'}"
	>
		<h2 class="flex min-w-0 items-center gap-2 text-sm font-extrabold text-slate-900">
			{#if tint}
				<span aria-hidden="true" class="h-2.5 w-2.5 shrink-0 rounded-full {tint.dot}"
				></span>
			{/if}
			<span class="truncate">{group.store}</span>
		</h2>
		<p class="text-xs text-slate-600">
			{state.summary(group.items)}{#if twins.length}
				· shares {tint?.label} with {twins.join(', ')}{/if}
		</p>
		{#if tint}
			<div class="ml-auto flex shrink-0 items-center gap-1.5">
				{#if editing}
					<div class="flex flex-wrap items-center gap-1.5">
						<label class="sr-only" for="colour-{groceryStoreKey(group.store)}"
							>Colour for {group.store}</label
						>
						<select
							id="colour-{groceryStoreKey(group.store)}"
							class="max-w-[9rem] rounded-lg border border-slate-300 bg-white px-1.5 py-1 text-xs font-semibold"
							aria-label="Colour for {group.store}"
							value={choice}
							disabled={state.colourBusy}
							onchange={(event) =>
								state.setColour(group.store, event.currentTarget.value, state.colourScope)}
						>
							{#each STORE_COLOURS as swatch (swatch.key)}
								<option value={swatch.key} selected={swatch.key === choice}>{swatch.label}</option>
							{/each}
							<option value="auto" selected={choice === 'auto'}>Auto</option>
						</select>
						{#if state.hasFamily}
							<label class="flex items-center gap-1 text-[0.6875rem] text-slate-600">
								<input
									type="radio"
									name="colour-scope"
									class="h-3 w-3"
									aria-label="Everyone"
									checked={state.colourScope === 'family'}
									onchange={() => choose('family')}
								/>Everyone
							</label>
							<label class="flex items-center gap-1 text-[0.6875rem] text-slate-600">
								<input
									type="radio"
									name="colour-scope"
									class="h-3 w-3"
									aria-label="Just me"
									checked={state.colourScope === 'personal'}
									onchange={() => choose('personal')}
								/>Just me
							</label>
						{/if}
						<button
							type="button"
							class="text-xs text-slate-500 underline"
							aria-label="Done editing colour for {group.store}"
							onclick={() => state.closeColour()}>Done</button
						>
					</div>
				{:else}
					<button
						type="button"
						class="rounded-full border border-slate-300 bg-white px-2 py-1 text-[0.6875rem] font-semibold text-slate-700 hover:border-primary-500"
						aria-label="Edit colour for {group.store}"
						onclick={() => state.openColour(group.store)}>Colour</button
					>
				{/if}
			</div>
		{/if}
	</div>
	<ul class="divide-y divide-slate-100">
		{#each group.items as item (item.id)}
			<GroceryRow {state} {item} />
		{/each}
	</ul>
</section>
