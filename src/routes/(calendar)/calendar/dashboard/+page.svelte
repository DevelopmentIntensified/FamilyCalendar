<script lang="ts">
	import { DateTime } from 'luxon';
	import DayDashboard from '$lib/components/dashboard/DayDashboard.svelte';
	import type { PageData } from './$types';

	export let data: PageData;

	$: dateLabel = DateTime.fromISO(data.todayISO).setZone(data.zone).toFormat('cccc, LLLL d');
</script>

<svelte:head>
	<title>Day Dashboard - Family Planz</title>
</svelte:head>

<div class="mx-auto w-full px-2 py-4 sm:px-4 lg:px-8">
	<header class="mb-4 flex items-center justify-between gap-3">
		<h1 class="text-xl font-bold text-slate-900">Day Dashboard</h1>
		<a
			href="/calendar"
			class="rounded-lg border border-slate-300 bg-white px-4 py-1.5 text-sm font-medium text-slate-700 transition-colors hover:bg-slate-50"
		>
			Back to Calendar
		</a>
	</header>

	<DayDashboard
		{dateLabel}
		meId={data.meId}
		familyId={data.familyId}
		dailyVerse={data.dailyVerse}
		glance={data.glance}
		dayEvents={data.dayEvents}
		top3={data.top3}
		memberStatus={data.memberStatus}
		familyTasks={data.familyTasks}
		familyMembers={data.familyMembers}
	/>
</div>