<script lang="ts">
	import { getDaysInMonth, getFirstDayOfMonth, formatDate } from '$lib/utils/dateUtils';
	import type { Event } from '$lib/types';
	import type { Writable } from 'svelte/store';
	import { DateTime } from 'luxon';

	export let timeZone: string;
	export let currentDate: Writable<DateTime>;
	export let events: Event[];
	export let removeEvent: (id: string) => void;

	$: year = $currentDate.year;
	$: month = $currentDate.month;
	$: daysInMonth = getDaysInMonth(year, month, timeZone);
	$: daysInLastMonth = getDaysInMonth(year, month, timeZone);
	$: firstDayOfMonth = getFirstDayOfMonth(year, month, timeZone);

	$: days = Array.from({ length: daysInMonth }, (_, i) => i + 1);
	$: emptyDays = Array.from({ length: firstDayOfMonth }, (_, i) => i);
</script>

<div class="grid grid-cols-7 gap-1 sm:gap-2">
	{#each ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'] as day}
		<div class="p-1 text-center text-sm font-semibold text-gray-600 sm:p-2 sm:text-base">
			{day}
		</div>
	{/each}
	{#each emptyDays as _}
		<div class="p-1 sm:p-2"></div>
	{/each}
	{#each days as day}
		{@const date = formatDate(
			DateTime.fromObject({ year, month, day }, { zone: timeZone }),
			timeZone
		)}
		{@const dayEvents = events.filter((event) => formatDate(event.date, timeZone) === date)}
		<div class="min-h-[80px] rounded-md border border-gray-200 p-1 sm:min-h-[100px] sm:p-2">
			<div class="font-medium text-gray-700">{day}</div>
			<div class="space-y-1">
				{#each dayEvents as event}
					<a href="/schedule/event/{event.id}" class="block">
						<div
							class="flex items-center justify-between rounded {
								'bg-blue-200'} p-1 text-xs sm:text-sm"
						>
							<span class="truncate">{event.title}</span>
						</div>
					</a>
				{/each}
			</div>
		</div>
	{/each}
</div>
