<!--
	The month view: the seven weekday headers and the whole matrix the grid rules
	derive (four to six rows, both week starts). Every cell date comes from the
	matrix — never from mutating the month (`MonthDays`' own bug) — and a cell
	outside the month is drawn muted.
-->
<script lang="ts">
	import { onMount } from 'svelte';
	import type { CalendarPageState } from '../calendarPage.state.svelte';
	import { monthGridCells } from '../calendarPage.grid.rules';
	import { VIEW_BREAKPOINT_PX } from '../calendarPage.view.rules';
	import MonthCell from './MonthCell.svelte';

	interface Props {
		state: CalendarPageState;
	}

	let { state }: Props = $props();

	const cells = $derived(monthGridCells(state.date, state.weekStart));
	// The header row IS the matrix's first week: naming the days from the cells
	// can never disagree with the columns (a Sunday start opens on Sunday).
	const weekdays = $derived(cells.slice(0, 7).map((day) => day.toFormat('EEE')));

	/**
	 * The app's ONE breakpoint, read here so 35–42 cells share one listener
	 * (legacy `MonthDays` did the same). Wide until a browser says otherwise,
	 * which is also the SSR answer.
	 */
	let narrow = $state(false);
	onMount(() => {
		const mq = window.matchMedia(`(min-width: ${VIEW_BREAKPOINT_PX}px)`);
		const apply = () => (narrow = !mq.matches);
		apply();
		mq.addEventListener('change', apply);
		return () => mq.removeEventListener('change', apply);
	});
</script>

<div data-testid="month-grid" class="grid min-w-0 grid-cols-7 overflow-hidden sm:gap-2">
	{#each weekdays as weekday (weekday)}
		<div
			class="min-w-0 p-2 text-center text-xs font-semibold uppercase tracking-wide text-slate-500 sm:p-3 sm:text-sm"
		>
			{weekday}
		</div>
	{/each}
	{#each cells as cell (cell.toMillis())}
		<MonthCell state={state} day={cell} inMonth={cell.hasSame(state.date, 'month')} {narrow} />
	{/each}
</div>
