<script lang="ts">
	import { formatDate } from '$lib/utils/dateUtils';
	import { DateTime } from 'luxon';
	import type { Event } from '$lib/types';
	import EventModal from './EventModal.svelte';
	import DayEventsModal from './DayEventsModal.svelte';

	export let currentDate: DateTime;
	export let events: Event[];
	export let days: number[];
	export let nextMonth: boolean | undefined;
	export let lastMonth: boolean | undefined;
	export let calendars: { id: string; name: string }[] = [];

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

	let selectedEvent: Event | null = null;
	let showDayModal = false;
	let selectedDate = '';
	let selectedDayEvents: Event[] = [];

	function handleEventClick(event: Event) {
		selectedEvent = event;
	}

	function closeModal() {
		selectedEvent = null;
	}

	function handleDayClick(date: string, dayEvents: Event[]) {
		selectedDate = date;
		selectedDayEvents = dayEvents;
		showDayModal = true;
	}

	function closeDayModal() {
		showDayModal = false;
		selectedDate = '';
		selectedDayEvents = [];
	}

	function handleDayEventClick(event: Event) {
		closeDayModal();
		selectedEvent = event;
	}

	function handleDelete(event: CustomEvent) {
		// Dispatch delete action - parent should handle this
		console.log('Delete event:', event.detail.id);
		closeModal();
	}
</script>

{#each days as day}
	{@const date = formatDate(currentDate.set({ day }))}
	{@const lastDate = formatDate(currentDate.set({ day }).plus({ day: -1 }))}
	{@const pastDaysEvents = events.filter((event) => formatDate(event.date) === lastDate)}
	{@const dayEvents = events.filter((event) => formatDate(event.date) === date)}
	{@const isTodayDate = date === formatDate(today)}
	<div
		class="relative min-h-[70px] border transition-colors hover:bg-slate-50 {isTodayDate
			? 'border-primary-500 bg-primary-50/30'
			: 'border-slate-200'} sm:min-h-[100px]"
	>
		<div class="flex items-center justify-between pl-1 {nextMonth || lastMonth ? 'text-slate-400' : ''}">
			<span class="font-medium {isTodayDate ? 'flex h-6 w-6 items-center justify-center rounded-full bg-primary-600 text-white' : 'text-slate-700'}">
				{day}
			</span>
		</div>
		<div class="space-y-0.5 px-0.5">
			{#each dayEvents.slice(0, 3) as event}
				<button
					type="button"
					onclick={() => handleEventClick(event)}
					class="w-full text-left {event.color} rounded px-1 py-0.5 text-xs font-medium truncate transition-all hover:scale-[1.02] hover:shadow-sm {isAdEvent(event) ? 'border border-amber-300 bg-amber-100' : ''}"
				>
					<span class="flex items-center gap-0.5 truncate">
						{#if isAdEvent(event)}
							<svg class="h-3 w-3 shrink-0 text-amber-600" fill="currentColor" viewBox="0 0 20 20">
								<path d="M3 4a1 1 0 011-1h12a1 1 0 011 1v2a1 1 0 01-1 1H4a1 1 0 01-1-1V4zM3 10a1 1 0 011-1h6a1 1 0 011 1v6a1 1 0 01-1 1H4a1 1 0 01-1-1v-6zM14 9a1 1 0 00-1 1v6a1 1 0 001 1h2a1 1 0 001-1v-6a1 1 0 00-1-1h-2z"/>
							</svg>
						{/if}
						<span class="truncate">{event.title}</span>
					</span>
				</button>
			{/each}
			{#if dayEvents.length > 3}
				<button
					type="button"
					onclick={() => handleDayClick(date, dayEvents)}
					class="text-xs font-medium text-slate-500 hover:text-primary-600"
				>
					+{dayEvents.length - 3} more
				</button>
			{/if}
		</div>
	</div>
{/each}

<!-- Event Detail Modal -->
{#if selectedEvent}
	<EventModal
		event={selectedEvent}
		show={true}
		{calendars}
		on:close={closeModal}
		on:delete={handleDelete}
	/>
{/if}

<!-- Day Events Modal (for +more clicks) -->
{#if showDayModal}
	<DayEventsModal
		show={true}
		date={selectedDate}
		events={selectedDayEvents}
		calendars={calendars}
		on:eventClick={(e) => handleDayEventClick(e.detail)}
		on:close={closeDayModal}
	/>
{/if}
