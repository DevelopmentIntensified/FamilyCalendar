<script lang="ts">
	/** PROTOTYPE (issue 208) — Variant C "Board First": the family board is
	 *  the page (revisiting #118's narrowing — the counter-argument is that a
	 *  shared household read IS the morning's job). Day reading compresses
	 *  into a left rail; kids + groceries hold the right rail. Hierarchy =
	 *  people. */
	import { showsModule } from '$lib/dashboardModules';
	import type { PrototypeProps } from './prototypeProps';
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

<div class="mx-auto w-full max-w-5xl space-y-4" data-fb="page" data-fb-label="C · Board First">
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

	{#if familyId && showsModule(modules, 'board')}
		<FamilyTaskBoardCard tasks={familyTasks} members={familyMembers} {meId} {familyId} openToday={glance.openToday} weekStreak={glance.weekStreak} />
	{/if}

	<div class="grid items-start gap-4 md:grid-cols-2" data-fb="rails" data-fb-label="Day and household rails">
		<!-- Left rail: the day's own reading, compressed. -->
		<div class="flex flex-col gap-4" data-fb="day-rail">
			{#if showsModule(modules, 'glance')}
				<section class="rounded-2xl border border-slate-200 bg-white p-4">
					<h2 class="mb-1 text-sm font-semibold text-slate-900">{dateLabel}{isToday ? ' · today' : ''}</h2>
					<p class="text-xs tabular-nums text-slate-500">
						{glance.openToday} open · {glance.doneToday} done · {glance.weekStreak}-week streak
					</p>
					{#if dayEvents.length > 0}
						<ul class="mt-2 flex flex-col border-t border-slate-100 pt-2">
							{#each dayEvents.slice(0, 6) as e (e.id)}
								<li>
									<button
										type="button"
										class="flex w-full min-h-9 items-center gap-2 truncate text-left text-sm text-slate-700 hover:underline"
										onclick={() => onEventClick?.(e)}
									>
										<span class="h-2 w-2 shrink-0 rounded-full" style:background={e.color} aria-hidden="true"></span>
										<span class="truncate">{e.title}</span>
									</button>
								</li>
							{/each}
						</ul>
					{:else}
						<p class="mt-2 text-xs text-slate-400">Nothing on the calendar.</p>
					{/if}
				</section>
			{/if}
			{#if showsModule(modules, 'top3')}
				<section class="rounded-2xl border border-slate-200 bg-white p-4">
					<h2 class="mb-2 text-sm font-semibold text-slate-900">Top 3</h2>
					<ol class="flex flex-col">
						{#each top3 as t (t.id)}
							<li class="min-h-8 truncate border-b border-slate-100 py-1.5 text-sm text-slate-800 last:border-0">
								{t.title}{t.assigneeFirstName ? ` · ${t.assigneeFirstName}` : ''}
							</li>
						{/each}
					</ol>
				</section>
			{/if}
			{#if showsModule(modules, 'completed') && completedToday.length > 0}
				<section class="rounded-2xl border border-slate-200 bg-white p-4">
					<h2 class="mb-2 text-sm font-semibold text-slate-900">Completed today</h2>
					<ol class="flex flex-col">
						{#each completedToday as t (t.id)}
							<li class="min-h-8 truncate border-b border-slate-100 py-1.5 text-sm text-slate-500 line-through last:border-0">
								{t.title}
							</li>
						{/each}
					</ol>
				</section>
			{/if}
		</div>

		<!-- Right rail: household. -->
		<div class="flex flex-col gap-4" data-fb="household-rail">
			{#if familyId && showsModule(modules, 'kids')}
				<KidsScheduleCard events={kidsSchedule} {isToday} />
			{/if}
			{#if showsModule(modules, 'groceries')}
				<GroceriesCard familyItems={familyGroceries} mineItems={mineGroceries} hasFamily={!!familyId} />
			{/if}
		</div>
	</div>
</div>
