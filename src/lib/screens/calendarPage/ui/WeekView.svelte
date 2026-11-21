<!--
	Week view (legacy `WeekView` + `WeekHeader` + `WeekAllDayRow`): the week span
	honours the settings' week start, the header opens Day View, the band carries
	all-day Events and due Tasks, and the shared hour grid draws the timed week.
-->
<script lang="ts">
	import type { CalendarPageState } from '../calendarPage.state.svelte';
	import { weekSpan } from '../calendarPage.grid.rules';
	import HourGrid from './HourGrid.svelte';
	import WeekAllDayBand from './WeekAllDayBand.svelte';

	interface Props {
		state: CalendarPageState;
	}

	let { state }: Props = $props();

	const weekDays = $derived(weekSpan(state.date, state.weekStart));
	const total = $derived(state.visibleRows.length + state.visibleTasks.length);
</script>

<div class="overflow-x-auto">
	<div class="min-w-[700px] sm:min-w-0">
		<WeekAllDayBand {state} {weekDays} />
		<div class="relative">
			<HourGrid {state} days={weekDays} variant="week" />
			{#if total === 0}
				<div class="pointer-events-none absolute inset-0 flex items-center justify-center">
					<p class="rounded-xl bg-white/60 px-6 py-4 text-sm text-slate-400 backdrop-blur-sm">
						Nothing this week — a blank week is full of options.
					</p>
				</div>
			{/if}
		</div>
	</div>
</div>
