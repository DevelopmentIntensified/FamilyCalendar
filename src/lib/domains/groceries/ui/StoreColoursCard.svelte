<!--
	The Store colours card: every shop the page knows (from BOTH scopes, in
	first-seen order) with its dot, a palette + Auto select per shop, ONE
	Everyone / Just me select for the whole card, the collision line, and the
	empty state explaining a shop appears once typed.

	The card has its OWN scope (115): sharing the group picker's control would
	let one silently retarget a flip made for a different shop. While a group's
	picker is open for a shop, that group owns the control, so the card shows
	"editing →" rather than a second select with the same name.

	Legacy `groceries/+page.svelte` is the reference for the copy and classes.

	Doc: ../README.md#public-interface
-->
<script lang="ts">
	import { STORE_COLOURS, groceryStoreKey } from '../groceries.colours.rules';
	import type { GroceriesListState } from '../groceries.list.state.svelte';

	interface Props {
		state: GroceriesListState;
	}

	let { state }: Props = $props();
</script>

<section aria-label="Store colours" class="rounded-xl border border-slate-200 p-3">
	<div class="flex items-center justify-between gap-2">
		<h2 class="text-xs font-bold uppercase tracking-wide text-slate-500">Store colours</h2>
		{#if state.hasFamily}
			<label class="sr-only" for="rail-colour-scope">Colour scope for the card</label>
			<select
				id="rail-colour-scope"
				class="max-w-[6.5rem] rounded-lg border border-slate-300 bg-white px-1 py-0.5 text-[0.625rem] font-semibold text-slate-600"
				aria-label="Colour scope for the card"
				value={state.railScope}
				onchange={(event) =>
					state.setRailScope(event.currentTarget.value === 'family' ? 'family' : 'personal')}
			>
				<option value="family">Everyone</option>
				<option value="personal">Just me</option>
			</select>
		{/if}
	</div>
	{#if state.colourStores.length === 0}
		<p class="mt-1 text-sm text-slate-500">
			No shops yet. Type one on an item and it turns up here with a colour of its own.
		</p>
	{:else}
		<ul class="mt-2">
			{#each state.colourStores as store, index (groceryStoreKey(store))}
				{@const tint = state.colourOf(store)}
				{@const twins = tint ? state.twinsOf(store, state.colourStores) : []}
				<li
					class="flex flex-wrap items-center gap-2 py-1.5 {index
						? 'border-t border-slate-100'
						: ''}"
				>
					<span
						class="h-3 w-3 shrink-0 rounded-full {tint ? tint.dot : 'bg-slate-400'}"
						aria-hidden="true"
					></span>
					<span class="min-w-0 flex-1 truncate text-sm font-semibold text-slate-800">
						{store}
					</span>
					{#if state.colourStore === store}
						<!-- One picker per shop. While its group is open for editing,
						     that group owns the control, so the shop never answers to
						     two selects with the same name. -->
						<span class="text-[0.625rem] font-semibold text-slate-400">editing →</span>
					{:else}
						{@const choice = state.pickerValue(store, state.railScope)}
						<label class="sr-only" for="rail-colour-{groceryStoreKey(store)}"
							>Colour for {store}</label
						>
						<select
							id="rail-colour-{groceryStoreKey(store)}"
							class="max-w-[7.5rem] rounded-lg border border-slate-300 bg-white px-1.5 py-1 text-xs font-semibold"
							aria-label="Colour for {store}"
							value={choice}
							disabled={state.colourBusy}
							onchange={(event) =>
								state.setColour(store, event.currentTarget.value, state.railScope)}
						>
							{#each STORE_COLOURS as swatch (swatch.key)}
								<option value={swatch.key} selected={swatch.key === choice}>{swatch.label}</option>
							{/each}
							<option value="auto" selected={choice === 'auto'}>Auto</option>
						</select>
					{/if}
					{#if twins.length > 0 && tint}
						<!-- A collision is never silent. -->
						<p class="w-full text-[0.6875rem] leading-snug text-slate-400">
							shares {tint.label} with {twins.join(', ')}
						</p>
					{/if}
				</li>
			{/each}
		</ul>
		<p class="mt-2 text-[0.6875rem] leading-snug text-slate-400">
			{state.colourStores.length}
			{state.colourStores.length === 1 ? 'store' : 'stores'}, {STORE_COLOURS.length} swatches.
			{#if state.sharedStores.length > 0}
				<b>{state.sharedStores.length} of them land on the same swatch</b> — {state.sharedStores.join(
					', '
				)}. A collision is permitted and always named here and on the group.
			{:else}
				No two stores land on the same swatch.
			{/if}
		</p>
	{/if}
</section>
