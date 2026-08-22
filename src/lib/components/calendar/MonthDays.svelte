<script lang="ts">
	import { formatDate } from '$lib/utils/dateUtils';
	import { DateTime } from 'luxon';
	import type { Event } from '$lib/types';
	import EventModal from './EventModal.svelte';
	import { invalidateAll } from '$app/navigation';

	export let currentDate: DateTime;
	export let events: Event[];
	export let days: number[];
	export let nextMonth: boolean | undefined;
	export let lastMonth: boolean | undefined;
	export let calendars: { id: string; name: string; color?: string }[] = [];
	export let openDay: (date: DateTime) => void = () => {};

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

	function chipColor(event: Event): string {
		return event.color || '#94a3b8';
	}

	function calendarLabel(event: Event): string {
		if (calendars.length < 2) return '';
		return calendars.find((c) => c.id === event.calendarId)?.name || '';
	}

	function chipTooltip(event: Event): string {
		const name = calendarLabel(event);
		return name ? `${event.title} · ${name}` : event.title;
	}

	function chipStyle(event: Event): string {
		if (isAdEvent(event)) return '';
		const color = chipColor(event);
		// All-day events read as solid blocks; timed ones stay light.
		return event.allDay
			? `background-color: ${color}33; border-left: 3px solid ${color};`
			: `border-left: 3px solid ${color};`;
	}

	let selectedEvent: Event | null = null;

	function handleEventClick(event: Event) {
		selectedEvent = event;
	}

	function closeModal() {
		selectedEvent = null;
	}

	function handleDelete(event: CustomEvent) {
		// EventModal performs the API call; refresh server data here.
		invalidateAll().then(closeModal);
	}
</script>

{#each days as day}
	{@const cellDate = currentDate.set({ day })}
	{@const date = formatDate(cellDate)}
	{@const dayEvents = events.filter((event) => formatDate(event.date) === date)}
	{@const isTodayDate = date === formatDate(today)}
	{@const isOtherMonth = nextMonth || lastMonth}
	<div
		class="group relative min-h-[72px] rounded-lg border p-0.5 transition-colors {isTodayDate
			? 'border-primary-300 bg-primary-50/40 ring-1 ring-inset ring-primary-200'
			: isOtherMonth
				? 'border-slate-100 bg-slate-50/50'
				: 'border-slate-100 hover:bg-slate-50'} sm:min-h-[104px]"
	>
		<button
			type="button"
			class="absolute inset-0 z-0 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-400"
			aria-label="Open {date}"
			onclick={() => openDay(cellDate)}
		></button>
		<div class="pointer-events-none relative z-10 flex items-center justify-between pl-1.5 pt-0.5 pr-1">
			<span class="flex h-5 w-5 items-center justify-center text-xs font-semibold {isTodayDate ? 'rounded-full bg-primary-600 text-white' : isOtherMonth ? 'text-slate-400' : 'text-slate-600'}">
				{day}
			</span>
			{#if isTodayDate}
				<span class="pr-0.5 text-[10px] font-medium uppercase tracking-wide text-primary-500">today</span>
			{/if}
		</div>
		<div class="relative z-10 mt-0.5 space-y-[3px] px-0.5 pb-0.5">
			{#each dayEvents.slice(0, 3) as event}
				<button
					type="button"
					onclick={() => handleEventClick(event)}
					title={chipTooltip(event)}
					class="flex w-full items-center gap-1 overflow-hidden rounded-md px-1 py-[3px] text-left text-[11px] font-medium leading-tight transition-colors {isAdEvent(event)
						? 'border border-amber-300 bg-amber-100'
						: 'bg-white hover:brightness-95'}"
					style={chipStyle(event)}
				>
					{#if !event.allDay && !isAdEvent(event)}
						<span class="h-1.5 w-1.5 shrink-0 rounded-full" style="background-color: {chipColor(event)}"></span>
					{/if}
					{#if isAdEvent(event)}
						<svg class="h-3 w-3 shrink-0 text-amber-600" fill="currentColor" viewBox="0 0 20 20">
							<path d="M3 4a1 1 0 011-1h12a1 1 0 011 1v2a1 1 0 01-1 1H4a1 1 0 01-1-1V4zM3 10a1 1 0 011-1h6a1 1 0 011 1v6a1 1 0 01-1 1H4a1 1 0 01-1-1v-6zM14 9a1 1 0 00-1 1v6a1 1 0 001 1h2a1 1 0 001-1v-6a1 1 0 00-1-1h-2z"/>
						</svg>
					{/if}
					<span class="truncate">{event.title}</span>
				</button>
			{/each}
			{#if dayEvents.length > 3}
				<button
					type="button"
					onclick={() => openDay(cellDate)}
					class="rounded px-1 text-[11px] font-medium text-slate-400 transition-colors hover:text-primary-600"
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
