<script lang="ts">
	import { formatDate } from '$lib/utils/dateUtils';
	import { DateTime } from 'luxon';
	import type { Writable } from 'svelte/store';
	import type { Event } from '$lib/types';
	import EventModal from './EventModal.svelte';

	export let currentDate: Writable<DateTime>;
	export let events: Event[];
	export let removeEvent: (id: string) => void;
	export let preferedFirstDayOfWeek: string = 'sunday';
	export let calendarIds: { id: string; name: string; color?: string }[] = [];

	const today = DateTime.now();
	const hours = Array.from({ length: 24 }, (_, i) => i);

	let dayOffset = 0;
	$: {
		if (preferedFirstDayOfWeek === 'monday') {
			dayOffset = 1;
		}
	}

	$: current = $currentDate;
	$: startOfWeek = current.startOf('week').plus({ day: dayOffset });
	$: weekDays = Array.from({ length: 7 }, (_, i) => startOfWeek.plus({ day: i }));

	function formatTime(d: Date | string | undefined): string {
		if (!d) return '';
		const dt = d instanceof Date ? DateTime.fromJSDate(d) : DateTime.fromISO(d);
		return dt.toFormat('h:mm a');
	}

	function getEventTop(event: Event): number {
		if (!event.start) return 0;
		const d = event.start instanceof Date ? event.start : new Date(event.start);
		return ((d.getHours() * 60 + d.getMinutes()) / (24 * 60)) * 100;
	}

	function getEventHeight(event: Event): number {
		if (!event.start) return 5;
		const start = event.start instanceof Date ? event.start : new Date(event.start);
		const startMin = start.getHours() * 60 + start.getMinutes();
		let endMin = startMin + 60;
		if (event.end) {
			const end = event.end instanceof Date ? event.end : new Date(event.end);
			endMin = end.getHours() * 60 + end.getMinutes();
			if (endMin <= startMin) endMin = startMin + 60;
		}
		return Math.max(((endMin - startMin) / (24 * 60)) * 100, 2.5);
	}

	function getEventsForDay(day: DateTime): Event[] {
		const dateStr = formatDate(day);
		return events.filter(e => {
			if (!e.date) return false;
			const eventDate = e.date instanceof Date ? formatDate(e.date) : formatDate(e.date);
			return eventDate === dateStr;
		});
	}

	function isToday(day: DateTime): boolean {
		return formatDate(day) === formatDate(today);
	}

	function isCurrentHour(hour: number, day: DateTime): boolean {
		return today.hasSame(day, 'day') && today.hour === hour;
	}

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

	<!-- All-Day Events Row -->
	<div class="grid grid-cols-8 border-b border-slate-200 bg-slate-50/50">
		<div class="w-14 shrink-0 border-r border-slate-200 py-1 px-1 text-xs text-slate-500 flex items-center justify-end pr-2">
			All day
		</div>
		{#each weekDays as wd}
			{@const allDayEvents = getEventsForDay(wd).filter(e => e.allDay)}
			<div class="flex-1 min-h-[40px] border-r border-slate-100 last:border-r-0 p-0.5">
				{#each allDayEvents as event}
					<button
						type="button"
						onclick={() => handleEventClick(event)}
						class="rounded px-1 py-0.5 text-xs font-medium truncate hover:opacity-90 transition-opacity cursor-pointer w-full text-left bg-white"
						style="border-left: 3px solid {event.color || '#94a3b8'}"
					>
						{event.title}
					</button>
				{/each}
			</div>
		{/each}
	</div>

	<!-- Week Body - Scrollable -->
	<div class="max-h-[60vh] overflow-y-auto">
		<div class="relative" style="height: calc(24 * 60px);">
			<!-- Hour background grid -->
			{#each hours as hour}
				<div class="grid grid-cols-8 border-b border-slate-100 {isCurrentHour(hour, $currentDate) ? 'bg-primary-50/30' : ''}" style="height: 60px;">
					<div class="w-14 shrink-0 border-r border-slate-200 py-3 text-right pr-2">
						<span class="text-xs font-medium text-slate-500">
							{hour === 0 ? '12 AM' : hour < 12 ? `${hour} AM` : hour === 12 ? '12 PM' : `${hour - 12} PM`}
						</span>
					</div>
					{#each weekDays as wd}
						<div class="flex-1 border-r border-slate-100 last:border-r-0"></div>
					{/each}
				</div>
			{/each}

			<!-- Event overlay -->
			<div class="absolute inset-0 grid grid-cols-8 pointer-events-none">
				<div class="w-14 shrink-0"></div>
				{#each weekDays as wd}
					{@const dayEvents = getEventsForDay(wd).filter(e => !e.allDay)}
					<div class="relative pointer-events-auto">
						{#each dayEvents as event}
							<button
								type="button"
								onclick={() => handleEventClick(event)}
								class="absolute left-0.5 right-0.5 rounded px-1 py-0.5 text-xs sm:text-sm font-medium truncate hover:opacity-90 transition-opacity cursor-pointer text-left overflow-hidden bg-white"
								style="top: {getEventTop(event)}%; height: {getEventHeight(event)}%; border-left: 3px solid {event.color || '#94a3b8'}; min-height: 18px;"
							>
								<span class="block truncate">{event.title}</span>
								<span class="block text-[10px] opacity-75 truncate">
									{formatTime(event.start)}{#if event.end} - {formatTime(event.end)}{/if}
								</span>
							</button>
						{/each}
					</div>
				{/each}
			</div>
		</div>
	</div>
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
