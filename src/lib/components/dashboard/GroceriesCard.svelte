<script module lang="ts">
	/** One open Grocery Item, projected to the two fields the card reads. */
	export type GroceryCardItem = { name: string; stores: string[] };
</script>

<script lang="ts">
	import { groupGroceriesByStore } from '$lib/data/groceries';

	/** Open items in the shared family list. */
	export let familyItems: GroceryCardItem[] = [];
	/** Open items on the viewer's own list. */
	export let mineItems: GroceryCardItem[] = [];
	/** Whether the viewer is in a family at all — no family, no Family list. */
	export let hasFamily = false;
	/** How many names a scope shows before it says "+N more". */
	const NAMED = 3;

	const href = (scope: 'family' | 'mine') => `/calendar/groceries?scope=${scope}`;

	/** The scopes worth reading, family first — the shared list is the day's. */
	$: scopes = [
		...(hasFamily && familyItems.length > 0
			? [{ key: 'family' as const, label: 'Family', items: familyItems }]
			: []),
		...(mineItems.length > 0 ? [{ key: 'mine' as const, label: 'Mine', items: mineItems }] : [])
	];

	$: openTotal = familyItems.length + mineItems.length;
	/** Where "Open the list" goes when there is nothing to name. */
	$: emptyHref = hasFamily ? href('family') : href('mine');

	/** Primary stores the scope spans, via the same grouping the list uses. */
	function storesOf(items: GroceryCardItem[]): string[] {
		return groupGroceriesByStore(items).map((group) => group.store);
	}
</script>

<div class="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm" data-testid="groceries-card">
	<div class="mb-2 flex flex-wrap items-baseline justify-between gap-2">
		<h2 class="text-sm font-semibold text-slate-900">Groceries</h2>
		{#if openTotal > 0}
			<span class="text-xs text-slate-500" data-testid="groceries-open-total">{openTotal} open</span
			>
		{/if}
	</div>

	{#if scopes.length === 0}
		<!-- A list with nothing on it is fine, not broken: say so and stop. -->
		<p class="text-sm text-slate-500">Nothing on the list yet.</p>
		<a
			href={emptyHref}
			data-testid="groceries-link"
			class="mt-2 inline-flex min-h-11 items-center text-sm font-medium text-primary-600 hover:text-primary-700"
		>
			Open the list →
		</a>
	{:else}
		<div class="space-y-3">
			{#each scopes as scope (scope.key)}
				<section data-testid="groceries-scope-{scope.key}">
					<div class="flex flex-wrap items-baseline justify-between gap-x-2 gap-y-1">
						<a
							href={href(scope.key)}
							class="text-[11px] font-semibold uppercase tracking-wide text-slate-400 hover:text-slate-600"
							>{scope.label} →</a
						>
						<span class="text-xs text-slate-500">{scope.items.length} open</span>
					</div>
					<div data-testid="groceries-stores" class="mt-1 flex flex-wrap gap-1">
						{#each storesOf(scope.items) as store (store)}
							<span
								class="rounded-full bg-slate-100 px-1.5 py-0.5 text-[10px] font-semibold text-slate-600"
								>{store}</span
							>
						{/each}
					</div>
					<p class="mt-1 break-words text-sm text-slate-700">
						{scope.items
							.slice(0, NAMED)
							.map((item) => item.name)
							.join(', ')}{#if scope.items.length > NAMED}, +{scope.items.length -
							NAMED} more{/if}
					</p>
				</section>
			{/each}
		</div>
	{/if}
</div>
