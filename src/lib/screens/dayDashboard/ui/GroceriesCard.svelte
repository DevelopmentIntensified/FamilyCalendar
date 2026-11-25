<!--
	Groceries: the open count, one section per non-empty list (family first) with
	store chips and up to three names then `+N more`, and an empty state that
	links at the right scope (`family` only when a family exists).

	Legacy reference: `components/dashboard/GroceriesCard.svelte` (081).
-->
<script lang="ts">
	import { groceryStoreGroups } from '$lib/domains/groceries';
	import type { DashboardGroceryRow } from '../dayDashboard.contract';

	interface Props {
		/** Open items in the shared family list. */
		familyItems: readonly DashboardGroceryRow[];
		/** Open items on the viewer's own list. */
		mineItems: readonly DashboardGroceryRow[];
		/** Whether the viewer is in a family at all — no family, no Family list. */
		hasFamily: boolean;
	}

	let { familyItems, mineItems, hasFamily }: Props = $props();

	/** How many names a scope shows before it says "+N more". */
	const NAMED = 3;

	const scopes = $derived([
		...(hasFamily && familyItems.length > 0
			? [{ key: 'family' as const, label: 'Family', items: familyItems }]
			: []),
		...(mineItems.length > 0
			? [{ key: 'mine' as const, label: 'Mine', items: mineItems }]
			: [])
	]);
	const openTotal = $derived(familyItems.length + mineItems.length);
	/** Where "Open the list" goes when there is nothing to name. */
	const emptyHref = $derived(hasFamily ? '/calendar/groceries?scope=family' : '/calendar/groceries?scope=mine');
</script>

<div class="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm" data-testid="groceries-card">
	<div class="mb-2 flex flex-wrap items-baseline justify-between gap-2">
		<h2 class="text-sm font-semibold text-slate-900">Groceries</h2>
		{#if openTotal > 0}
			<span class="text-xs text-slate-500" data-testid="groceries-open-total">{openTotal} open</span>
		{/if}
	</div>

	{#if scopes.length === 0}
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
							href={`/calendar/groceries?scope=${scope.key}`}
							class="text-[11px] font-semibold uppercase tracking-wide text-slate-400 hover:text-slate-600"
							>{scope.label} →</a
						>
						<span class="text-xs text-slate-500">{scope.items.length} open</span>
					</div>
					<div data-testid="groceries-stores" class="mt-1 flex flex-wrap gap-1">
						{#each groceryStoreGroups(scope.items) as group (group.store)}
							<span class="rounded-full bg-slate-100 px-1.5 py-0.5 text-[10px] font-semibold text-slate-600"
								>{group.store}</span
							>
						{/each}
					</div>
					<p class="mt-1 break-words text-sm text-slate-700">
						{scope.items
							.slice(0, NAMED)
							.map((item) => item.name)
							.join(', ')}{#if scope.items.length > NAMED}, +{scope.items.length - NAMED} more{/if}
					</p>
				</section>
			{/each}
		</div>
	{/if}
</div>
