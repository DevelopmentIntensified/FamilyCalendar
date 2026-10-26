<script lang="ts">
	/** PROTOTYPE (issue 208) — Variant A "Morning Read": one chronological
	 *  column. The day becomes a single reading: a slim stat strip (not a
	 *  card), then events + kids' schedule merged into one time-ordered run,
	 *  then the family board, then groceries. Hierarchy = chronology. */
	import { showsModule } from '$lib/dashboardModules';
	import type { PrototypeProps } from './prototypeProps';
	import FamilyTaskBoardCard from '../FamilyTaskBoardCard.svelte';
	import GroceriesCard from '../GroceriesCard.svelte';
	import type { GlanceEvent } from '../TodayGlanceCard.svelte';

	let { dateLabel, isToday, meId, familyId, dailyVerse, glance, dayEvents, top3, familyTasks, familyMembers, kidsSchedule, completedToday, familyGroceries, mineGroceries, loadWarnings, modules, onEventClick }: PrototypeProps =
		$props();

	/** One merged, time-ordered reading of the day: glance events and kids'
	 *  schedule rows share a column. A row with no time sorts last. */
	type DayRow = {
		id: string;
		start: string | null;
		end: string | null;
		title: string;
		where: string | null;
		who: string | null;
		allDay: boolean;
		color: string;
		event?: GlanceEvent;
	};

	function clock(iso: string): string {
		// Prototype-only display parse; the real page does this in the load.
		const d = new Date(iso);
		if (Number.isNaN(d.getTime())) return iso;
		return d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
	}

	const rows = $derived.by(() => {
		const out: DayRow[] = [];
		for (const e of dayEvents) {
			const s = e.allDay ? null : new Date(e.start).toISOString();
			out.push({
				id: e.id,
				start: s,
				end: e.end ? new Date(e.end).toISOString() : null,
				title: e.title,
				where: e.location,
				who: null,
				allDay: e.allDay,
				color: e.color,
				event: e
			});
		}
		for (const k of kidsSchedule) {
			out.push({
				id: `kid-${k.id}`,
				start: k.allDay ? null : k.start,
				end: k.end,
				title: k.title,
				where: k.location,
				who: k.kids.map((c) => c.name).join(', ') || null,
				allDay: k.allDay,
				color: 'var(--muted)'
			});
		}
		out.sort((a, b) => {
			if (!a.start && !b.start) return 0;
			if (!a.start) return 1;
			if (!b.start) return -1;
			return a.start.localeCompare(b.start);
		});
		return out;
	});
</script>

<div class="mx-auto w-full max-w-5xl space-y-4" data-fb="page" data-fb-label="A · Morning Read">
	{#if loadWarnings.length > 0}
		<div class="rounded-2xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800" role="alert">
			Couldn't load {loadWarnings.join(', ')} just now — everything else is up to date.
		</div>
	{/if}

	{#if dailyVerse}
		<aside class="rounded-2xl border border-slate-200 bg-slate-50/70 px-4 py-3" data-fb="verse" data-fb-label="Verse strip">
			<p class="text-[13px] italic leading-snug text-slate-600">“{dailyVerse.text}”</p>
			<p class="mt-1 text-[11px] text-slate-400">{dailyVerse.reference}</p>
		</aside>
	{/if}

	<!-- Slim stat strip: the glance numbers as one quiet line, not a card. -->
	<div class="flex flex-wrap items-center gap-x-5 gap-y-1 rounded-2xl border border-slate-200 bg-white px-4 py-2.5" data-fb="stats" data-fb-label="Day stats">
		<span class="text-sm text-slate-500">{dateLabel}{isToday ? ' · today' : ''}</span>
		<span class="text-sm tabular-nums text-slate-700"><b class="font-semibold">{glance.openToday}</b> open</span>
		<span class="text-sm tabular-nums text-slate-700"><b class="font-semibold">{glance.doneToday}</b> done</span>
		<span class="text-sm tabular-nums text-slate-700"><b class="font-semibold">{glance.weekStreak}</b>-week streak</span>
		{#if completedToday.length > 0}
			<span class="ml-auto text-xs text-slate-400">latest: {completedToday[0].title}</span>
		{/if}
	</div>

	<!-- The merged chronological reading. -->
	{#if rows.length > 0}
		<section class="rounded-2xl border border-slate-200 bg-white p-4" data-fb="timeline" data-fb-label="The day, in order">
			<h2 class="mb-2 text-sm font-semibold text-slate-900">The day, in order</h2>
			<ol class="flex flex-col">
				{#each rows as r (r.id)}
					<li class="flex min-h-11 items-baseline gap-3 border-b border-slate-100 py-2 last:border-0">
						<span class="w-20 shrink-0 text-xs tabular-nums text-slate-400">
							{r.allDay ? 'all day' : r.start ? clock(r.start) : '—'}
						</span>
						<span class="h-2 w-2 shrink-0 self-center rounded-full" style:background={r.color} aria-hidden="true"></span>
						{#if r.event}
							<button
								type="button"
								class="min-w-0 flex-1 truncate text-left text-sm text-slate-800 hover:underline"
								onclick={() => onEventClick?.(r.event!)}
							>
								{r.title}{r.where ? ` · ${r.where}` : ''}
							</button>
						{:else}
							<span class="min-w-0 flex-1 truncate text-sm text-slate-800">
								{r.title}{r.where ? ` · ${r.where}` : ''}
							</span>
						{/if}
						{#if r.who}
							<span class="shrink-0 text-xs text-slate-400">{r.who}</span>
						{/if}
					</li>
				{/each}
			</ol>
		</section>
	{:else}
		<section class="rounded-2xl border border-slate-200 bg-white p-6 text-center text-sm text-slate-400" data-fb="timeline-empty">
			Nothing on the calendar {isToday ? 'today' : `for ${dateLabel}`}.
		</section>
	{/if}

	{#if top3.length > 0 && showsModule(modules, 'top3')}
		<section class="rounded-2xl border border-slate-200 bg-white p-4" data-fb="top3" data-fb-label="Top 3">
			<h2 class="mb-2 text-sm font-semibold text-slate-900">Also due today</h2>
			<ol class="flex flex-col">
				{#each top3 as t (t.id)}
					<li class="min-h-9 truncate border-b border-slate-100 py-2 text-sm text-slate-800 last:border-0">
						{t.title}{t.assigneeFirstName ? ` · ${t.assigneeFirstName}` : ''}
					</li>
				{/each}
			</ol>
		</section>
	{/if}

	{#if familyId && showsModule(modules, 'board')}
		<FamilyTaskBoardCard tasks={familyTasks} members={familyMembers} {meId} {familyId} openToday={glance.openToday} weekStreak={glance.weekStreak} />
	{/if}

	{#if showsModule(modules, 'groceries')}
		<GroceriesCard familyItems={familyGroceries} mineItems={mineGroceries} hasFamily={!!familyId} />
	{/if}
</div>
