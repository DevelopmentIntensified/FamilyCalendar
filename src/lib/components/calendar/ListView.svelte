<script lang="ts">
	import { DateTime } from 'luxon';
	import type { Writable } from 'svelte/store';
	import { formatDate } from '$lib/utils/dateUtils';
	import type { Event } from '$lib/types';
	import EventModal from './EventModal.svelte';
import AttendanceBadge from './AttendanceBadge.svelte';
	import { formatEventTime } from '$lib/utils/eventTime';
	import { chipColor, rsvpVisual } from '$lib/utils/eventChip';
	import { invalidateAll } from '$app/navigation';
	import todoList from '$lib/assets/svgs/todo-list-svgrepo-com.svg';

	export let currentDate: Writable<DateTime>;
	export let events: Event[];
	export let removeEvent: (id: string) => void;
	export let calendarIds: { id: string; name: string; color?: string }[] = [];
	export let dueTasks: {
		id: string;
		title: string;
		dueDate: Date | string;
		recurrenceFrequency?: string | null;
		recurrenceInterval?: number | null;
	}[] = [];

	const FREQ_NOUN: Record<string, string> = { daily: 'day', weekly: 'week', monthly: 'month', yearly: 'year' };

	let busyTaskId: string | null = null;
	async function toggleListTask(task: { id: string }) {
		if (busyTaskId) return;
		busyTaskId = task.id;
		try {
			await fetch(`/api/tasks/${task.id}`, {
				method: 'PUT',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ toggleComplete: true })
			});
			await invalidateAll();
		} finally {
			busyTaskId = null;
		}
	}

	function toDateMs(d: unknown): number {
		if (d instanceof Date) return d.getTime();
		return DateTime.fromISO(String(d ?? '')).toMillis();
	}

	$: year = $currentDate.year;
	$: month = $currentDate.month;

	$: filteredEvents = events
		.filter((event) => {
			if (!event.date) return false;
			const eventDate = event.date instanceof Date ? DateTime.fromJSDate(event.date) : DateTime.fromISO(String(event.date));
			return eventDate.year === year && eventDate.month === month;
		})
		.sort((a, b) => {
			const toMs = (d: Event['date']): number => {
				if (!d) return 0;
				return d instanceof Date ? d.getTime() : DateTime.fromISO(String(d)).toMillis();
			};
			return toMs(a.date) - toMs(b.date);
		});

	$: monthTasks = dueTasks
		.filter((t) => t.dueDate)
		.filter((t) => {
			const d = DateTime.fromJSDate(t.dueDate instanceof Date ? t.dueDate : new Date(String(t.dueDate)));
			return d.year === year && d.month === month;
		})
		.sort((a, b) => toDateMs(a.dueDate) - toDateMs(b.dueDate));

	// Group by date (events + tasks share buckets). Keys are ISO dates so
	// headers can fromISO() them and sorting stays chronological.
	function dateKeyOf(d: Date | string): string {
		const dt = d instanceof Date ? DateTime.fromJSDate(d) : DateTime.fromISO(String(d));
		return dt.toISODate() ?? '';
	}

	$: groupedEvents = filteredEvents.reduce((acc, event) => {
		if (!event.date) return acc;
		const dateKey = dateKeyOf(event.date);
		if (!acc[dateKey]) acc[dateKey] = [];
		acc[dateKey].push(event);
		return acc;
	}, {} as Record<string, Event[]>);

	$: groupedTasks = monthTasks.reduce((acc, task) => {
		if (!task.dueDate) return acc;
		const dateKey = dateKeyOf(task.dueDate);
		if (!acc[dateKey]) acc[dateKey] = [];
		acc[dateKey].push(task);
		return acc;
	}, {} as Record<string, typeof monthTasks>);

	$: allDates = Array.from(new Set([...Object.keys(groupedEvents), ...Object.keys(groupedTasks)])).sort();

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

<div class="space-y-6">
	{#if filteredEvents.length === 0 && monthTasks.length === 0}
		<div class="flex flex-col items-center justify-center py-12 text-center">
			<img src={todoList} alt="" class="mb-4 mx-auto h-24 w-auto opacity-80" />
			<p class="max-w-xs text-lg font-medium text-slate-700">A whole month of nothing. Suspicious. Add something fun?</p>
		</div>
	{/if}

	{#each allDates as date}
		{@const dayEvents = groupedEvents[date] ?? []}
		{@const dayTasks = groupedTasks[date] ?? []}
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
					{@const rv = rsvpVisual(event.rsvpStatus)}
					<button
						type="button"
						onclick={() => handleEventClick(event)}
						class="w-full text-left"
					>
						<div class="group flex items-center gap-4 rounded-xl border border-slate-200 bg-white p-4 transition-all hover:border-slate-300 hover:shadow-md {rv?.containerClass ?? ''}">
							<!-- Color indicator -->
							<div class="shrink-0 h-12 w-1 rounded-full" style="background-color: {chipColor(event)}"></div>
							
							<div class="flex-1 min-w-0">
								<div class="flex items-center gap-2">
									<h4 class="truncate font-medium text-slate-900 group-hover:text-primary-600">{event.title}</h4>
									{#if rv}
										<span class="shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold {rv.badgeClass}">{rv.icon} {rv.label}</span>
									{/if}
									{#if event.attendance && event.attendance.invited > 1}
										<AttendanceBadge attendance={event.attendance} />
									{/if}
									{#if event.isAd}
										<span class="shrink-0 rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-700">Ad</span>
									{/if}
								</div>
								<div class="mt-1 flex flex-wrap items-center gap-x-3 text-sm text-slate-500">
									{#if calendarIds.length > 1 && calendarIds.find(c => c.id === event.calendarId)}
										<span class="flex items-center gap-1">
											<span class="h-2 w-2 rounded-full" style="background-color: {chipColor(event)}"></span>
											{calendarIds.find(c => c.id === event.calendarId)?.name}
										</span>
									{/if}
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

				{#each dayTasks as task (task.id)}
					<button
						type="button"
						onclick={() => toggleListTask(task)}
						disabled={busyTaskId === task.id}
						class="relative flex w-full items-center gap-4 rounded-xl border border-dashed border-slate-400 bg-slate-50 p-4 text-left transition-colors hover:border-slate-500 hover:bg-slate-100 disabled:opacity-60"
					>
						<span class="absolute -inset-2" aria-hidden="true"></span>
						<span class="flex h-6 w-6 shrink-0 items-center justify-center rounded-full border-2 border-slate-300"></span>
						<span class="flex min-w-0 flex-1 flex-col gap-1">
							<span class="block truncate font-medium text-slate-700">{task.title}</span>
							<span class="flex flex-wrap items-center gap-x-3 text-sm text-slate-500">
								<span class="rounded bg-slate-200 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-slate-600">Task</span>
								{#if task.recurrenceFrequency}
									<span class="text-purple-500">
										🔁 {task.recurrenceInterval && task.recurrenceInterval > 1 ? `every ${task.recurrenceInterval} ${FREQ_NOUN[task.recurrenceFrequency]}s` : `every ${FREQ_NOUN[task.recurrenceFrequency]}`}
									</span>
								{/if}
							</span>
						</span>
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
