<!--
	The Alerts page body: builds the page state class and lays out the toolbar,
	the empty states and the two sections. The route is wiring only and hands
	in the server read plus `invalidateAll`/`goto`.

	The page is the bell's deep-link destination, so it reads the same 50-row
	window and renders the same dead-link fallback (a row without a link is a
	button that still marks read).

	Doc: ../README.md#invariants
-->
<script lang="ts">
	import { createAlertsApi, type AlertsApi } from '../alerts.api';
	import { createToasts, type Toasts } from '$lib/kernel/client/toasts.svelte';
	import Toaster from '$lib/kernel/ui/Toaster.svelte';
	import { systemClock } from '$lib/kernel/time/clock';
	import type { AlertRow } from '../alerts.contract';
	import { AlertsState, browserAlertZone } from '../alerts.state.svelte.js';
	import AlertsRow from './AlertsRow.svelte';
	import AlertsToolbar from './AlertsToolbar.svelte';

	interface Props {
		notifications: AlertRow[];
		unreadCount: number;
		/** Re-read the page's server data (the route's `invalidateAll`). */
		refresh: () => void | Promise<void>;
		/** Open a row's deep link (the route's `goto`). */
		navigate: (link: string) => void | Promise<void>;
		/** Injected by tests; the page builds its own otherwise. */
		api?: Pick<AlertsApi, 'mark' | 'markAll' | 'prune'>;
		toasts?: Toasts;
		now?: Date;
		zone?: string;
	}

	let {
		notifications,
		unreadCount,
		refresh,
		navigate,
		api = createAlertsApi(),
		toasts,
		now = systemClock.now(),
		zone = browserAlertZone()
	}: Props = $props();

	// A screen-owned toaster mounts when nobody passed one in (the route); a
	// test that passes `memoryToasts()` only inspects the recorder.
	const ownToasts = createToasts();
	const activeToasts: Toasts = toasts ?? ownToasts;
	const state = new AlertsState(api, activeToasts, { notifications, unreadCount }, {
		refresh,
		navigate,
		now,
		zone
	});

	// A client-side reload re-runs the load, so the server rows are truth again.
	// It does not re-run on an optimistic write, which is why those survive.
	$effect(() => {
		state.reset({ notifications, unreadCount });
	});

	const sections = $derived([
		{ key: 'needs_you' as const, title: 'Needs you', rows: state.groups.needsYou },
		{ key: 'news' as const, title: 'Just news', rows: state.groups.news }
	]);
</script>

<div class="mx-auto w-full max-w-5xl px-4 py-6">
	<div class="mb-4">
		<AlertsToolbar
			counts={state.counts}
			filter={state.filter}
			unreadCount={state.unreadCount}
			readCount={state.readCount}
			markingAll={state.markingAll}
			askingToPrune={state.askingToPrune}
			pruning={state.pruning}
			onfilter={(next) => state.setFilter(next)}
			onmarkall={() => void state.markAllRead()}
			onaskprune={() => state.askToPrune()}
			oncancelprune={() => state.cancelPrune()}
			onprune={() => void state.pruneRead()}
		/>

		{#if state.rows.length === 0}
			<div class="rounded-xl border border-dashed border-slate-300 bg-white px-6 py-12 text-center">
				<p class="text-3xl" aria-hidden="true">🔔</p>
				<p class="mt-3 text-sm font-semibold text-slate-700">No alerts yet</p>
				<p class="mt-1 text-sm text-slate-400">
					When family members assign you tasks, accept, decline, or complete them — or add you to
					their family — you'll see it here.
				</p>
			</div>
		{:else}
			{#if sections.every((section) => section.rows.length === 0)}
				<p
					class="rounded-xl border border-dashed border-slate-300 bg-white px-6 py-10 text-center text-sm text-slate-400"
				>
					Nothing matches this filter.
				</p>
			{/if}

			{#each sections as section (section.key)}
				{#if section.rows.length}
					<section aria-labelledby={`alerts-${section.key}`} class="mb-4">
						<div class="mb-1 px-1">
							<h2 id={`alerts-${section.key}`} class="text-sm font-bold text-slate-900">
								{section.title}
								<span class="font-normal text-slate-400">{section.rows.length}</span>
							</h2>
						</div>
						<ul
							aria-label={section.title}
							class="divide-y divide-slate-100 overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm"
						>
							{#each section.rows as row (row.id)}
								<AlertsRow
									{row}
									now={state.now}
									zone={state.zone}
									onopen={(opened) => void state.openRow(opened)}
								/>
							{/each}
						</ul>
					</section>
				{/if}
			{/each}
		{/if}
	</div>
</div>

{#if !toasts}
	<Toaster items={ownToasts.items} ondismiss={ownToasts.dismiss} />
{/if}
