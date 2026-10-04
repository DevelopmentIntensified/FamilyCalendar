<script lang="ts">
	import type { PageData } from './$types';
	import Breadcrumbs from '$lib/components/Breadcrumbs.svelte';
	import {
		ARCHIVE_CARD_PADDING,
		archiveEventDate,
		groupEventsByMonth,
		retentionScale,
		retentionSummary
	} from '$lib/components/archive/archiveMonths';

	export let data: PageData;

	$: months = groupEventsByMonth(data.events ?? []);
	$: retention = retentionSummary({
		retentionViewDays: data.retentionDays,
		archivedRetentionDays: data.archivedRetentionDays
	});
	$: scale = retentionScale(retention);
	$: eventDate = (start: Date) => archiveEventDate(start).toFormat('d LLL yyyy');
</script>

<svelte:head>
	<title>Archive - Family Planz</title>
</svelte:head>

<div class="min-h-screen bg-slate-50 px-4 py-8 pt-20">
	<div class="mx-auto max-w-6xl">
		<Breadcrumbs crumbs={[{ label: 'Calendar', href: '/calendar' }, { label: 'Archive' }]} />

		<!-- 094 rerun: the approved page is two columns at desktop width — the
		     gate and the list on the left, the three argument cards down a 19rem
		     side rail. `minmax(0,1fr)` on the list track, not a bare 1fr: a bare
		     track lets a grid item keep its min-content width. -->
		<div
			data-testid="archive-layout"
			class="mt-6 grid items-start gap-4 lg:grid-cols-[minmax(0,1fr)_19rem]"
		>
			<div class="min-w-0 space-y-4">
				<!-- ── the gate, shown as a gate ───────────────────────────────── -->
				<section
					data-testid="retention-gate"
					class="rounded-xl border border-dashed border-slate-300 bg-white p-6 shadow-sm"
				>
					<div class="flex flex-wrap items-start justify-between gap-3">
						<div>
							<p
								class="text-[10px] font-bold uppercase tracking-widest text-slate-400"
							>
								On the {data.planName ?? 'Free'} plan
							</p>
							<p class="mt-1 text-xl font-extrabold text-slate-900">
								You can look back {scale.viewable} days
							</p>
							<p class="mt-1 text-sm text-slate-500">
								and events stay in the archive for {scale.deletedAfter} days
							</p>
						</div>
						<span
							data-testid="retention-family-pill"
							class="shrink-0 rounded-full bg-mint-100 px-2.5 py-1 text-xs font-semibold text-mint-800"
						>
							{data.familyCount ?? 0}
							{data.familyCount === 1 ? 'family' : 'families'}
						</span>
					</div>

					{#if scale.total > 0}
						<div class="mt-4 flex h-2 overflow-hidden rounded-full bg-slate-200">
							<i
								class="block bg-primary-500"
								style="width:{scale.viewablePct}%"
								data-testid="retention-track-fill"
							></i>
							<i class="block bg-slate-300" style="width:{100 - scale.viewablePct}%"></i>
						</div>
						<div class="mt-2 flex flex-col gap-1.5" data-testid="retention-scale">
							<div class="flex items-center gap-2 text-xs text-slate-600">
								<span class="h-2.5 w-2.5 shrink-0 rounded-full bg-primary-500"></span>
								Viewable now
								<b class="ml-auto tabular-nums text-slate-800">{scale.viewable} days</b>
							</div>
							<div class="flex items-center gap-2 text-xs text-slate-600">
								<span class="h-2.5 w-2.5 shrink-0 rounded-full bg-slate-300"></span>
								Kept, not viewable
								<b class="ml-auto tabular-nums text-slate-800">
									{scale.kept > 0 ? `next ${scale.kept}` : 'none'}
								</b>
							</div>
							<div class="flex items-center gap-2 text-xs text-slate-600">
								<span class="h-2.5 w-2.5 shrink-0 rounded-full bg-slate-100"></span>
								Deleted
								<b class="ml-auto tabular-nums text-slate-800">
									after {scale.deletedAfter} days
								</b>
							</div>
						</div>
					{/if}

					<p class="mt-3.5 text-xs leading-relaxed text-slate-500">
						The gate is real, but it is stated as a <em>plan limit</em> rather than a date. A
						family looking for a memory from three years ago is told to upgrade, not that it
						is gone.
					</p>
				</section>

				{#if !data.archiveAllowed}
					<div class="rounded-lg border border-amber-200 bg-amber-50 p-4">
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
					<p class="rounded-xl border border-slate-200 bg-white p-6 text-sm text-slate-500 shadow-sm">
						No archived events found.
					</p>
				{:else}
					<!-- 094: one card per month, the events as flat rows inside it.
					     The month card owns the padding and the rows sit in its own
					     content box, so a row is never a second card hanging off
					     the first — which is what the app used to render.
					     e2e/calendar/ArchivePage.test.ts measures the padding. -->
					{#each months as month (month.key)}
						<section
							data-testid="archive-month"
							class="rounded-xl border border-slate-200 bg-white shadow-sm {ARCHIVE_CARD_PADDING}"
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
							<ul>
								{#each month.events as event (event.id)}
									<li class="border-b border-slate-100 last:border-b-0">
										<a
											data-testid="archive-event"
											href="/calendar/event/{event.id}"
											class="flex flex-wrap items-center gap-x-3 gap-y-1 py-3 no-underline"
										>
											<span
												data-testid="archive-event-part"
												class="w-[5.5rem] shrink-0 text-xs font-bold tabular-nums text-slate-400"
											>
												{eventDate(event.start)}
											</span>
											<span
												data-testid="archive-event-part"
												class="min-w-0 flex-1 text-[0.9375rem] font-semibold text-slate-800"
											>
												{event.title}
											</span>
											{#if event.calendar}
												<span
													data-testid="archive-calendar"
													class="shrink-0 rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-semibold text-slate-600"
												>
													{event.calendar}
												</span>
											{/if}
											{#if event.location}
												<span
													data-testid="archive-event-part"
													class="min-w-0 truncate text-xs text-slate-500 max-[419px]:w-full"
												>
													{event.location}
												</span>
											{/if}
										</a>
									</li>
								{/each}
							</ul>
						</section>
					{/each}
				{/if}
			</div>

			<!-- ── the three cards the approved page puts beside the list ──── -->
			<aside data-testid="archive-side" class="min-w-0 space-y-4">
				<section
					class="rounded-xl border border-transparent bg-gradient-to-br from-sky-50 to-white p-5 shadow-sm"
				>
					<h2 class="text-sm font-semibold text-slate-900">What is this for?</h2>
					<p class="mt-2 text-xs leading-relaxed text-slate-500">
						A flat chronological list of events whose time has passed. No search, no filter,
						no by-calendar, no paging — and nothing in the app links here except the navbar.
					</p>
					<p class="mt-2 text-xs leading-relaxed text-slate-500">
						If a family wants “when was Mia's first football match”, this page cannot answer
						it. If they want “remind me of what we did last summer”, it could — but it never
						says that.
					</p>
					<p class="mt-2 text-xs leading-relaxed text-slate-500">
						A by-year view with the kids' milestones pinned would earn the page. A short list
						of past events will not get opened twice.
					</p>
				</section>

				<section
					class="rounded-xl border border-red-200 bg-gradient-to-br from-red-50 to-white p-5 shadow-sm"
				>
					<h2 class="text-sm font-semibold text-slate-900">Recurring events stop here</h2>
					<p class="mt-2 text-xs leading-relaxed text-slate-500">
						A moved or cancelled occurrence is read by the calendar grid and <b>not</b> by
						the archive. So an occurrence you moved still appears here at its original time,
						and a cancelled one appears at all.
					</p>
					<p class="mt-2 text-xs leading-relaxed text-slate-500">
						The archive is a record of intent, not of what happened.
					</p>
				</section>

				<section class="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
					<h2 class="text-sm font-semibold text-slate-900">Nothing links here</h2>
					<p class="mt-2 text-xs leading-relaxed text-slate-500">
						Not the calendar, not the family page, not the event detail. The archive is one
						navbar item with a short list behind it.
					</p>
					<div class="mt-3">
						<a
							href="/calendar"
							class="inline-flex rounded-full border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-600 hover:bg-slate-50"
						>
							Calendar
						</a>
					</div>
				</section>
			</aside>
		</div>
	</div>
</div>