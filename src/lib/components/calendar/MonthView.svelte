<script lang="ts">
	import {
		getDaysInMonth,
		getFirstDayOfMonth,
		getFirstDayOfNextMonth,
		formatDate,
		getDaysInLastMonth
	} from '$lib/utils/dateUtils';
	import type { Event } from '$lib/types';
	import type { Writable } from 'svelte/store';
	import { DateTime } from 'luxon';
	import MonthDays from './MonthDays.svelte';

	export let currentDate: Writable<DateTime>;
	export let events: Event[];
	export let removeEvent: (id: string) => void;
	export let preferedFirstDayOfWeek: string = 'Monday';
	export let calendarIds: { id: string; name: string; color?: string }[] = [];
	export let openDay: (date: DateTime) => void = () => {};
	export let dueTasks: { id: string; title: string; dueDate: Date | string }[] = [];
	export let createAt: (date: DateTime) => void = () => {};
	export let selectionMode: boolean = false;
	export let selectedIds: string[] = [];
	export let onToggleSelect: (event: Event) => void = () => {};

	const today = DateTime.now();

	//$: basically just makes the code revaluate each time the values change
	let daysOfWeek = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
	let dayOffset = 0;
	if (preferedFirstDayOfWeek === 'monday') {
		dayOffset = 1;
		let firstDay = daysOfWeek.shift();
		daysOfWeek.push(firstDay);
	}

	$: year = $currentDate.year;
	$: month = $currentDate.month;
	$: daysInMonth = getDaysInMonth(year, month); //uses luxon to get days in month
	$: daysInLastMonth = getDaysInLastMonth(year, month); //same as above, but last month
	$: firstDayOfMonth = getFirstDayOfMonth(year, month) - dayOffset; //gets the 1-7 first day of the week and changes based on what the prefered first day of the week is
	$: firstDayInNextMonth = getFirstDayOfNextMonth(year, month) - dayOffset; //same as above, but for next month

	$: days = Array.from({ length: daysInMonth }, (_, i) => i + 1);
	$: lastMonthDays = Array.from(
		{ length: firstDayOfMonth === 7 ? 0 : firstDayOfMonth }, // create an array with length of first day of the week that is in this month
		(_, i) => i + daysInLastMonth - firstDayOfMonth + 1 // take each element in the array, add the ammount of days in last month, subtract the number that is the first day of the week that is in this month and then add 1 because arrays start at 0.
	);
	$: nextMonthDays = Array.from({ length: 7 - firstDayInNextMonth }, (_, i) => i + 1); //similar to above, but for next month
</script>

<div class="grid grid-cols-7 sm:gap-2">
	{#each daysOfWeek as day}
		<div class="p-2 text-center text-xs font-semibold text-slate-500 sm:p-3 sm:text-sm uppercase tracking-wide">
			{day}
		</div>
	{/each}
	<MonthDays days={lastMonthDays} currentDate={$currentDate} {events} lastMonth={true} calendars={calendarIds} {openDay} {createAt} selectionMode={selectionMode} selectedIds={selectedIds} onToggleSelect={onToggleSelect} />
	<MonthDays {days} currentDate={$currentDate} {events} calendars={calendarIds} {openDay} {dueTasks} {createAt} selectionMode={selectionMode} selectedIds={selectedIds} onToggleSelect={onToggleSelect} />
	<MonthDays days={nextMonthDays} currentDate={$currentDate} {events} nextMonth={true} calendars={calendarIds} {openDay} {createAt} selectionMode={selectionMode} selectedIds={selectedIds} onToggleSelect={onToggleSelect} />
</div>
