<!--
	One Grocery Item row: the check-off box, name ×quantity, the scope badge in
	WORDS (a colour means "which shop", never "which scope"), every store as its
	own coloured chip with "or" before the alternates, the primary additionally
	marked by a filled dot and a heavier ring, plus edit / move / delete and the
	inline comma-separated store editor.

	Same copy, classes and spacing as the legacy `groceries/+page.svelte` row
	(the visual check compares that page). Data and callbacks come from the
	page's state class; this component fetches nothing.

	Doc: ../README.md#public-interface
-->
<script lang="ts">
	import { groceryStoreKey, type StoreColour } from '../groceries.colours.rules';
	import type { GroceryListItem } from '../groceries.contract';
	import { cleanGroceryStores } from '../groceries.items.rules';
	import type { GroceriesListState } from '../groceries.list.state.svelte';
	import { groceryScopeOf } from '../groceries.scope.rules';

	interface Props {
		state: GroceriesListState;
		item: GroceryListItem;
	}

	let { state, item }: Props = $props();

	const rowScope = $derived(groceryScopeOf(item));
	const destination = $derived(rowScope === 'mine' ? 'Family' : 'Mine');
	const stores = $derived(cleanGroceryStores(item.stores));
	const busy = $derived(state.busyId === item.id);
	const editing = $derived(state.editingId === item.id);

	function chipTint(store: string): StoreColour | null {
		return state.colourOf(store);
	}
</script>

<li class="px-3 py-2">
	<div class="flex min-w-0 flex-wrap items-center gap-2">
		<button
			role="checkbox"
			aria-checked="false"
			aria-label="Check off {item.name}"
			disabled={busy}
			class="h-5 w-5 shrink-0 rounded-md border-2 border-slate-300 hover:border-primary-500"
			onclick={() => state.check(item)}
		></button>
		<div class="min-w-0 flex-1">
			<p class="truncate text-sm font-semibold text-slate-800">
				{item.name}<span class="ml-1 text-xs font-bold text-slate-500">×{item.quantity}</span>
			</p>
			<p class="mt-0.5 flex flex-wrap items-center gap-x-1.5 text-xs">
				<!-- Which list this row belongs to, in WORDS. A group can hold both
				     scopes, and the store colour means "which store" — it must never
				     mean "which scope" as well, so this is text, not a hue. -->
				<span
					class="shrink-0 rounded bg-slate-100 px-1.5 py-0.5 text-[0.625rem] font-bold uppercase tracking-wide text-slate-500"
					>{rowScope === 'mine' ? 'Mine' : 'Family'}</span
				>
				{#each stores as store, index (groceryStoreKey(store))}
					{@const tint = chipTint(store)}
					{#if index === 1}
						<!-- Every store is its own coloured chip now, so without the
						     word a row reads "Aldi, Kroger" and primary/alternate
						     rides on a 2px ring alone. -->
						<span class="shrink-0 text-[0.6875rem] text-slate-400">or</span>
					{/if}
					<span
						title={tint
							? `${store} — ${tint.label}${index === 0 ? ' (the shop this row is grouped under)' : ''}`
							: store}
						class="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[0.6875rem] leading-none ring-inset {index ===
						0
							? 'font-bold ring-2 ring-current'
							: 'font-semibold ring-1 ring-current'} {tint
							? tint.chip
							: 'bg-slate-100 text-slate-700 ring-slate-300'}"
					>
						{#if index === 0}
							<!-- The second channel: this filled dot and the heavier ring name
							     the shop the row is filed under, so colouring every store
							     costs nothing. -->
							<span class="h-1.5 w-1.5 shrink-0 rounded-full bg-current" aria-hidden="true"
							></span>
						{/if}{store}</span
					>
				{/each}
			</p>
		</div>
		<div class="ml-auto flex shrink-0 items-center gap-1">
			<!-- The row carries all THREE actions as quiet icon buttons — edit,
			     move, delete — rather than hiding move behind an edit-mode the user
			     has to find first. -->
			<button
				class="flex h-7 w-7 items-center justify-center rounded-lg text-sm text-slate-400 hover:bg-slate-100 hover:text-slate-700"
				aria-label="Edit stores for {item.name}"
				title="Edit stores"
				onclick={() => state.startEditing(item)}>✎</button
			>
			<button
				class="flex h-7 w-7 items-center justify-center rounded-lg text-sm text-slate-400 hover:bg-slate-100 hover:text-slate-700"
				aria-label="Move {item.name} to {destination}"
				title="Move to {destination}"
				disabled={busy}
				onclick={() => state.move(item)}>⇄</button
			>
			<button
				class="flex h-7 w-7 items-center justify-center rounded-lg text-sm text-slate-400 hover:bg-red-50 hover:text-red-600"
				aria-label="Delete {item.name}"
				title="Delete"
				disabled={busy}
				onclick={() => state.removeItem(item)}>✕</button
			>
		</div>
	</div>

	{#if editing}
		<div
			class="mt-2 flex w-full min-w-0 flex-wrap items-center gap-2 border-t border-slate-100 pt-2 text-xs"
		>
			<input
				class="min-w-0 flex-1 basis-32 rounded border border-slate-300 bg-white text-slate-700 focus:border-primary-500 focus:outline-none px-2 py-1"
				placeholder="stores, comma-separated"
				value={state.editStores}
				oninput={(event) => state.setEditStores(event.currentTarget.value)}
				aria-label="Stores for {item.name}"
			/>
			<button
				class="font-semibold underline"
				aria-label="Save stores for {item.name}"
				onclick={() => state.saveStores(item)}>Save</button
			>
			<button
				class="text-slate-500 underline"
				aria-label="Cancel editing {item.name}"
				onclick={() => state.cancelEditing()}>Cancel</button
			>
		</div>
	{/if}
</li>
