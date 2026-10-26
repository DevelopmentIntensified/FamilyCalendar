<script lang="ts">
	/** PROTOTYPE (issue 208) — Variant B "Focus First": what matters NOW is
	 *  the hero. Top-3 full width at the top with the glance numbers as a
	 *  stat rail beside it; completed demoted to a footer line; the family
	 *  board below; kids + groceries as a compact household rail on the
	 *  right. Hierarchy = priorities. */
	import { showsModule } from '$lib/dashboardModules';
	import type { PrototypeProps } from './prototypeProps';
	import TopPrioritiesCard from '../TopPrioritiesCard.svelte';
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

<div class="mx-auto w-full max-w-5xl space-y-4" data-fb="page" data-fb-label="B · Focus First">
	{#if loadWarnings.length > 0}
		<div class="rounded-2xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800" role="alert">
			Couldn't load {loadWarnings.join(', ')} just now — everything else is up to date.
		</div>
	{/if}

	{#if dailyVerse}
		<aside class="rounded-2xl border border-slate-200 bg-slate-50/70 px-4 py-3">
			<p class="text-[13px] italic leading-snug text-slate-600">“{dailyVerse.text}”</p>
			<p class="mt-1 text-[11px] text-slate-400">{dailyVerse.reference}</p>
		</aside>
	{/if}

	<!-- Hero row: the focus question first. Glance is a stat rail beside the
	     top-3, glance events list under it. -->
	<div class="grid items-start gap-4 lg:grid-cols-3" data-fb="hero" data-fb-label="Focus hero">
		{#if showsModule(modules, 'top3')}
			<div class="lg:col-span-2">
				<TopPrioritiesCard tasks={top3} {meId} />
			</div>
		{/if}
		{#if showsModule(modules, 'glance')}
			<aside class="rounded-2xl border border-slate-200 bg-white p-4" data-fb="stats" data-fb-label="Where the day stands">
				<h2 class="mb-2 text-sm font-semibold text-slate-900">{dateLabel}{isToday ? ' · today' : ''}</h2>
				<dl class="grid grid-cols-3 gap-2 text-center">
					<div><dt class="text-[10px] uppercase tracking-wide text-slate-400">open</dt><dd class="text-lg font-semibold tabular-nums text-slate-800">{glance.openToday}</dd></div>
					<div><dt class="text-[10px] uppercase tracking-wide text-slate-400">done</dt><dd class="text-lg font-semibold tabular-nums text-slate-800">{glance.doneToday}</dd></div>
					<div><dt class="text-[10px] uppercase tracking-wide text-slate-400">streak</dt><dd class="text-lg font-semibold tabular-nums text-slate-800">{glance.weekStreak}</dd></div>
				</dl>
				{#if dayEvents.length > 0}
					<ul class="mt-3 flex flex-col border-t border-slate-100 pt-2">
						{#each dayEvents.slice(0, 4) as e (e.id)}
							<li>
								<button
									type="button"
									class="flex w-full min-h-8 items-center gap-2 truncate text-left text-xs text-slate-700 hover:underline"
									onclick={() => onEventClick?.(e)}
								>
									<span class="h-1.5 w-1.5 shrink-0 rounded-full" style:background={e.color} aria-hidden="true"></span>
									<span class="truncate">{e.title}</span>
								</button>
							</li>
						{/each}
					</ul>
				{/if}
				{#if completedToday.length > 0}
					<p class="mt-2 border-t border-slate-100 pt-2 text-xs text-slate-400">
						{completedToday.length} completed today — latest: {completedToday[0].title}
					</p>
				{/if}
			</aside>
		{/if}
	</div>

	<!-- Board below the hero; household rail beside it. -->
	<div class="grid items-start gap-4 lg:grid-cols-3" data-fb="household" data-fb-label="Household">
		<div class="lg:col-span-2">
			{#if familyId && showsModule(modules, 'board')}
				<FamilyTaskBoardCard tasks={familyTasks} members={familyMembers} {meId} {familyId} openToday={glance.openToday} weekStreak={glance.weekStreak} />
			{/if}
		</div>
		<div class="flex flex-col gap-4">
			{#if familyId && showsModule(modules, 'kids')}
				<KidsScheduleCard events={kidsSchedule} {isToday} />
			{/if}
			{#if showsModule(modules, 'groceries')}
				<GroceriesCard familyItems={familyGroceries} mineItems={mineGroceries} hasFamily={!!familyId} />
			{/if}
		</div>
	</div>
</div>
