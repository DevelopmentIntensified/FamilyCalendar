<script lang="ts">
	import { goto } from '$app/navigation';
	import type { PageData } from './$types';
	import Breadcrumbs from '$lib/components/Breadcrumbs.svelte';

	let { data }: { data: PageData } = $props();

	type Bucket = PageData['buckets'][number];
	type Slice = PageData['rangeSpend'][number];

	const PRESETS = [
		{ value: 'this-month', label: 'This month' },
		{ value: 'last-month', label: 'Last month' },
		{ value: 'last-3', label: 'Last 3 months' },
		{ value: 'last-6', label: 'Last 6 months' },
		{ value: 'this-year', label: 'This year' },
		{ value: 'all', label: 'All time' }
	];

	// Range picker state, kept in sync with the load (?range= navigations).
	let range = $state('last-6');
	let customFrom = $state('');
	let customTo = $state('');
	let loading = $state(false);
	let expandedCategory: string | null = $state(null);
	let expandedMerchant: string | null = $state(null);
	let topSort: 'cents' | 'count' = $state('cents');

	$effect(() => {
		range = data.range;
		customFrom = data.customFrom ?? '';
		customTo = data.customTo ?? '';
	});

	function dollars(cents: number): string {
		return (cents / 100).toFixed(2);
	}

	/** 'utilities' -> 'Utilities' for row labels. */
	function categoryLabel(category: string): string {
		return category.charAt(0).toUpperCase() + category.slice(1);
	}

	/** '2026-09' -> 'Sep 25' column header (locale-independent). */
	const MONTHS_SHORT = [
		'Jan',
		'Feb',
		'Mar',
		'Apr',
		'May',
		'Jun',
		'Jul',
		'Aug',
		'Sep',
		'Oct',
		'Nov',
		'Dec'
	];
	function monthLabel(month: string): string {
		const m = Number(month.slice(5, 7));
		const y = month.slice(2, 4);
		return m >= 1 && m <= 12 ? `${MONTHS_SHORT[m - 1]} ${y}` : month;
	}

	function dueLabel(dueDate: string | Date | null): string {
		if (!dueDate) return 'No due date';
		const d = new Date(dueDate);
		return Number.isNaN(d.getTime()) ? String(dueDate) : d.toLocaleDateString();
	}

	async function applyRange(next: string, from?: string, to?: string) {
		if (loading) return;
		loading = true;
		expandedCategory = null;
		expandedMerchant = null;
		try {
			const params = new URLSearchParams();
			params.set('range', next);
			if (next === 'custom') {
				if (from) params.set('from', from);
				if (to) params.set('to', to);
			}
			await goto(`/spending?${params.toString()}`);
		} finally {
			loading = false;
		}
	}

	function onRangeChange() {
		if (range === 'custom') return; // wait for the date inputs
		applyRange(range);
	}

	function onCustomChange() {
		if (customFrom || customTo) applyRange('custom', customFrom, customTo);
	}

	// Trend table: categories = rows (ordered by range total), months =
	// columns. Cell color intensity = share of that month's total.
	const categories = $derived(data.rangeSpend.map((slice) => slice.category));

	function centsFor(bucket: Bucket, category: string): number {
		return bucket.spend.find((slice) => slice.category === category)?.cents ?? 0;
	}

	function bucketTotal(bucket: Bucket): number {
		return bucket.spend.reduce((sum, slice) => sum + slice.cents, 0);
	}

	function intensity(cents: number, total: number): string {
		if (total <= 0 || cents <= 0) return 'transparent';
		const share = Math.min(1, cents / total);
		return `rgba(2, 132, 199, ${(0.08 + 0.8 * share).toFixed(3)})`;
	}

	const grandTotal = $derived(data.rangeSpend.reduce((sum, slice) => sum + slice.cents, 0));

	const hasSpend = $derived(grandTotal > 0 || data.undatedSpend.length > 0);

	// Drill-down: one shared expanded category; its slice may live in the
	// range totals or (under All time) in the Undated row.
	function sliceFor(category: string): Slice | undefined {
		return (
			data.rangeSpend.find((slice) => slice.category === category) ??
			data.undatedSpend.find((slice) => slice.category === category)
		);
	}

	const drillBills = $derived.by(() => {
		if (!expandedCategory) return [];
		const slice = sliceFor(expandedCategory);
		if (!slice) return [];
		return data.bills.filter((bill) => slice.billIds.includes(bill.id));
	});

	const drillTotal = $derived(expandedCategory ? (sliceFor(expandedCategory)?.cents ?? 0) : 0);

	// Top Items card: one aggregated list, re-sorted client-side.
	const sortedTopItems = $derived.by(() =>
		[...data.topItems].sort((a, b) =>
			topSort === 'cents' ? b.cents - a.cents : b.count - a.count || b.cents - a.cents
		)
	);

	// Top merchants (#035): bills grouped by normalized merchant title
	// (lowercased/trimmed — the spendByMerchant contract), folded here from
	// the load's in-range bills so no extra query is needed. Rows expand
	// into their bills reusing the drill-down bill row below.
	const merchants = $derived.by(() => {
		const groups = new Map<string, { merchant: string; cents: number; billIds: string[] }>();
		for (const bill of data.bills) {
			const key = bill.title.toLowerCase().trim().replace(/\s+/g, ' ');
			if (!key) continue;
			const group = groups.get(key);
			if (group) {
				group.cents += bill.amountCents;
				group.billIds.push(bill.id);
			} else {
				groups.set(key, {
					merchant: bill.title.trim(),
					cents: bill.amountCents,
					billIds: [bill.id]
				});
			}
		}
		return [...groups.values()].sort((a, b) => b.cents - a.cents).slice(0, 8);
	});

	const merchantBills = $derived.by(() => {
		if (!expandedMerchant) return [];
		const group = merchants.find((m) => m.merchant === expandedMerchant);
		if (!group) return [];
		return data.bills.filter((bill) => group.billIds.includes(bill.id));
	});

	const merchantTotal = $derived(
		expandedMerchant ? (merchants.find((m) => m.merchant === expandedMerchant)?.cents ?? 0) : 0
	);
