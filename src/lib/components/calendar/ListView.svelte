<script lang="ts">
	import { DateTime } from 'luxon';
	import type { Writable } from 'svelte/store';
	import { formatDate } from '$lib/utils/dateUtils';
	import type { Event } from '$lib/types';
	import EventModal from './EventModal.svelte';

	export let currentDate: Writable<DateTime>;
	export let events: Event[];
	export let removeEvent: (id: string) => void;

	function formatEventTime(d: Date | string): string {
		const dt = d instanceof Date ? DateTime.fromJSDate(d) : DateTime.fromISO(d);
		return dt.toFormat('h:mm a');
	}

	$: year = $currentDate.year;
	$: month = $currentDate.month;

	$: filteredEvents = events
		.filter((event) => {
			if (!event.date) return false;
			const eventDate = event.date instanceof Date ? DateTime.fromJSDate(event.date) : event.date;
			return eventDate.year === year && eventDate.month === month;
		})
		.sort((a, b) => {
			const dateA = a.date instanceof Date ? DateTime.fromJSDate(a.date) : a.date;
			const dateB = b.date instanceof Date ? DateTime.fromJSDate(b.date) : b.date;
			return dateA.toUnixInteger() - dateB.toUnixInteger();
		});

	// Group by date
	$: groupedEvents = filteredEvents.reduce((acc, event) => {
		const dateKey = formatDate(event.date);
		if (!acc[dateKey]) acc[dateKey] = [];
		acc[dateKey].push(event);
		return acc;
	}, {} as Record<string, Event[]>);

	let selectedEvent: Event | null = null;

	function handleEventClick(event: Event) {
		selectedEvent = event;
	}

	function closeModal() {
		selectedEvent = null;
	}

	function handleDelete(event: CustomEvent) {
		console.log('Delete event:', event.detail.id);
		closeModal();
	}
</script>

<div class="space-y-6">
	{#if filteredEvents.length === 0}
		<div class="flex flex-col items-center justify-center py-12 text-center">
			<svg class="mb-4 h-16 w-16 text-slate-300" fill="none" viewBox="0 0 24 24" stroke="currentColor">
				<path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
			</svg>
			<p class="text-lg font-medium text-slate-700">No events this month</p>
			<p class="text-sm text-slate-500">Create an event to get started</p>
		</div>
	{/if}

	{#each Object.entries(groupedEvents) as [date, dayEvents]}
		{@const dayDate = DateTime.fromISO(date)}
		{@const isToday = formatDate(dayDate) === formatDate(DateTime.now())}
		<div>
			<h3 class="mb-3 sticky top-0 z-10 bg-white py-2 text-sm font-semibold text-slate-500 {isToday ? 'text-primary-600' : ''}">
				{dayDate.toFormat('EEEE, MMMM d')}
				{#if isToday}
					<span class="ml-2 rounded-full bg-primary-100 px-2 py-0.5 text-xs font-medium text-primary-700">Today</span>
				{/if}
			</h3>
			<div class="space-y-2">
				{#each dayEvents as event}
					<button
						type="button"
						onclick={() => handleEventClick(event)}
						class="w-full text-left"
					>
						<div class="group flex items-center gap-4 rounded-xl border border-slate-200 bg-white p-4 transition-all hover:border-slate-300 hover:shadow-md">
							<!-- Color indicator -->
							<div class="shrink-0 h-12 w-1 rounded-full {event.color?.replace('bg-', 'bg-') || 'bg-slate-400'}"></div>
							
							<div class="flex-1 min-w-0">
								<div class="flex items-center gap-2">
									<h4 class="truncate font-medium text-slate-900 group-hover:text-primary-600">{event.title}</h4>
									{#if event.isAd}
										<span class="shrink-0 rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-700">Ad</span>
									{/if}
								</div>
								<div class="mt-1 flex flex-wrap items-center gap-x-3 text-sm text-slate-500">
									{#if event.allDay}
										<span class="flex items-center gap-1">
											<svg class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
												<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
											</svg>
											All day
										</span>
									{:else}
										{@const st = event.startTime || (event.start ? formatEventTime(event.start) : undefined)}
										{@const et = event.endTime || (event.end ? formatEventTime(event.end) : undefined)}
										{#if st}
											<span class="flex items-center gap-1">
												<svg class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
													<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
												</svg>
												{st}{#if et} - {et}{/if}
											</span>
										{/if}
									{/if}
									{#if event.location}
										<span class="flex items-center gap-1">
											<svg class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
												<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
												<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
											</svg>
											<span class="truncate max-w-[150px]">{event.location}</span>
										</span>
									{/if}
								</div>
							</div>
							<svg class="h-5 w-5 shrink-0 text-slate-400 group-hover:text-slate-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
								<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7" />
							</svg>
						</div>
					</button>
				{/each}
			</div>
		</div>
	{/each}
</div>

<!-- Event Detail Modal -->
{#if selectedEvent}
	<EventModal
		event={selectedEvent}
		show={true}
		on:close={closeModal}
		on:delete={handleDelete}
	/>
{/if}
