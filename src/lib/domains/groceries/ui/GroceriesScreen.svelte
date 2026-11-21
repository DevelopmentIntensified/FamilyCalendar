<!--
	The `/calendar/groceries` page body: one list, ONE scope filter over it
	(not two tabs), grouped by Store. The screen builds the page state class
	(api + toasts in its constructor) and lays out the rail's three cards beside
	the list; it fetches nothing itself.

	Layout, copy and spacing are the legacy page's (the visual check compares
	that page): one column below 950px, `21rem + 1fr` at/above it, and the
	`grocery-layout` test id the page catalog waits on.

	Doc: ../README.md#public-interface
-->
<script lang="ts">
	import { createToasts } from '$lib/kernel/client/toasts.svelte';
	import Toaster from '$lib/kernel/ui/Toaster.svelte';
	import { createGroceryApi, type GroceryApi } from '../groceries.api';
	import type { GroceriesPageData } from '../groceries.contract';
	import { GroceriesListState } from '../groceries.list.state.svelte';
	import GroceryCheckedRail from './GroceryCheckedRail.svelte';
	import GroceryGroup from './GroceryGroup.svelte';
	import GrocerySideRail from './GrocerySideRail.svelte';
	import StoreColoursCard from './StoreColoursCard.svelte';

	interface Props {
		data: GroceriesPageData;
		/** The raw `?scope=` the route received; junk falls back to All. */
		scopeParam?: string | null;
		/** Injected by tests; the browser default talks to `/api/groceries`. */
		api?: GroceryApi;
	}

	let { data, scopeParam = null, api = createGroceryApi() }: Props = $props();

	const toasts = createToasts();
	const state = new GroceriesListState(api, toasts, data, { scopeParam });
</script>

<svelte:head>
	<title>Groceries — FamilyPlanz</title>
</svelte:head>

<div class="mx-auto w-full max-w-5xl px-4 py-6">
	<h1 class="text-2xl font-bold">Groceries</h1>

	<!-- groceries.html, approved, and measured: `.wrapx` is ONE column at 949px
	     and `336px + 590px` at 990px, i.e. the break is 950px and the rail is
	     21rem. The app broke at `lg` (1024px), so between those widths a rail
	     and a list that both fit were stacked. -->
	<div
		data-testid="grocery-layout"
		class="mt-4 grid items-start gap-6 min-[950px]:grid-cols-[21rem_minmax(0,1fr)]"
	>
		<!-- ── side rail: scope filter, search, add field, checked rail ── -->
		<div class="min-w-0 space-y-4">
			<GrocerySideRail {state} />
			<GroceryCheckedRail {state} />
			<StoreColoursCard {state} />
		</div>

		<!-- ── the list, grouped by Store ── -->
		<section aria-label="Items by store" class="min-w-0">
			{#if state.visibleItems.length === 0}
				<p class="py-10 text-center text-sm text-slate-500">{state.emptyCopy}</p>
			{:else}
				{#each state.groups as group (group.store)}
					{@const twins = group.colour ? state.twinsOf(group.store) : []}
					<GroceryGroup {state} {group} {twins} />
				{/each}
			{/if}
		</section>
	</div>
</div>

<Toaster items={toasts.items} ondismiss={toasts.dismiss} />
