<!--
	The Day Dashboard band: one grid that flows six cards through two columns at
	≥1024px (each group is `display: contents`, so a hidden card leaves its row
	instead of holding an empty lane) and stays a single column below it, with
	the day group pairing at `md`.

	Legacy reference: `components/dashboard/DayDashboard.svelte` (118/316).
-->
<script lang="ts">
	import type { DashboardLoadedData, DashboardPageData } from '../dayDashboard.contract';
	import type { DayDashboardState } from '../dayDashboard.state.svelte';
	import CompletedTodayCard from './CompletedTodayCard.svelte';
	import FamilyTaskBoardCard from './FamilyTaskBoardCard.svelte';
	import GroceriesCard from './GroceriesCard.svelte';
	import KidsScheduleCard from './KidsScheduleCard.svelte';
	import TodayGlanceCard from './TodayGlanceCard.svelte';
	import TopPrioritiesCard from './TopPrioritiesCard.svelte';

	interface Props {
		data: DashboardLoadedData;
		/** The page's labels first, then the legs' (the API's own merge order). */
		warnings: readonly string[];
		modules: DashboardPageData['modules'];
		dateLabel: string;
		dayDate: string;
		isToday: boolean;
		meId: string;
		familyId: string | null;
		taskCategories: DashboardPageData['taskCategories'];
		state: DayDashboardState;
		now: Date;
		onEventClick: (event: DashboardLoadedData['dayEvents'][number]) => void;
	}

	let {
		data,
		warnings,
		modules,
		dateLabel,
		dayDate,
		isToday,
		meId,
		familyId,
		taskCategories,
		state,
		now,
		onEventClick
	}: Props = $props();

	const shows = (id: string) => modules[id] !== false;
	const dayGroup = $derived(shows('glance') || shows('top3') || shows('completed'));
	const familyGroup = $derived(
		(familyId && shows('board')) || (familyId && shows('kids')) || shows('groceries')
	);
</script>

<div class="mx-auto w-full max-w-5xl space-y-4">
	{#if warnings.length > 0}
		<div
			class="rounded-2xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800"
			role="alert"
		>
			Couldn't load {warnings.join(', ')} just now — everything else is up to date.
		</div>
	{/if}
	<div data-testid="dashboard-card-band" class="grid grid-cols-1 gap-4 lg:grid-cols-2 lg:items-stretch">
		{#if dayGroup}
			<div
				data-testid="dashboard-day-band"
				class="grid grid-cols-1 items-start gap-4 md:grid-cols-2 lg:contents"
			>
				{#if shows('glance')}
					<TodayGlanceCard {dateLabel} {isToday} dayDate={dayDate} events={data.dayEvents} {onEventClick} />
				{/if}
				{#if shows('top3')}
					<TopPrioritiesCard tasks={data.top3} {meId} {state} {now} />
				{/if}
				{#if shows('completed')}
					<CompletedTodayCard tasks={data.completedToday} {isToday} />
				{/if}
			</div>
		{/if}

		{#if familyGroup}
			<div data-testid="dashboard-family-row" class="grid grid-cols-1 items-start gap-4 lg:contents">
				{#if familyId && shows('board')}
					<FamilyTaskBoardCard
						tasks={data.familyTasks}
						members={data.familyMembers}
						{meId}
						{familyId}
						weekStreak={data.glance.weekStreak}
						categories={taskCategories.map((category) => category.name)}
						{state}
						{now}
					/>
				{/if}
				{#if familyId && shows('kids')}
					<KidsScheduleCard events={data.kidsSchedule} {isToday} />
				{/if}
				{#if shows('groceries')}
					<GroceriesCard
						familyItems={data.familyGroceries}
						mineItems={data.mineGroceries}
						hasFamily={!!familyId}
					/>
				{/if}
			</div>
		{/if}
	</div>
</div>
