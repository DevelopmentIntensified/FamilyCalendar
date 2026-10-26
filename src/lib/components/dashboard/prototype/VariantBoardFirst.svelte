<script lang="ts">
	/** PROTOTYPE (issue 208, round 2) — Variant C "Rhythm": the shipped 3+3
	 *  arrangement kept, but the cards get ONE visual system — a KPI strip
	 *  up top (the glance numbers, polished), aligned card heights, and
	 *  consistent spacing. The counter-hypothesis: the arrangement was never
	 *  the problem; the inconsistent card rhythm was. */
	import { showsModule } from '$lib/dashboardModules';
	import type { PrototypeProps } from './prototypeProps';
	import DashboardInfoBand from '../DashboardInfoBand.svelte';
	import TodayGlanceCard from '../TodayGlanceCard.svelte';
	import TopPrioritiesCard from '../TopPrioritiesCard.svelte';
	import CompletedTodayCard from '../CompletedTodayCard.svelte';
	import FamilyTaskBoardCard from '../FamilyTaskBoardCard.svelte';
	import KidsScheduleCard from '../KidsScheduleCard.svelte';
	import GroceriesCard from '../GroceriesCard.svelte';

	let {
		dateLabel,
		isToday,
		meId,
		familyId,
		dailyVerse,
		glance,
		dayEvents,
		top3,
		familyTasks,
		familyMembers,
		kidsSchedule,
		completedToday,
		familyGroceries,
		mineGroceries,
		loadWarnings,
		modules,
		onEventClick
	}: PrototypeProps = $props();

	const nextEvent = $derived(dayEvents.find((e) => !e.allDay) ?? null);
</script>

<div class="mx-auto w-full max-w-6xl space-y-4" data-fb="page" data-fb-label="C · Rhythm">
	{#if loadWarnings.length > 0}
		<div class="rounded-2xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800" role="alert">
			Couldn't load {loadWarnings.join(', ')} just now — everything else is up to date.
		</div>
	{/if}

	{#if dailyVerse && showsModule(modules, 'verse')}
		<DashboardInfoBand {dailyVerse} />
	{/if}

	<!-- KPI strip: the morning's numbers in one quiet bar. -->
	<div class="flex flex-wrap items-center gap-x-6 gap-y-2 rounded-2xl border border-slate-200 bg-white px-5 py-3" data-fb="kpi" data-fb-label="Morning numbers">
		<span class="text-sm font-medium text-slate-900">{dateLabel}{isToday ? ' · today' : ''}</span>
		{#if nextEvent}
			<span class="text-sm text-slate-600">
				Next: <b class="font-semibold">{nextEvent.title}</b>
			</span>
		{:else if isToday}
			<span class="text-sm text-slate-500">Nothing left on today's calendar</span>
		{/if}
		<span class="ml-auto flex gap-5 text-sm tabular-nums">
			<span class="text-slate-500">{glance.openToday} <span class="text-slate-400">open</span></span>
			<span class="text-slate-500">{glance.doneToday} <span class="text-slate-400">done</span></span>
			<span class="text-slate-500">{glance.weekStreak} <span class="text-slate-400">wk streak</span></span>
		</span>
	</div>

	<!-- Row 1: the day's own reading, three-up, stretched equal. -->
	{#if showsModule(modules, 'glance') || showsModule(modules, 'top3') || showsModule(modules, 'completed')}
		<div class="grid items-stretch gap-4 md:grid-cols-2 lg:grid-cols-3 [&>*]:flex [&>*]:flex-col">
			{#if showsModule(modules, 'glance')}
				<TodayGlanceCard {dateLabel} {isToday} events={dayEvents} onEventClick={onEventClick} />
			{/if}
			{#if showsModule(modules, 'top3')}
				<TopPrioritiesCard tasks={top3} {meId} />
			{/if}
			{#if showsModule(modules, 'completed')}
				<CompletedTodayCard tasks={completedToday} {isToday} />
			{/if}
		</div>
	{/if}

	<!-- Row 2: the household, three-up. -->
	{#if (familyId && showsModule(modules, 'board')) || (familyId && showsModule(modules, 'kids')) || showsModule(modules, 'groceries')}
		<div class="grid items-stretch gap-4 md:grid-cols-2 lg:grid-cols-3 [&>*]:flex [&>*]:flex-col">
			{#if familyId && showsModule(modules, 'board')}
				<FamilyTaskBoardCard tasks={familyTasks} members={familyMembers} {meId} {familyId} openToday={glance.openToday} weekStreak={glance.weekStreak} />
			{/if}
			{#if familyId && showsModule(modules, 'kids')}
				<KidsScheduleCard events={kidsSchedule} {isToday} />
			{/if}
			{#if showsModule(modules, 'groceries')}
				<GroceriesCard familyItems={familyGroceries} mineItems={mineGroceries} hasFamily={!!familyId} />
			{/if}
		</div>
	{/if}
</div>