</script>

<svelte:head>
	<title>Spending — Family Planz</title>
</svelte:head>

<div class="mx-auto max-w-2xl px-4 py-6 pb-20">
	<Breadcrumbs crumbs={[{ label: 'Calendar', href: '/calendar' }, { label: 'Spending' }]} />
	<h1 class="mt-2 text-2xl font-bold text-slate-900">Spending</h1>

	{#if data.loadWarnings.length > 0}
		<div
			class="mt-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800"
			role="alert"
		>
			Couldn't load {data.loadWarnings.join(', ')} just now — everything else is up to date.
		</div>
	{/if}

	{#snippet skeletonRows(count: number)}
		{#each Array(count) as _, i (i)}
			<div class="h-4 w-full overflow-hidden rounded-full bg-slate-100">
				<div class="h-full w-1/3 rounded-full bg-slate-200 motion-safe:animate-pulse"></div>
			</div>
		{/each}
	{/snippet}

	{#snippet cardHeader(title: string)}
		<h2 class="text-sm font-semibold text-slate-700">{title}</h2>
	{/snippet}

	<!-- Header card: range picker -->
	<section class="mt-4 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
		{@render cardHeader('Range')}
		<div class="mt-2 flex flex-col gap-2 sm:flex-row">
			<label class="flex-1">
				<span class="sr-only">Report range</span>
				<select
					class="min-h-[44px] w-full rounded border border-slate-300 px-3 py-2 text-sm"
					bind:value={range}
					onchange={onRangeChange}
					disabled={loading}
				>
					{#each PRESETS as preset (preset.value)}
						<option value={preset.value}>{preset.label}</option>
					{/each}
					<option value="custom">Custom range</option>
				</select>
			</label>
			{#if range === 'custom'}
				<label>
					<span class="sr-only">From date</span>
					<input
						class="min-h-[44px] rounded border border-slate-300 px-3 py-2 text-sm"
						type="date"
						aria-label="From date"
						bind:value={customFrom}
						oninput={onCustomChange}
						disabled={loading}
					/>
				</label>
				<label>
					<span class="sr-only">To date</span>
					<input
						class="min-h-[44px] rounded border border-slate-300 px-3 py-2 text-sm"
						type="date"
						aria-label="To date"
						bind:value={customTo}
						oninput={onCustomChange}
						disabled={loading}
					/>
				</label>
			{/if}
		</div>
	</section>

	{#if data.totalBills === 0}
		<div class="mt-6 flex flex-col items-center justify-center py-16 text-center">
			<svg
				class="mb-4 h-14 w-14 text-slate-300"
				fill="none"
				viewBox="0 0 24 24"
				stroke="currentColor"
			>
				<path
					stroke-linecap="round"
					stroke-linejoin="round"
					stroke-width="1.5"
					d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9h6m-6 4h4"
				/>
			</svg>
			<p class="text-lg font-medium text-slate-700">No spending yet</p>
			<p class="text-sm text-slate-500">Bills you add will show up here as spending reports.</p>
		</div>
	{:else}
		<!-- Trend: categories × months -->
		<section class="mt-4 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
			{@render cardHeader('Monthly trend by category')}
			{#if loading}
				<div class="mt-3 flex flex-col gap-2">{@render skeletonRows(4)}</div>
			{:else if !hasSpend}
				<p class="mt-2 text-sm text-slate-500">No bills in this range yet.</p>
			{:else}
				<div class="mt-2 min-w-0 overflow-x-auto">
					<table class="w-full min-w-[420px] border-collapse text-xs">
						<thead>
							<tr class="text-left text-slate-500">
								<th scope="col" class="py-1 pr-2 font-medium">Category</th>
								{#each data.buckets as bucket (bucket.month)}
									<th scope="col" class="px-1 py-1 text-right font-medium">
										{monthLabel(bucket.month)}
									</th>
								{/each}
							</tr>
						</thead>
						<tbody>
							{#each categories as category (category)}
								<tr>
									<th scope="row" class="py-0.5 pr-2 text-left font-medium text-slate-700">
										{categoryLabel(category)}
									</th>
									{#each data.buckets as bucket (bucket.month)}
										{@const total = bucketTotal(bucket)}
										{@const cents = centsFor(bucket, category)}
										<td
											class="px-1 py-0.5 text-right font-mono {cents > 0
												? 'text-slate-900'
												: 'text-slate-300'}"
											style="background-color: {intensity(cents, total)}"
										>
											{cents > 0 ? dollars(cents) : '·'}
										</td>
									{/each}
								</tr>
							{/each}
							<tr class="border-t border-slate-200 font-semibold text-slate-900">
								<th scope="row" class="py-1 pr-2 text-left">Total</th>
								{#each data.buckets as bucket (bucket.month)}
									<td class="px-1 py-1 text-right font-mono">{dollars(bucketTotal(bucket))}</td>
								{/each}
							</tr>
						</tbody>
					</table>
				</div>
				<p class="mt-1 text-[10px] text-slate-400">Darker = bigger share of the month.</p>
			{/if}
		</section>

		<!-- Range totals per category -->
		<section class="mt-4 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
			{@render cardHeader('Where it went')}
			{#if loading}
				<div class="mt-3 flex flex-col gap-2">{@render skeletonRows(3)}</div>
			{:else if data.rangeSpend.length === 0 && data.undatedSpend.length === 0}
				<p class="mt-2 text-sm text-slate-500">No spending in this range.</p>
			{:else}
				<ul class="mt-2 flex flex-col gap-1">
					{#each data.rangeSpend as slice (slice.category)}
						<li>
							<button
								type="button"
								class="min-h-[44px] w-full rounded-lg px-2 py-1.5 text-left transition-colors hover:bg-slate-100 {expandedCategory ===
								slice.category
									? 'bg-slate-100'
									: ''}"
								aria-pressed={expandedCategory === slice.category}
								onclick={() =>
									(expandedCategory = expandedCategory === slice.category ? null : slice.category)}
							>
								<div class="flex items-baseline justify-between gap-2 text-sm">
									<span class="font-medium text-slate-700">{categoryLabel(slice.category)}</span>
									<span class="font-mono text-slate-900">
										${dollars(slice.cents)}
										<span class="text-xs font-normal text-slate-500">
											{grandTotal > 0 ? Math.round((slice.cents / grandTotal) * 100) : 0}% ·
											{slice.billIds.length}
											{slice.billIds.length === 1 ? 'bill' : 'bills'}
										</span>
									</span>
								</div>
								<div class="mt-1 h-2 w-full overflow-hidden rounded-full bg-slate-100">
									<div
										class="h-full rounded-full bg-sky-500"
										style="width: {grandTotal > 0
											? Math.max(2, Math.round((slice.cents / grandTotal) * 100))
											: 2}%"
									></div>
								</div>
							</button>
						</li>
					{/each}
				</ul>
				{#if data.undatedSpend.length > 0}
					<p class="mt-3 text-xs font-semibold uppercase tracking-wide text-slate-400">
						Undated (no due month)
					</p>
					<ul class="mt-1 flex flex-col gap-1">
						{#each data.undatedSpend as slice (slice.category)}
							<li>
								<button
									type="button"
									class="min-h-[44px] w-full rounded-lg px-2 py-1.5 text-left transition-colors hover:bg-slate-100 {expandedCategory ===
									slice.category
										? 'bg-slate-100'
										: ''}"
									aria-pressed={expandedCategory === slice.category}
									onclick={() =>
										(expandedCategory =
											expandedCategory === slice.category ? null : slice.category)}
								>
									<div class="flex items-baseline justify-between gap-2 text-sm">
										<span class="font-medium text-slate-700">
											{categoryLabel(slice.category)}
										</span>
										<span class="font-mono text-slate-900">
											${dollars(slice.cents)} · {slice.billIds.length}
											{slice.billIds.length === 1 ? 'bill' : 'bills'}
										</span>
									</div>
								</button>
							</li>
						{/each}
					</ul>
				{/if}
			{/if}
		</section>

		<!-- Top items -->
		{#if data.topItems.length > 0}
			<section class="mt-4 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
				<div class="flex items-center justify-between gap-2">
					{@render cardHeader('Top line items')}
					<div class="flex gap-1" role="group" aria-label="Sort top items">
						<button
							type="button"
							class="min-h-[44px] rounded border px-2 py-1 text-xs font-semibold transition-colors {topSort ===
							'cents'
								? 'border-slate-900 bg-slate-900 text-white'
								: 'border-slate-300 text-slate-700 hover:bg-slate-50'}"
							aria-pressed={topSort === 'cents'}
							onclick={() => (topSort = 'cents')}
						>
							By total
						</button>
						<button
							type="button"
							class="min-h-[44px] rounded border px-2 py-1 text-xs font-semibold transition-colors {topSort ===
							'count'
								? 'border-slate-900 bg-slate-900 text-white'
								: 'border-slate-300 text-slate-700 hover:bg-slate-50'}"
							aria-pressed={topSort === 'count'}
							onclick={() => (topSort = 'count')}
						>
							Most often
						</button>
					</div>
				</div>
				{#if loading}
					<div class="mt-3 flex flex-col gap-2">{@render skeletonRows(3)}</div>
				{:else}
					<ul class="mt-2 flex flex-col divide-y divide-slate-100">
						{#each sortedTopItems as item (item.label)}
							<li class="flex items-center justify-between gap-2 py-2 text-sm">
								<span class="min-w-0 flex-1 truncate text-slate-700">{item.label}</span>
								<span
									class="shrink-0 rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-medium text-slate-600"
								>
									{categoryLabel(item.category)}
								</span>
								<span class="shrink-0 text-xs text-slate-500">×{item.count}</span>
								<span class="shrink-0 font-mono font-semibold text-slate-900">
									${dollars(item.cents)}
								</span>
							</li>
						{/each}
					</ul>
				{/if}
			</section>
		{/if}

		<!-- Top merchants -->
		{#if merchants.length > 0}
			<section class="mt-4 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
				{@render cardHeader('Top merchants')}
				{#if loading}
					<div class="mt-3 flex flex-col gap-2">{@render skeletonRows(3)}</div>
				{:else}
					<ul class="mt-2 flex flex-col divide-y divide-slate-100">
						{#each merchants as group (group.merchant)}
							<li>
								<button
									type="button"
									class="min-h-[44px] w-full rounded-lg px-2 py-1.5 text-left transition-colors hover:bg-slate-100 {expandedMerchant ===
									group.merchant
										? 'bg-slate-100'
										: ''}"
									aria-pressed={expandedMerchant === group.merchant}
									onclick={() =>
										(expandedMerchant =
											expandedMerchant === group.merchant ? null : group.merchant)}
								>
									<div class="flex items-baseline justify-between gap-2 text-sm">
										<span class="min-w-0 flex-1 truncate font-medium text-slate-700">
											{group.merchant}
										</span>
										<span class="shrink-0 font-mono text-slate-900">
											${dollars(group.cents)}
											<span class="text-xs font-normal text-slate-500">
												{group.billIds.length}
												{group.billIds.length === 1 ? 'bill' : 'bills'}
											</span>
										</span>
									</div>
								</button>
							</li>
						{/each}
					</ul>
				{/if}
			</section>
		{/if}

		<!-- Drill-down -->
		{#if expandedCategory}
			<section
				class="mt-4 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm"
				aria-label="Category bills"
			>
				<div class="flex items-center justify-between gap-2">
					<h2 class="text-sm font-semibold text-slate-700">
						{categoryLabel(expandedCategory)} — ${dollars(drillTotal)}
					</h2>
					<button
						type="button"
						class="min-h-[44px] rounded px-2 py-1 text-xs font-semibold text-sky-700 hover:bg-sky-50"
						onclick={() => (expandedCategory = null)}
					>
						Close
					</button>
				</div>
				<ul class="mt-2 flex flex-col divide-y divide-slate-100">
					{#each drillBills as bill (bill.id)}
						<li class="flex items-center justify-between gap-2 py-2 text-sm">
							<span class="min-w-0 flex-1 truncate font-medium text-slate-900">{bill.title}</span>
							<span class="shrink-0 text-xs text-slate-500">{dueLabel(bill.dueDate)}</span>
							<span class="shrink-0 font-mono font-semibold text-slate-900">
								${dollars(bill.amountCents)}
							</span>
						</li>
					{:else}
						<li class="py-2 text-sm text-slate-500">No bills in this view.</li>
					{/each}
				</ul>
			</section>
		{/if}

		<!-- Merchant drill-down -->
		{#if expandedMerchant}
			<section
				class="mt-4 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm"
				aria-label="Merchant bills"
			>
				<div class="flex items-center justify-between gap-2">
					<h2 class="text-sm font-semibold text-slate-700">
						{expandedMerchant} — ${dollars(merchantTotal)}
					</h2>
					<button
						type="button"
						class="min-h-[44px] rounded px-2 py-1 text-xs font-semibold text-sky-700 hover:bg-sky-50"
						onclick={() => (expandedMerchant = null)}
					>
						Close
					</button>
				</div>
				<ul class="mt-2 flex flex-col divide-y divide-slate-100">
					{#each merchantBills as bill (bill.id)}
						<li class="flex items-center justify-between gap-2 py-2 text-sm">
							<span class="min-w-0 flex-1 truncate font-medium text-slate-900">{bill.title}</span>
							<span class="shrink-0 text-xs text-slate-500">{dueLabel(bill.dueDate)}</span>
							<span class="shrink-0 font-mono font-semibold text-slate-900">
								${dollars(bill.amountCents)}
							</span>
						</li>
					{:else}
						<li class="py-2 text-sm text-slate-500">No bills in this view.</li>
					{/each}
				</ul>
			</section>
		{/if}
	{/if}
</div>
