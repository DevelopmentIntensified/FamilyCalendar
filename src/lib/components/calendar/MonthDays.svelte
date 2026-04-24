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
	{@const isTodayDate = date === formatDate(today)}
	<div
		class="min-h-[70px] border transition-colors hover:bg-slate-50 {isTodayDate
			? 'border-primary-500 bg-primary-50/30'
			: 'border-slate-200'} sm:min-h-[100px]"
	>
		<div class="flex items-center justify-between pl-1 {nextMonth || lastMonth ? 'text-slate-400' : ''}">
			<span class="font-medium {isTodayDate ? 'flex h-6 w-6 items-center justify-center rounded-full bg-primary-600 text-white' : 'text-slate-700'}">
				{day}
			</span>
		</div>
		<div class="space-y-1 px-0.5">
			{#each dayEvents as event, i}
				<a href="/calendar/event/{event.id}" class="block">
					<div class="flex h-6 items-center justify-between rounded-md {event.color} px-1.5 py-0.5 text-xs font-medium text-slate-900 truncate transition-all hover:scale-[1.02] {isAdEvent(event) ? 'border border-amber-300 bg-amber-100' : ''}">
						<span class="flex items-center gap-1 truncate">
							{#if !pastDaysEvents.find(({ id }) => id === event.id)}
								{#if isAdEvent(event)}
									<svg class="h-3 w-3 shrink-0 text-amber-600" fill="currentColor" viewBox="0 0 20 20">
										<path d="M3 4a1 1 0 011-1h12a1 1 0 011 1v2a1 1 0 01-1 1H4a1 1 0 01-1-1V4zM3 10a1 1 0 011-1h6a1 1 0 011 1v6a1 1 0 01-1 1H4a1 1 0 01-1-1v-6zM14 9a1 1 0 00-1 1v6a1 1 0 001 1h2a1 1 0 001-1v-6a1 1 0 00-1-1h-2z"/>
									</svg>
								{/if}
								<span class="truncate">{event.title}</span>
							{/if}
						</span>
					</div>
				</a>
			{/each}
			{#if dayEvents.length > 3}
				<button class="text-xs font-medium text-slate-500 hover:text-primary-600">
					+{dayEvents.length - 3} more
				</button>
			{/if}
		</div>
	</div>
{/each}