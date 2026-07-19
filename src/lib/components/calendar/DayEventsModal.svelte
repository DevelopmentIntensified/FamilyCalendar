<script lang="ts">
	import type { Event } from '$lib/types';
	import { DateTime } from 'luxon';

	export let show = false;
	export let date: string = '';
	export let events: Event[] = [];
	export let calendars: { id: string; name: string; color?: string }[] = [];

	function close() {
		show = false;
	}

	function handleEventClick(event: Event) {
		// Dispatch event to parent to open event detail
		const customEvent = new CustomEvent('eventClick', { detail: event });
		// Since we can't use createEventDispatcher in this context, we'll use a prop callback
		if (onEventClick) onEventClick(event);
	}

	export let onEventClick: (event: Event) => void = () => {};

	$: formattedDate = date ? DateTime.fromISO(date).toFormat('EEEE, MMMM d, yyyy') : '';

	function getCalendarName(calendarId: string | null): string {
		if (!calendarId) return '';
		return calendars.find(c => c.id === calendarId)?.name || '';
	}

	function formatEventTime(d: Date | string | undefined | null): string {
		if (!d) return '';
		const dt = d instanceof Date ? DateTime.fromJSDate(d) : DateTime.fromISO(d);
		if (!dt.isValid) return '';
		return dt.toFormat('h:mm a');
	}
</script>

{#if show}
	<div class="fixed inset-0 z-50 flex items-center justify-center p-4">
		<button class="absolute inset-0 bg-black/40 backdrop-blur-sm" onclick={close}></button>
		
		<div class="relative w-full max-w-lg max-h-[90vh] overflow-y-auto rounded-2xl bg-white shadow-2xl">
			<!-- Header -->
			<div class="flex items-center justify-between border-b border-slate-100 p-6">
				<h2 class="text-xl font-bold text-slate-900">{formattedDate}</h2>
				<button
					type="button"
					onclick={close}
					class="rounded-full p-2 text-slate-400 hover:bg-slate-100 hover:text-slate-600 transition-colors"
					aria-label="Close"
				>
					<svg class="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
						<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
					</svg>
				</button>
			</div>

			<!-- Events List -->
			<div class="divide-y divide-slate-100">
				{#each events as event (event.id)}
					<button
						type="button"
						class="w-full text-left px-6 py-4 hover:bg-slate-50 transition-colors"
						onclick={() => handleEventClick(event)}
					>
						<div class="flex items-start gap-3">
							<div class="h-3 w-3 mt-1 rounded-full shrink-0" style="background-color: {event.color || '#94a3b8'}"></div>
							<div class="flex-1 min-w-0">
								<h3 class="font-semibold text-slate-900 truncate">{event.title}</h3>
								<div class="flex flex-wrap items-center gap-2 mt-1 text-sm text-slate-600">
									{#if event.allDay}
										<span>All day</span>
									{:else if event.startTime}
										<span>{event.startTime}{#if event.endTime} - {event.endTime}{/if}</span>
									{:else if event.start}
										{@const st = formatEventTime(event.start)}
										{@const et = event.end ? formatEventTime(event.end) : undefined}
										<span>{st}{#if et} - {et}{/if}</span>
									{/if}
									{#if event.location}
										<span class="truncate">· {event.location}</span>
									{/if}
								</div>
								{#if event.calendar}
									<div class="flex items-center gap-1 mt-1 text-xs text-slate-500">
										<svg class="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
											<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-4 0a1 1 0 01-1-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 01-1 1" />
										</svg>
										{event.calendar.name}
									</div>
								{:else if getCalendarName(event.calendarId)}
									<div class="flex items-center gap-1 mt-1 text-xs text-slate-500">
										<svg class="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
											<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-4 0a1 1 0 01-1-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 01-1 1" />
										</svg>
										{getCalendarName(event.calendarId)}
									</div>
								{/if}
							</div>
						</div>
					</button>
				{/each}
			</div>

			{#if events.length === 0}
				<div class="px-6 py-12 text-center text-slate-500">
					No events for this day
				</div>
			{/if}
		</div>
	</div>
{/if}
