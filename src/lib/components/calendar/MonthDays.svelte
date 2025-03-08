<script lang="ts">
	import { formatDate } from '$lib/utils/dateUtils';
	import { DateTime } from 'luxon';
	import type { Event } from '$lib/types';

	export let currentDate: DateTime;
	export let events: Event[];
	export let days: number[];
	export let nextMonth: boolean | undefined;
	export let lastMonth: boolean | undefined;

	$: if (nextMonth) {
		currentDate = currentDate.plus({
			month: 1
		});
	} else if (lastMonth) {
		currentDate = currentDate.plus({
			month: -1
		});
	}

	const today = DateTime.now();
</script>

{#each days as day}
	{@const date = formatDate(currentDate.set({ day }))}
	{@const lastDate = formatDate(currentDate.set({ day }).plus({ day: -1 }))}
	{@const pastDaysEvents = events.filter((event) => formatDate(event.date) === lastDate)}
	{@const dayEvents = events.filter((event) => formatDate(event.date) === date)}
	<div
		class="min-h-[70px] border {date === formatDate(today)
			? 'border-blue-500 shadow-sm shadow-blue-500'
			: 'border-gray-200'} sm:min-h-[100px]"
	>
		<div class="pl-1 font-medium {nextMonth || lastMonth ? 'text-gray-400' : 'text-gray-700'}">
			{day}
		</div>
		<div class="space-y-1">
			{#each dayEvents as event, i}
				<a href="/calendar/event/{event.id}" class="block">
					<div class="flex h-3.5 items-center justify-between {event.color} p-1 text-xs sm:text-sm">
						<span>
							{#if !pastDaysEvents.find(({ id }) => id === event.id)}
								{event.title}
							{/if}
						</span>
					</div>
				</a>
			{/each}
		</div>
	</div>
{/each}
