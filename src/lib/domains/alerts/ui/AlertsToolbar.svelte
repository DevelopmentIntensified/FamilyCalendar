<!--
	The Alerts page's top area: the header count, the three filter chips, mark
	all read and delete-read. The prune is a delete, so it asks inline first
	(issue 126) — the question sits where the count is known, and the answer
	(the toast) names how many went.

	The chip counts come from `alertCounts` over the whole loaded feed, never
	the filtered one, so a chip number does not move when it is tapped.

	Widgets keep the legacy look exactly: the baseline screenshots show the
	neutral toolbar button and the badge palette, which kernel `ConfirmAction`
	(red destructive trigger) and `Pill` (700-weight palette) would repaint.
	The two-step behaviour is the one `ConfirmAction` describes, pinned here.

	Doc: ../README.md#invariants
-->
<script lang="ts">
	import type { AlertCounts } from '../alerts.feed.rules';
	import type { AlertFilter } from '../alerts.contract';

	interface Props {
		counts: AlertCounts;
		filter: AlertFilter;
		unreadCount: number;
		readCount: number;
		markingAll: boolean;
		/** The inline delete-read question is open. */
		askingToPrune: boolean;
		pruning: boolean;
		onfilter: (filter: AlertFilter) => void;
		onmarkall: () => void;
		onaskprune: () => void;
		oncancelprune: () => void;
		onprune: () => void;
	}

	let {
		counts,
		filter,
		unreadCount,
		readCount,
		markingAll,
		askingToPrune,
		pruning,
		onfilter,
		onmarkall,
		onaskprune,
		oncancelprune,
		onprune
	}: Props = $props();

	const chips = $derived([
		{ key: 'all' as const, label: 'All', n: counts.all },
		{ key: 'needs_you' as const, label: 'Needs you', n: counts.needsYou },
		{ key: 'unread' as const, label: 'Unread', n: counts.unread }
	]);
</script>

<div class="mb-4 flex flex-wrap items-start justify-between gap-3">
	<div class="min-w-0">
		<h1 class="text-2xl font-bold text-slate-900">Alerts</h1>
		<p class="text-sm text-slate-500" data-testid="unread-count">
			{unreadCount > 0 ? `${unreadCount} unread` : "You're all caught up"}
		</p>
	</div>
	<div class="flex shrink-0 flex-wrap items-center gap-2">
		{#if readCount > 0}
			{#if askingToPrune}
				<span class="text-xs text-slate-500">
					Delete {readCount} read alert{readCount === 1 ? '' : 's'}?
				</span>
				<button
					type="button"
					onclick={onprune}
					disabled={pruning}
					class="rounded-full bg-red-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-red-700 disabled:opacity-50"
				>
					{pruning ? 'Deleting…' : 'Delete them'}
				</button>
				<button
					type="button"
					onclick={oncancelprune}
					disabled={pruning}
					class="rounded-full border border-slate-200 px-3 py-1.5 text-sm font-medium text-slate-600 hover:bg-slate-50 disabled:opacity-50"
				>
					Keep them
				</button>
			{:else}
				<button
					type="button"
					onclick={onaskprune}
					disabled={pruning}
					class="rounded-full border border-slate-200 px-3 py-1.5 text-sm font-medium text-slate-600 hover:bg-slate-50 disabled:opacity-50"
				>
					Delete read alerts
				</button>
			{/if}
		{/if}
		{#if unreadCount > 0}
			<button
				type="button"
				onclick={onmarkall}
				disabled={markingAll}
				class="rounded-full px-3 py-1.5 text-sm font-medium text-primary-600 hover:bg-primary-50 disabled:opacity-50"
			>
				{markingAll ? 'Marking…' : 'Mark all read'}
			</button>
		{/if}
	</div>
</div>

{#if counts.all > 0}
	<div class="mb-4 flex flex-wrap gap-2">
		{#each chips as chip (chip.key)}
			<button
				type="button"
				onclick={() => onfilter(chip.key)}
				aria-pressed={filter === chip.key}
				class="h-9 rounded-full border px-3 text-xs font-semibold transition-colors {filter === chip.key
					? 'border-primary-600 bg-primary-600 text-white'
					: 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50'}"
			>
				{chip.label} <span class="opacity-70">{chip.n}</span>
			</button>
		{/each}
	</div>
{/if}
