<script lang="ts">
	import { formatDate, getDaysInMonth, getFirstDayOfMonth, getDaysInLastMonth } from '$lib/utils/dateUtils';
	import { DateTime } from 'luxon';
	import type { Writable } from 'svelte/store';
	import type { Event } from '$lib/types';

	export let currentDate: Writable<DateTime>;
	export let events: Event[];
	export let removeEvent: (id: string) => void;
	export let preferedFirstDayOfWeek: string = 'sunday';

	const today = DateTime.now();
	const hours = Array.from({ length: 24 }, (_, i) => i);

	let dayOffset = 0;
	$: {
		if (preferedFirstDayOfWeek === 'monday') {
			dayOffset = 1;
		}
	}

	// Get start of week
	$: current = $currentDate;
	$: startOfWeek = current.startOf('week').plus({ day: dayOffset });
	$: weekDays = Array.from({ length: 7 }, (_, i) => startOfWeek.plus({ day: i }));

	function getEventsForDay(day: DateTime): Event[] {
		const dateStr = formatDate(day);
		return events.filter(e => formatDate(e.date) === dateStr);
	}

	function isToday(day: DateTime): boolean {
		return formatDate(day) === formatDate(today);
	}

	function isCurrentHour(hour: number): boolean {
		return today.weekday === day.weekday && today.hour === hour;
	}

	// For binding in each loop
	let day: DateTime;
</script>

<div class="overflow-x-auto">
	<!-- Week Header -->
	<div class="grid grid-cols-8 border-b border-slate-200 bg-slate-50 sticky top-0 z-10">
		<div class="w-14 shrink-0 border-r border-slate-200"></div>
		{#each weekDays as wd}
			<div class="flex-1 py-2 text-center border-r border-slate-100 last:border-r-0">
				<div class="text-xs font-medium uppercase text-slate-500 {isToday(wd) ? 'text-primary-600' : ''}">
					{wd.toFormat('EEE')}
				</div>
				<div class="text-lg font-semibold {isToday(wd) ? 'text-primary-600' : 'text-slate-900'}">
					{wd.day}
				</div>
			</div>
		{/each}
	</div>

	<!-- Week Body - Scrollable -->
	<div class="max-h-[70vh] overflow-y-auto">
		{#each hours as hour}
			{@const hourDate = DateTime.now().set({ hour })}
			{@const isCurrentHourNow = today.hasSame(today.set({ hour }), 'hour')}
			<div class="grid grid-cols-8 border-b border-slate-100 {isCurrentHourNow && today.weekday === day?.weekday ? 'bg-primary-50/30' : ''}">
				<!-- Time column -->
				<div class="w-14 shrink-0 border-r border-slate-200 py-3 text-right pr-2">
					<span class="text-xs font-medium text-slate-500">
						{hour === 0 ? '12 AM' : hour < 12 ? `${hour} AM` : hour === 12 ? '12 PM' : `${hour - 12} PM`}
					</span>
				</div>
				
				<!-- Day columns -->
				{#each weekDays as wd}
					{@const dayEvents = getEventsForDay(wd)}
					{@const hourEvents = dayEvents.filter(e => {
						if (!e.startTime) return false;
						const eventHour = parseInt(e.startTime.split(':')[0]);
						return eventHour === hour;
					})}
					<div class="relative flex-1 min-h-[60px] border-r border-slate-100 last:border-r-0 p-0.5 hover:bg-slate-50 transition-colors">
						{#each hourEvents as event}
							<a href="/calendar/event/{event.id}" class="block">
								<div class="{event.color} rounded px-1.5 py-1 text-xs sm:text-sm font-medium truncate hover:opacity-90 transition-opacity">
									{event.title}
								</div>
							</a>
						{/each}
					</div>
				{/each}
			</div>
		{/each}
	</div>
</div>