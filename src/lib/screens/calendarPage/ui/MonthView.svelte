<!--
	The month view: the seven weekday headers and the whole matrix the grid rules
	derive (four to six rows, both week starts). Every cell date comes from the
	matrix — never from mutating the month (`MonthDays`' own bug) — and a cell
	outside the month is drawn muted.
-->
<script lang="ts">
	import { DateTime } from 'luxon';
	import type { CalendarPageState } from '../calendarPage.state.svelte';
	import { monthGridCells } from '../calendarPage.grid.rules';
	import MonthCell from './MonthCell.svelte';

	interface Props {
		state: CalendarPageState;
	}

	let { state }: Props = $props();

	const cells = $derived(monthGridCells(state.date, state.weekStart));
	const weekdays = $derived(
		Array.from({ length: 7 }, (_, index) => {
			// A Sunday-start week names Sun first; a Monday start rotates it.
			const sundayIndex = state.weekStart === 'monday' ? 1 : 0;
			return DateTime.fromObject({ weekday: ((sundayIndex + index) % 7) + 1 }).toFormat('EEE');
		})
	);
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
		<MonthCell state={state} day={cell} inMonth={cell.hasSame(state.date, 'month')} />
	{/each}
</div>
