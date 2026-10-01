<script lang="ts">
	import { DateTime } from 'luxon';
	import { invalidateAll } from '$app/navigation';
	import DayNav from '$lib/components/DayNav.svelte';
	import DayDashboard from '$lib/components/dashboard/DayDashboard.svelte';
	import type { PageData } from './$types';

	export let data: PageData;

	$: dayDt = DateTime.fromISO(data.dayISO).setZone(data.zone).startOf('day');
	$: dateLabel = dayDt.toFormat('cccc, LLLL d');
	$: prevDayHref = '/calendar/dashboard?date=' + dayDt.minus({ days: 1 }).toISODate();
	$: nextDayHref = '/calendar/dashboard?date=' + dayDt.plus({ days: 1 }).toISODate();
	$: todayHref = '/calendar/dashboard';
	$: backToCalendarHref =
		data.userSettings?.defaultView === 'dashboard' ? '/calendar?dashboardView=1' : '/calendar';
</script>

<svelte:head>
	<title>Day Dashboard - {dateLabel} - Family Planz</title>
</svelte:head>

<div class="mx-auto w-full px-2 py-4 sm:px-4 lg:px-8">
	<header class="mb-4 flex flex-wrap items-center justify-between gap-3">
		<div>
			<h1 class="text-xl font-bold text-slate-900">Day Dashboard</h1>
			<p class="text-sm text-slate-500">
				{dateLabel}{data.isToday ? ' · today' : ''}
			</p>
		</div>
		<!-- 118 mark 1.5: the same navigator the calendar page uses, so "Today"
		     cannot drift between the two headers again. Hrefs, not callbacks —
		     a day is a URL here, and a link can be opened in a new tab. -->
		<DayNav
			period="day"
			isToday={data.isToday}
			{todayHref}
			previousHref={prevDayHref}
			nextHref={nextDayHref}
		/>
		<a
			href={`/calendar?date=${dayDt.toISODate()}&view=day`}
			class="rounded-lg border border-slate-300 bg-white px-4 py-2.5 text-sm font-medium text-slate-700 transition-colors hover:bg-slate-50"
			aria-label="Open day view for {dateLabel}"
		>
			Open Day View
		</a>
		<a
			href={backToCalendarHref}
			class="rounded-lg border border-slate-300 bg-white px-4 py-2.5 text-sm font-medium text-slate-700 transition-colors hover:bg-slate-50"
		>
			Back to Calendar
		</a>
	</header>

	{#await data.dashboardData}
		<!-- Skeletons, in the two rows the band actually renders (118), so the
		     page does not change shape when the data lands. -->
		<div class="space-y-4" aria-hidden="true">
			<div class="grid items-start gap-4 md:grid-cols-2 lg:grid-cols-3">
				{#each Array(3) as _, i (i)}
					<div class="h-44 animate-pulse rounded-2xl bg-slate-100"></div>
				{/each}
			</div>
			<div class="grid items-start gap-4 lg:grid-cols-3">
				{#each Array(3) as _, i (i)}
					<div class="h-56 animate-pulse rounded-2xl bg-slate-100"></div>
				{/each}
			</div>
		</div>
	{:then dd}
		<DayDashboard
			{dateLabel}
			isToday={data.isToday}
			meId={data.meId}
			familyId={data.familyId}
			modules={data.modules}
			dailyVerse={data.dailyVerse}
			glance={dd.glance}
			dayEvents={dd.dayEvents}
			top3={dd.top3}
			completedToday={dd.completedToday ?? []}
			familyTasks={dd.familyTasks}
			familyMembers={dd.familyMembers}
			kidsSchedule={dd.kidsSchedule}
			familyGroceries={dd.familyGroceries ?? []}
			mineGroceries={dd.mineGroceries ?? []}
			loadWarnings={[...(data.loadWarnings ?? []), ...dd.warnings]}
		/>
	{:catch}
		<div
			class="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800"
			role="alert"
		>
			Couldn't load the dashboard.
			<button type="button" onclick={() => invalidateAll()} class="font-semibold underline">
				Retry
			</button>
		</div>
	{/await}
</div>
