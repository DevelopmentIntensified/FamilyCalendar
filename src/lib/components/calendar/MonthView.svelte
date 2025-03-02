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

	export let timeZone: string;
	export let currentDate: Writable<DateTime>;
	export let events: Event[];
	export let removeEvent: (id: string) => void;
	export let preferedFirstDayOfWeek: string = 'Monday';

	const today = DateTime.now().setZone(timeZone);

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
	$: daysInMonth = getDaysInMonth(year, month, timeZone); //uses luxon to get days in month
	$: daysInLastMonth = getDaysInLastMonth(year, month, timeZone); //same as above, but last month
	$: firstDayOfMonth = getFirstDayOfMonth(year, month, timeZone) - dayOffset; //gets the 1-7 first day of the week and changes based on what the prefered first day of the week is
	$: firstDayInNextMonth = getFirstDayOfNextMonth(year, month, timeZone) - dayOffset; //same as above, but for next month

	$: days = Array.from({ length: daysInMonth }, (_, i) => i + 1);
	$: lastMonthDays = Array.from(
		{ length: firstDayOfMonth === 7 ? 0 : firstDayOfMonth }, // create an array with length of first day of the week that is in this month
		(_, i) => i + daysInLastMonth - firstDayOfMonth + 1 // take each element in the array, add the ammount of days in last month, subtract the number that is the first day of the week that is in this month and then add 1 because arrays start at 0.
	);
	$: nextMonthDays = Array.from({ length: 7 - firstDayInNextMonth }, (_, i) => i + 1); //similar to above, but for next month
</script>

<div class="grid grid-cols-7 sm:gap-2">
	{#each daysOfWeek as day}
		<div class="p-1 text-center text-sm font-semibold text-gray-600 sm:p-2 sm:text-base">
			{day}
		</div>
	{/each}
	{#each lastMonthDays as day}
		{@const date = formatDate($currentDate.plus({ month: -1 }).set({ day }), timeZone)}
		{@const dayEvents = events.filter((event) => formatDate(event.date, timeZone) === date)}
		<div
			class="min-h-[70px] border p-1 sm:min-h-[100px] sm:p-2 {date === formatDate(today, timeZone)
				? 'border-blue-200 shadow-md shadow-blue-200'
				: 'border-gray-200'}"
		>
			<div class="font-medium text-gray-300">{day}</div>
			<div class="space-y-1">
				{#each dayEvents as event}
					<a href="/calendar/event/{event.id}" class="block">
						<div
							class="flex items-center justify-between rounded {'bg-blue-200'} p-1 text-xs sm:text-sm"
						>
							<span class="truncate">{event.title}</span>
						</div>
					</a>
				{/each}
			</div>
		</div>
	{/each}
	{#each days as day}
		{@const date = formatDate($currentDate.set({ day }), timeZone)}
		{@const dayEvents = events.filter((event) => formatDate(event.date, timeZone) === date)}
		<div
			class="min-h-[70px] border {date === formatDate(today, timeZone)
				? 'border-blue-500 shadow-sm shadow-blue-500'
				: 'border-gray-200'} p-1 sm:min-h-[100px] sm:p-2"
		>
			<div class="font-medium text-gray-700">{day}</div>
			<div class="space-y-1">
				{#each dayEvents as event}
					<a href="/calendar/event/{event.id}" class="block">
						<div
							class="flex items-center justify-between rounded {'bg-blue-200'} p-1 text-xs sm:text-sm"
						>
							<span class="truncate">{event.title}</span>
						</div>
					</a>
				{/each}
			</div>
		</div>
	{/each}
	{#each nextMonthDays as day}
		{@const date = formatDate($currentDate.plus({ month: 1 }).set({ day }), timeZone)}
		{@const dayEvents = events.filter((event) => formatDate(event.date, timeZone) === date)}
		<div
			class="min-h-[70px] border {date === formatDate(today, timeZone)
				? 'border-blue-200 shadow-md shadow-blue-200'
				: 'border-gray-200'} p-1 sm:min-h-[100px] sm:p-2"
		>
			<div class="font-medium text-gray-300">{day}</div>
			<div class="space-y-1">
				{#each dayEvents as event}
					<a href="/calendar/event/{event.id}" class="block">
						<div
							class="flex items-center justify-between rounded {'bg-blue-200'} p-1 text-xs sm:text-sm"
						>
							<span class="truncate">{event.title}</span>
						</div>
					</a>
				{/each}
			</div>
		</div>
	{/each}
</div>
