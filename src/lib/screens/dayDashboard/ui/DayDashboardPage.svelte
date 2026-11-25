<!--
	The Day Dashboard page body: the header (date, DayNav URLs, Open Day View,
	Back to Calendar), the streamed band (skeleton in the band's own grid, then
	the cards, or the retry card) and the calendar event sheet the glance rows
	open.

	Nothing heavy waits on this file: no luxon (the labels come from `Intl` over
	the load's `dayISO` + `zone`), no zod, and the event sheet is imported on the
	first click (`{#await import(…)}`), so the band's first paint is cards only.

	Behaviour lives in the load and `dayDashboard.state.svelte.ts`; this file is
	layout, copy and the two client objects. Legacy reference:
	`routes/(calendar)/calendar/dashboard/+page.svelte` + `DayDashboard.svelte`.
-->
<script lang="ts">
	import DayNav from '$lib/kernel/ui/DayNav.svelte';
	import Toaster from '$lib/kernel/ui/Toaster.svelte';
	import { createToasts } from '$lib/kernel/client/toasts.svelte';
	import { systemClock } from '$lib/kernel/time/clock';
	import { createTasksApi, type TasksApi } from '$lib/domains/tasks';
	import type {
		DashboardDayEventRow,
		DashboardRosterRow,
		DayDashboardPageData
	} from '../dayDashboard.contract';
	import { DayDashboardState } from '../dayDashboard.state.svelte';
	import DashboardBand from './DashboardBand.svelte';

	interface Props {
		data: DayDashboardPageData;
		/** SvelteKit `invalidateAll`, passed in by the route (wiring only). */
		refresh: () => Promise<void>;
		/** A fake in tests; the real client in the browser. */
		tasksApi?: TasksApi;
	}

	let { data, refresh, tasksApi = createTasksApi() }: Props = $props();

	const toasts = createToasts();
	const now = systemClock.now();
	const pageState = new DayDashboardState({
		api: tasksApi,
		toasts,
		refresh,
		roster: [],
		familyId: data.familyId ?? '',
		meId: data.meId,
		zone: data.zone
	});

	/** The viewed day's local date key; `dayISO` is midnight in the viewer's zone. */
	const dayKey = $derived(data.dayISO.slice(0, 10));
	const dateLabel = $derived(
		new Intl.DateTimeFormat('en-US', {
			weekday: 'long',
			month: 'long',
			day: 'numeric',
			timeZone: data.zone
		}).format(new Date(data.dayISO))
	);

	/** `YYYY-MM-DD` shifted by whole calendar days (UTC arithmetic on the key). */
	function shiftDay(key: string, days: number): string {
		const at = new Date(`${key}T00:00:00.000Z`);
		at.setUTCDate(at.getUTCDate() + days);
		return at.toISOString().slice(0, 10);
	}

	const previousHref = $derived(`/calendar/dashboard?date=${shiftDay(dayKey, -1)}`);
	const nextHref = $derived(`/calendar/dashboard?date=${shiftDay(dayKey, 1)}`);
	const dayViewHref = $derived(`/calendar?date=${dayKey}&view=day`);
	const backHref = $derived(data.defaultView === 'dashboard' ? '/calendar?dashboardView=1' : '/calendar');

	let selectedEvent = $state<DashboardDayEventRow | null>(null);
	let roster = $state<DashboardRosterRow[]>([]);

	// The streamed legs settle after first paint; the quick-add's `@member`
	// grammar and the event sheet's invite list fill in when they do.
	$effect(() => {
		let live = true;
		void data.data
			.then((loaded) => {
				if (!live) return;
				roster = [...loaded.familyMembers];
				pageState.setRoster(roster);
			})
			.catch(() => {});
		return () => {
			live = false;
		};
	});
</script>

<svelte:head>
	<title>Day Dashboard - {dateLabel} - Family Planz</title>
</svelte:head>

<div class="mx-auto w-full px-2 py-4 sm:px-4 lg:px-8">
	<header class="mb-4 flex flex-wrap items-center justify-between gap-3">
		<div>
			<h1 class="text-xl font-bold text-slate-900">Day Dashboard</h1>
			<p class="text-sm text-slate-500">{dateLabel}{data.isToday ? ' · today' : ''}</p>
		</div>
		<DayNav
			period="day"
			isToday={data.isToday}
			todayHref="/calendar/dashboard"
			previousHref={previousHref}
			{nextHref}
		/>
		<a
			href={dayViewHref}
			class="rounded-lg border border-slate-300 bg-white px-4 py-2.5 text-sm font-medium text-slate-700 transition-colors hover:bg-slate-50"
			aria-label="Open day view for {dateLabel}"
		>
			Open Day View
		</a>
		<a
			href={backHref}
			class="rounded-lg border border-slate-300 bg-white px-4 py-2.5 text-sm font-medium text-slate-700 transition-colors hover:bg-slate-50"
		>
			Back to Calendar
		</a>
	</header>

	{#await data.data}
		<div class="grid grid-cols-1 gap-4 lg:grid-cols-2 lg:items-stretch" aria-hidden="true">
			<div class="grid grid-cols-1 items-start gap-4 md:grid-cols-2 lg:contents">
				{#each Array(3) as _, index (index)}
					<div class="h-44 animate-pulse rounded-2xl bg-slate-100"></div>
				{/each}
			</div>
			<div class="grid grid-cols-1 items-start gap-4 lg:contents">
				{#each Array(3) as _, index (index)}
					<div class="h-56 animate-pulse rounded-2xl bg-slate-100"></div>
				{/each}
			</div>
		</div>
	{:then loaded}
		<DashboardBand
			data={loaded}
			warnings={[...data.loadWarnings, ...loaded.warnings]}
			modules={data.modules}
			{dateLabel}
			dayDate={dayKey}
			isToday={data.isToday}
			meId={data.meId}
			familyId={data.familyId}
			taskCategories={data.taskCategories}
			state={pageState}
			{now}
			onEventClick={(event) => (selectedEvent = event)}
		/>
	{:catch}
		<div class="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800" role="alert">
			Couldn't load the dashboard.
			<button type="button" onclick={() => void refresh()} class="font-semibold underline">
				Retry
			</button>
		</div>
	{/await}
</div>

{#if selectedEvent}
	{#key selectedEvent.id}
		{#await import('./DashboardEventSheet.svelte')}
			<!-- The sheet is fixed-position: nothing to reserve, so the band cannot shift. -->
		{:then { default: Sheet }}
			<Sheet
				event={selectedEvent}
				{roster}
				meId={data.meId}
				{now}
				{toasts}
				{refresh}
				onclose={() => (selectedEvent = null)}
			/>
		{/await}
	{/key}
{/if}

<Toaster items={toasts.items} ondismiss={toasts.dismiss} />
