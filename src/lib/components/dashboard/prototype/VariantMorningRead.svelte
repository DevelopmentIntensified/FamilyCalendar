<script lang="ts">
	/** PROTOTYPE (issue 208, round 2) — Variant A "Split Paper": the schedule
	 *  is the morning's main read (wide left column); every action sits in a
	 *  narrow right rail. ALL modules present as full cards — this reflows,
	 *  it removes nothing. */
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

<div class="mx-auto w-full max-w-6xl space-y-4" data-fb="page" data-fb-label="A · Split Paper">
	{#if loadWarnings.length > 0}
		<div class="rounded-2xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800" role="alert">
			Couldn't load {loadWarnings.join(', ')} just now — everything else is up to date.
		</div>
	{/if}

	{#if dailyVerse && showsModule(modules, 'verse')}
		<DashboardInfoBand {dailyVerse} />
	{/if}

	<div class="grid items-start gap-4 lg:grid-cols-3">
		<!-- Main column: the day's schedule, full width cards. -->
		<div class="flex flex-col gap-4 lg:col-span-2" data-fb="main" data-fb-label="The day's schedule">
			{#if showsModule(modules, 'glance')}
				<TodayGlanceCard {dateLabel} {isToday} events={dayEvents} onEventClick={onEventClick} />
			{/if}
			{#if familyId && showsModule(modules, 'kids')}
				<KidsScheduleCard events={kidsSchedule} {isToday} />
			{/if}
		</div>

		<!-- Rail: actions first, then household. -->
		<div class="flex flex-col gap-4" data-fb="rail" data-fb-label="Actions rail">
			{#if showsModule(modules, 'top3')}
				<TopPrioritiesCard tasks={top3} {meId} />
			{/if}
			{#if showsModule(modules, 'completed')}
				<CompletedTodayCard tasks={completedToday} {isToday} />
			{/if}
			{#if familyId && showsModule(modules, 'board')}
				<FamilyTaskBoardCard tasks={familyTasks} members={familyMembers} {meId} {familyId} openToday={glance.openToday} weekStreak={glance.weekStreak} />
			{/if}
			{#if showsModule(modules, 'groceries')}
				<GroceriesCard familyItems={familyGroceries} mineItems={mineGroceries} hasFamily={!!familyId} />
			{/if}
		</div>
	</div>
</div>
