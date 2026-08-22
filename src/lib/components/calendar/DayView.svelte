<script lang="ts">
	import { createEventDispatcher } from 'svelte';
	import { DateTime } from 'luxon';
	import type { Writable } from 'svelte/store';
	import type { Event } from '$lib/types';
	import { formatDate } from '$lib/utils/dateUtils';
	import EventModal from './EventModal.svelte';
	import { invalidateAll } from '$app/navigation';

	export let currentDate: Writable<DateTime>;
	export let events: Event[] = [];
	export let calendarIds: { id: string; name: string; color?: string }[] = [];

	const dispatch = createEventDispatcher<{ back: void }>();

	const today = DateTime.now();

	$: selectedDate = $currentDate;

	function toDate(v: unknown): Date {
		return v instanceof Date ? v : new Date(v as string);
	}

	function formatTime(d: unknown): string {
		if (!d) return '';
		const dt = DateTime.fromJSDate(toDate(d));
		return dt.isValid ? dt.toFormat('h:mm a') : '';
	}

	$: dayEvents = events
		.filter((e) => e.date && formatDate(e.date) === formatDate(selectedDate))
		.sort((a, b) => {
			const aAllDay = a.allDay ? 0 : 1;
			const bAllDay = b.allDay ? 0 : 1;
			if (aAllDay !== bAllDay) return aAllDay - bAllDay;
			return toDate(a.start).getTime() - toDate(b.start).getTime();
		});

	$: allDayEvents = dayEvents.filter((e) => e.allDay);
	$: timedEvents = dayEvents.filter((e) => !e.allDay);

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

<div>
	<!-- Day Header -->
	<div class="mb-4 flex items-center gap-3 border-b border-slate-200 pb-3">
		<button
			type="button"
			onclick={() => dispatch('back')}
			class="flex h-9 w-9 items-center justify-center rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50 transition-colors"
			aria-label="Back"
		>
			<svg class="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
				<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 19l-7-7 7-7" />
			</svg>
		</button>
		<h2 class="text-xl font-semibold text-slate-900 sm:text-2xl">
			{selectedDate.toFormat('EEEE, MMMM d')}
			{#if formatDate(selectedDate) === formatDate(today)}
				<span class="ml-2 rounded-full bg-primary-100 px-2 py-0.5 align-middle text-xs font-medium text-primary-700">Today</span>
			{/if}
		</h2>
	</div>

	{#if dayEvents.length === 0}
		<div class="flex flex-col items-center justify-center py-16 text-center">
			<svg class="mb-4 h-14 w-14 text-slate-300" fill="none" viewBox="0 0 24 24" stroke="currentColor">
				<path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
			</svg>
			<p class="text-lg font-medium text-slate-700">Nothing scheduled</p>
			<p class="text-sm text-slate-500">Enjoy the free day</p>
		</div>
	{:else}
		<div class="space-y-2">
			{#if allDayEvents.length > 0}
				<div class="mb-3 rounded-xl bg-slate-50 p-3">
					<h3 class="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">All day</h3>
					<div class="space-y-1.5">
						{#each allDayEvents as event}
							<button
								type="button"
								onclick={() => handleEventClick(event)}
								class="w-full rounded bg-white px-3 py-2 text-left text-sm font-medium text-slate-900 hover:opacity-90"
								style="border-left: 3px solid {event.color || '#94a3b8'}"
							>
								{event.title}
							</button>
						{/each}
					</div>
				</div>
			{/if}

			{#each timedEvents as event}
				<button
					type="button"
					onclick={() => handleEventClick(event)}
					class="group flex w-full items-stretch gap-3 rounded-xl border border-slate-200 bg-white p-3 text-left transition-all hover:border-slate-300 hover:shadow-md"
				>
					<div class="w-20 shrink-0 pt-0.5 text-right sm:w-24">
						<span class="block text-sm font-semibold text-slate-900">{formatTime(event.start)}</span>
						{#if event.end}
							<span class="block text-xs text-slate-500">{formatTime(event.end)}</span>
						{/if}
					</div>
					<div class="w-1 shrink-0 rounded-full" style="background-color: {event.color || '#94a3b8'}"></div>
					<div class="min-w-0 flex-1">
						<h4 class="truncate font-medium text-slate-900 group-hover:text-primary-600">{event.title}</h4>
						{#if event.location}
							<p class="mt-0.5 truncate text-sm text-slate-500">{event.location}</p>
						{/if}
						{#if calendarIds.length > 1 && calendars.find(c => c.id === event.calendarId)}
							<p class="mt-0.5 text-xs font-medium text-slate-400">
								{calendars.find(c => c.id === event.calendarId)?.name}
							</p>
						{/if}
					</div>
					<svg class="h-5 w-5 shrink-0 self-center text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
						<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7" />
					</svg>
				</button>
			{/each}
		</div>
	{/if}
</div>

<!-- Event Detail Modal -->
{#if selectedEvent}
	<EventModal
		event={selectedEvent}
		show={true}
		calendars={calendarIds}
		on:close={closeModal}
		on:delete={handleDelete}
	/>
{/if}
