<script lang="ts">
	/** PROTOTYPE (issue 208, round 2) — Variant B "Zoned": full-width zone
	 *  rows, each a named section with its cards paired inside. The day
	 *  reads in three passes: the schedule, the actions, the household. ALL
	 *  modules present as full cards — this reflows, it removes nothing. */
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
</script>

<div class="mx-auto w-full max-w-6xl space-y-5" data-fb="page" data-fb-label="B · Zoned">
	{#if loadWarnings.length > 0}
		<div class="rounded-2xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800" role="alert">
			Couldn't load {loadWarnings.join(', ')} just now — everything else is up to date.
		</div>
	{/if}

	{#if dailyVerse && showsModule(modules, 'verse')}
		<DashboardInfoBand {dailyVerse} />
	{/if}

	<!-- Zone 1 — the schedule. -->
	{#if (showsModule(modules, 'glance')) || (familyId && showsModule(modules, 'kids'))}
		<section data-fb="zone-day" data-fb-label="Zone · The day">
			<h2 class="mb-2 text-[11px] font-semibold uppercase tracking-wider text-slate-400">The day</h2>
			<div class="grid items-start gap-4 md:grid-cols-2">
				{#if showsModule(modules, 'glance')}
					<TodayGlanceCard {dateLabel} {isToday} events={dayEvents} onEventClick={onEventClick} />
				{/if}
				{#if familyId && showsModule(modules, 'kids')}
					<KidsScheduleCard events={kidsSchedule} {isToday} />
				{/if}
			</div>
		</section>
	{/if}

	<!-- Zone 2 — actions. -->
	{#if showsModule(modules, 'top3') || showsModule(modules, 'completed')}
		<section data-fb="zone-actions" data-fb-label="Zone · Actions">
			<h2 class="mb-2 text-[11px] font-semibold uppercase tracking-wider text-slate-400">Actions</h2>
			<div class="grid items-start gap-4 md:grid-cols-2">
				{#if showsModule(modules, 'top3')}
					<TopPrioritiesCard tasks={top3} {meId} />
				{/if}
				{#if showsModule(modules, 'completed')}
					<CompletedTodayCard tasks={completedToday} {isToday} />
				{/if}
			</div>
		</section>
	{/if}

	<!-- Zone 3 — household. -->
	{#if (familyId && showsModule(modules, 'board')) || showsModule(modules, 'groceries')}
		<section data-fb="zone-household" data-fb-label="Zone · Household">
			<h2 class="mb-2 text-[11px] font-semibold uppercase tracking-wider text-slate-400">Household</h2>
			<div class="grid items-start gap-4 md:grid-cols-2">
				{#if familyId && showsModule(modules, 'board')}
					<FamilyTaskBoardCard tasks={familyTasks} members={familyMembers} {meId} {familyId} openToday={glance.openToday} weekStreak={glance.weekStreak} />
				{/if}
				{#if showsModule(modules, 'groceries')}
					<GroceriesCard familyItems={familyGroceries} mineItems={mineGroceries} hasFamily={!!familyId} />
				{/if}
			</div>
		</section>
	{/if}
</div>
