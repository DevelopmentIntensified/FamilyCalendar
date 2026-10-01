<script lang="ts">
	import type { PageData } from './$types';
	import Breadcrumbs from '$lib/components/Breadcrumbs.svelte';
	import {
		ARCHIVE_CARD_PADDING,
		archiveEventDate,
		groupEventsByMonth,
		retentionSummary
	} from '$lib/components/archive/archiveMonths';

	export let data: PageData;

	$: months = groupEventsByMonth(data.events ?? []);
	$: retention = retentionSummary({
		retentionViewDays: data.retentionDays,
		archivedRetentionDays: data.archivedRetentionDays
	});
	$: eventDate = (start: Date) => archiveEventDate(start).toFormat('d LLL yyyy');
</script>

<svelte:head>
	<title>Archive - Family Planz</title>
</svelte:head>

<div class="min-h-screen bg-slate-50 px-4 py-8 pt-20">
	<div class="mx-auto max-w-4xl">
		<Breadcrumbs crumbs={[{ label: 'Calendar', href: '/calendar' }, { label: 'Archive' }]} />

		<div class="mt-6 rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
			<div class="mb-6">
				<h1 class="text-2xl font-bold text-slate-900">Archive</h1>
				<p class="mt-1 text-sm text-slate-500">
					You can look back {retention.viewDays} days
				</p>
				<p class="text-sm text-slate-500">
					Events stay in the archive for {retention.archivedDays} days
				</p>
			</div>

			{#if !data.archiveAllowed}
				<div class="mb-4 rounded-lg border border-amber-200 bg-amber-50 p-4">
					<p class="text-sm text-amber-800">
						{data.reason || 'Archive view not available on your plan.'}
					</p>
					<a
						href="/pricing"
						class="mt-3 inline-flex rounded-full bg-primary-600 px-4 py-2 text-sm font-semibold text-white hover:bg-primary-700"
					>
						Upgrade to View Archive
					</a>
				</div>
			{:else if months.length === 0}
				<p class="text-sm text-slate-500">No archived events found.</p>
			{:else}
				<!-- 094: one card per month, the events under it. The month card
				     and the event cards share ARCHIVE_CARD_PADDING, so the header
				     cannot end up sitting tighter than the cards it heads.
				     e2e/calendar/ArchivePage.test.ts measures the rendered padding. -->
				<div class="space-y-4">
					{#each months as month (month.key)}
						<section
							data-testid="archive-month"
							class="rounded-xl border border-slate-200 bg-slate-50/60 {ARCHIVE_CARD_PADDING}"
						>
							<h2
								class="flex items-baseline justify-between gap-3 text-sm font-semibold text-slate-900"
							>
								{month.label}
								<span class="text-xs font-normal text-slate-500">
									{month.events.length}
									{month.events.length === 1 ? 'event' : 'events'}
								</span>
							</h2>
							<ul class="mt-3 space-y-3">
								{#each month.events as event (event.id)}
									<li
										data-testid="archive-event"
										class="rounded-lg border border-slate-200 bg-white {ARCHIVE_CARD_PADDING}"
									>
										<p class="font-medium text-slate-900">{event.title}</p>
										<p class="text-sm text-slate-500">{eventDate(event.start)}</p>
										{#if event.location}
											<p class="text-sm text-slate-600">{event.location}</p>
										{/if}
									</li>
								{/each}
							</ul>
						</section>
					{/each}
				</div>
			{/if}
		</div>
	</div>
</div>
