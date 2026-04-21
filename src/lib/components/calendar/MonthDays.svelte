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

	function isAdEvent(event: Event): boolean {
		return event.isAd === true;
	}
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
					<div class="flex h-3.5 items-center justify-between {event.color} p-1 text-xs sm:text-sm {isAdEvent(event) ? 'border-2 border-amber-400 bg-amber-50' : ''}">
						<span class="flex items-center gap-1">
							{#if !pastDaysEvents.find(({ id }) => id === event.id)}
								{#if isAdEvent(event)}
									<svg class="h-2.5 w-2.5 text-amber-600" fill="currentColor" viewBox="0 0 20 20">
										<path d="M3 4a1 1 0 011-1h12a1 1 0 011 1v2a1 1 0 01-1 1H4a1 1 0 01-1-1V4zM3 10a1 1 0 011-1h6a1 1 0 011 1v6a1 1 0 01-1 1H4a1 1 0 01-1-1v-6zM14 9a1 1 0 00-1 1v6a1 1 0 001 1h2a1 1 0 001-1v-6a1 1 0 00-1-1h-2z"/>
									</svg>
								{/if}
								{event.title}
							{/if}
						</span>
					</div>
				</a>
			{/each}
		</div>
	</div>
{/each}