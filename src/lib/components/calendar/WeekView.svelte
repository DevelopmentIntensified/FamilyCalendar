<script lang="ts">
	import { formatDate } from '$lib/utils/dateUtils';
	import { DateTime } from 'luxon';
	import type { Writable } from 'svelte/store';
	import type { Event } from '$lib/types';
	import EventModal from './EventModal.svelte';
import AttendanceBadge from './AttendanceBadge.svelte';
	import { chipTooltip, rsvpVisual } from '$lib/utils/eventChip';
	import { formatEventTime, toDate } from '$lib/utils/eventTime';
	import { layoutTimed } from '$lib/utils/dayViewLayout';
	import { invalidateAll } from '$app/navigation';
	import TaskDetailModal, { type CalendarTask } from './TaskDetailModal.svelte';

	export let currentDate: Writable<DateTime>;
	export let events: Event[];
	export let removeEvent: (id: string) => void;
	export let preferedFirstDayOfWeek: string = 'sunday';
	export let calendarIds: { id: string; name: string; color?: string }[] = [];
	export let openDay: (date: DateTime) => void = () => {};
	export let dueTasks: CalendarTask[] = [];

	function getTasksForDay(day: DateTime) {
		const dateStr = formatDate(day);
		return dueTasks.filter((t) => t.dueDate && formatDate(toDate(t.dueDate)) === dateStr);
	}

	const today = DateTime.now();
	const hours = Array.from({ length: 24 }, (_, i) => i);

	let selectedTask: CalendarTask | null = null;
	function openTask(task: CalendarTask) {
		selectedTask = task;
	}

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

	let totalWeekItems = 0;
	$: totalWeekItems =
		events.length + dueTasks.length === 0
			? 0
			: weekDays.reduce(
					(total, day) => total + getEventsForDay(day).length + getTasksForDay(day).length,
					0
				);

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
	<!-- Phones (<640px) keep a 700px scroll floor; tablets (>=640px) flex to
		the container so no side scrolling is needed. -->
	<div class="min-w-[700px] sm:min-w-0">
	<!-- Week Header -->
	<div class="grid grid-cols-8 border-b border-slate-200 bg-slate-50 sticky top-0 z-10">
		<div class="w-14 shrink-0 border-r border-slate-200"></div>
		{#each weekDays as wd}
			<div class="flex-1 border-r border-slate-100 last:border-r-0">
				<button
					type="button"
					class="w-full py-2 text-center hover:bg-slate-100 active:bg-slate-200 transition-colors"
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
					{@const rv = rsvpVisual(event.rsvpStatus)}
					<button
						type="button"
						onclick={() => handleEventClick(event)}
						class="flex w-full items-center gap-1 truncate rounded px-1 py-0.5 text-left text-xs font-medium transition-opacity hover:opacity-90 active:opacity-70 cursor-pointer bg-white {rv?.containerClass ?? ''}"
						style="border-left: 3px solid {event.color || '#94a3b8'}"
					>
						{#if rv}
							<span class="mr-0.5 shrink-0 rounded px-0.5 text-[9px] font-bold {rv.badgeClass}">{rv.icon}</span>
						{/if}
						<span class="truncate">{event.title}</span>
						{#if event.attendance && event.attendance.invited > 1}
							<AttendanceBadge attendance={event.attendance} />
						{/if}
					</button>
				{/each}
				{#each dayTasks as task (task.id)}
					<button
						type="button"
						onclick={() => openTask(task)}
						title="View task details"
						class="relative flex w-full items-center gap-1 rounded border border-dashed border-slate-400 bg-slate-50 px-1 py-0.5 text-xs font-medium text-slate-600 transition-colors hover:border-slate-500 hover:bg-slate-100 active:bg-slate-200"
					>
						<span class="absolute -inset-2" aria-hidden="true"></span>
						<span class="h-3 w-3 shrink-0 rounded-full border-2 border-slate-300"></span>
						<span class="truncate">{task.title}</span>
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
					{@const laidOut = layoutTimed(
						[...dayEvents].sort((a, b) => toDate(a.start).getTime() - toDate(b.start).getTime())
					)}
					<div class="relative pointer-events-auto transition-colors hover:bg-slate-50/60 active:bg-slate-100/60">
						{#each laidOut as slot (slot.event.id)}
							{@const widthPct = (1 / slot.lanes) * 100}
							{@const rv = rsvpVisual(slot.event.rsvpStatus)}
							<button
								type="button"
								onclick={() => handleEventClick(slot.event)}
								title={chipTooltip(slot.event, calendarIds)}
								class="absolute rounded px-1 py-0.5 text-xs sm:text-sm font-medium truncate hover:opacity-90 active:opacity-70 transition-opacity cursor-pointer text-left overflow-hidden bg-white {rv?.containerClass ?? ''}"
								style="top: {getEventTop(slot.event)}%; height: {getEventHeight(slot.event)}%; left: calc({slot.lane * widthPct}% + 2px); width: calc({widthPct}% - 4px); border-left: 3px solid {slot.event.color || '#94a3b8'}; min-height: 26px;"
							>
								<span class="block truncate">
									{#if rv}
										<span class="mr-0.5 rounded px-0.5 text-[9px] font-bold {rv.badgeClass}">{rv.icon}</span>
									{/if}
									{slot.event.title}
								</span>
								<span class="block text-[10px] opacity-75 truncate">
									{formatEventTime(slot.event.start)}{#if slot.event.end} - {formatEventTime(slot.event.end)}{/if}
								</span>
							</button>
						{/each}
					</div>
				{/each}
			</div>

			{#if totalWeekItems === 0}
				<div class="pointer-events-none absolute inset-0 flex items-center justify-center">
					<p class="rounded-xl bg-white/60 px-6 py-4 text-sm text-slate-400 backdrop-blur-sm">
						Nothing this week — a blank week is full of options.
					</p>
				</div>
			{/if}
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
		onClose={closeModal}
		on:update={() => invalidateAll()}
		on:delete={handleDelete}
	/>
{/if}

<!-- Task detail popup -->
{#if selectedTask}
	<TaskDetailModal task={selectedTask} onClose={() => (selectedTask = null)} />
{/if}
