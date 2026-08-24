<script lang="ts">
	import { formatDate } from '$lib/utils/dateUtils';
	import { DateTime } from 'luxon';
	import type { Writable } from 'svelte/store';
	import type { Event } from '$lib/types';
	import EventModal from './EventModal.svelte';
	import { chipTooltip } from '$lib/utils/eventChip';
	import { formatEventTime, toDate } from '$lib/utils/eventTime';
	import { invalidateAll } from '$app/navigation';

	export let currentDate: Writable<DateTime>;
	export let events: Event[];
	export let removeEvent: (id: string) => void;
	export let preferedFirstDayOfWeek: string = 'sunday';
	export let calendarIds: { id: string; name: string; color?: string }[] = [];
	export let openDay: (date: DateTime) => void = () => {};
	export let dueTasks: {
		id: string;
		title: string;
		dueDate: Date | string;
		recurrenceFrequency?: string | null;
		recurrenceInterval?: number | null;
	}[] = [];

	function getTasksForDay(day: DateTime) {
		const dateStr = formatDate(day);
		return dueTasks.filter((t) => t.dueDate && formatDate(toDate(t.dueDate)) === dateStr);
	}

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


	function getEventTop(event: Event): number {
		if (!event.start) return 0;
		const d = toDate(event.start);
		return ((d.getHours() * 60 + d.getMinutes()) / (24 * 60)) * 100;
	}

	function getEventHeight(event: Event): number {
		if (!event.start) return 5;
		const start = toDate(event.start);
		const startMin = start.getHours() * 60 + start.getMinutes();
		let endMin = startMin + 60;
		if (event.end) {
			const end = toDate(event.end);
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
		// EventModal performs the API call; refresh server data here.
		invalidateAll().then(closeModal);
	}
</script>

<div class="overflow-x-auto">
	<!-- Mobile keeps a 700px scroll floor; desktop flexes to the container
		so no side scrolling is ever needed. -->
	<div class="min-w-[700px] md:min-w-0">
	<!-- Week Header -->
	<div class="grid grid-cols-8 border-b border-slate-200 bg-slate-50 sticky top-0 z-10">
		<div class="w-14 shrink-0 border-r border-slate-200"></div>
		{#each weekDays as wd}
			<div class="flex-1 border-r border-slate-100 last:border-r-0">
				<button
					type="button"
					class="w-full py-2 text-center hover:bg-slate-100 transition-colors"
					onclick={() => openDay(wd)}
					aria-label="Open {wd.toFormat('EEEE, MMMM d')}"
				>
					<div class="text-xs font-medium uppercase text-slate-500 {isToday(wd) ? 'text-primary-600' : ''}">
						{wd.toFormat('EEE')}
					</div>
					<div class="text-lg font-semibold {isToday(wd) ? 'text-primary-600' : 'text-slate-900'}">
						{wd.day}
					</div>
				</button>
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
			{@const dayTasks = getTasksForDay(wd)}
			<div class="flex-1 min-h-[40px] border-r border-slate-100 last:border-r-0 p-0.5 space-y-0.5">
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
				{#each dayTasks as task (task.id)}
					<span
						class="flex w-full items-center gap-1 rounded border border-dashed border-slate-400 bg-slate-50 px-1 py-0.5 text-xs font-medium text-slate-600"
						title="Task due this day"
					>
						<svg class="h-3 w-3 shrink-0 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
							<path stroke-linecap="round" stroke-linejoin="round" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" />
						</svg>
						<span class="truncate">{task.title}</span>
					</span>
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
					<div class="relative pointer-events-auto transition-colors hover:bg-slate-50/60">
						{#each dayEvents as event}
							<button
								type="button"
								onclick={() => handleEventClick(event)}
								title={chipTooltip(event, calendarIds)}
								class="absolute left-0.5 right-0.5 rounded px-1 py-0.5 text-xs sm:text-sm font-medium truncate hover:opacity-90 transition-opacity cursor-pointer text-left overflow-hidden bg-white"
								style="top: {getEventTop(event)}%; height: {getEventHeight(event)}%; border-left: 3px solid {event.color || '#94a3b8'}; min-height: 18px;"
							>
								<span class="block truncate">{event.title}</span>
								<span class="block text-[10px] opacity-75 truncate">
									{formatEventTime(event.start)}{#if event.end} - {formatEventTime(event.end)}{/if}
								</span>
							</button>
						{/each}
					</div>
				{/each}
			</div>
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
