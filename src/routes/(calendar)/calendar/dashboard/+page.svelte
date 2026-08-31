<script lang="ts">
	import { DateTime } from 'luxon';
	import DayDashboard from '$lib/components/dashboard/DayDashboard.svelte';
	import type { PageData } from './$types';

	export let data: PageData;

	$: dayDt = DateTime.fromISO(data.dayISO).setZone(data.zone).startOf('day');
	$: dateLabel = dayDt.toFormat('cccc, LLLL d');
	$: prevDayHref = '/calendar/dashboard?date=' + dayDt.minus({ days: 1 }).toISODate();
	$: nextDayHref = '/calendar/dashboard?date=' + dayDt.plus({ days: 1 }).toISODate();
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
		<nav class="flex items-center gap-1.5" aria-label="Day navigation">
			<a
				href={prevDayHref}
				class="flex h-11 w-11 items-center justify-center rounded-lg border border-slate-300 bg-white text-slate-600 transition-colors hover:bg-slate-50 hover:text-slate-900"
				aria-label="Previous day"
				title="Previous day"
			>
				<svg class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
					<path stroke-linecap="round" stroke-linejoin="round" d="M15 19l-7-7 7-7" />
				</svg>
			</a>
			<a
				href="/calendar/dashboard"
				class="flex h-11 items-center justify-center rounded-lg border border-slate-300 bg-white px-4 text-sm font-medium text-slate-700 transition-colors hover:bg-slate-50 {data.isToday
					? 'pointer-events-none opacity-50'
					: ''}"
				aria-label="Go to today"
			>
				Today
			</a>
			<a
				href={nextDayHref}
				class="flex h-11 w-11 items-center justify-center rounded-lg border border-slate-300 bg-white text-slate-600 transition-colors hover:bg-slate-50 hover:text-slate-900"
				aria-label="Next day"
				title="Next day"
			>
				<svg class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
					<path stroke-linecap="round" stroke-linejoin="round" d="M9 5l7 7-7 7" />
				</svg>
			</a>
		</nav>
		<a
			href={`/calendar?date=${dayDt.toISODate()}&view=day`}
			class="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 transition-colors hover:bg-slate-50"
			aria-label="Open day view for {dateLabel}"
		>
			Open Day View
		</a>
		<a
			href={backToCalendarHref}
			class="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 transition-colors hover:bg-slate-50"
		>
			Back to Calendar
		</a>
	</header>

	<DayDashboard
		{dateLabel}
		isToday={data.isToday}
		meId={data.meId}
		familyId={data.familyId}
		modules={data.modules}
		dailyVerse={data.dailyVerse}
		glance={data.glance}
		dayEvents={data.dayEvents}
		top3={data.top3}
		memberStatus={data.memberStatus}
		familyTasks={data.familyTasks}
		familyMembers={data.familyMembers}
		kidsSchedule={data.kidsSchedule}
		meals={data.meals}
		dateKey={data.dateKey}
	/>
</div>