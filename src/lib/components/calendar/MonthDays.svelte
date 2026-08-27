<script lang="ts">
	import { formatDate } from '$lib/utils/dateUtils';
	import { DateTime } from 'luxon';
	import type { Event } from '$lib/types';
	import EventModal from './EventModal.svelte';
	import DayEventsModal from './DayEventsModal.svelte';
	import { invalidateAll } from '$app/navigation';
	import { chipStyle, chipColor, chipTooltip } from '$lib/utils/eventChip';
	import { toDate } from '$lib/utils/eventTime';

	export let currentDate: DateTime;
	export let events: Event[];
	export let days: number[];
	export let nextMonth = false;
	export let lastMonth = false;
	export let calendars: { id: string; name: string; color?: string }[] = [];
	export let openDay: (date: DateTime) => void = () => {};
	export let dueTasks: {
		id: string;
		title: string;
		dueDate: Date | string;
		recurrenceFrequency?: string | null;
		recurrenceInterval?: number | null;
	}[] = [];
	export let createAt: (date: DateTime) => void = () => {};
	export let selectionMode: boolean = false;
	export let selectedIds: string[] = [];
	export let onToggleSelect: (event: Event) => void = () => {};

	const MAX_CHIPS = 3;
	const MAX_TASK_CHIPS = 2;

	function isSelected(event: Event): boolean {
		return selectedIds.includes(event.id);
	}

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

	function calendarLabel(event: Event): string {
		if (calendars.length < 2) return '';
		return calendars.find((c) => c.id === event.calendarId)?.name || '';
	}

	let selectedEvent: Event | null = null;

	function handleEventClick(event: Event) {
		selectedEvent = event;
	}

	function closeModal() {
		selectedEvent = null;
	}

	// "+N more" overflow: show a modal listing every event for the day
	// instead of navigating away. Clicking one opens the EventModal detail.
	let showOverflow = false;
	let overflowDate = '';
	let overflowEvents: Event[] = [];

	function openOverflow(cellDate: DateTime, evts: Event[]) {
		overflowDate = formatDate(cellDate);
		overflowEvents = evts;
		showOverflow = true;
	}

	function handleOverflowEventClick(evt: Event) {
		showOverflow = false;
		handleEventClick(evt);
	}

	function handleDelete(event: CustomEvent) {
		// EventModal performs the API call; refresh server data here.
		invalidateAll().then(closeModal);
	}
</script>

{#each days as day}
	{@const cellDate = currentDate.set({ day })}
	{@const date = formatDate(cellDate)}
	{@const dayEvents = events.filter((event) => event.date && formatDate(event.date) === date)}
	{@const dayTasks = dueTasks.filter((t) => t.dueDate && formatDate(toDate(t.dueDate)) === date)}
	{@const isTodayDate = date === formatDate(today)}
	{@const isOtherMonth = nextMonth || lastMonth}
	<div
		class="group relative min-h-[72px] min-w-0 rounded-lg border p-0.5 transition-colors {isTodayDate
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
			<div class="flex items-center gap-0.5">
				{#if !isOtherMonth}
					<button
						type="button"
						class="pointer-events-auto -m-1 flex h-5 w-5 items-center justify-center rounded p-1 text-slate-300 transition-colors hover:bg-slate-100 hover:text-primary-600 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-primary-400 sm:m-0 sm:p-0"
						aria-label="Add on {date}"
						title="Add on {date}"
						onclick={(e) => { e.stopPropagation(); createAt(cellDate); }}
					>
						<svg class="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2.5">
							<path stroke-linecap="round" stroke-linejoin="round" d="M12 4v16m8-8H4" />
						</svg>
					</button>
				{/if}
				{#if isTodayDate}
					<span class="pr-0.5 text-[10px] font-medium uppercase tracking-wide text-primary-500">today</span>
				{/if}
			</div>
		</div>
		<div class="relative z-10 mt-0.5 space-y-[3px] px-0.5 pb-0.5">
			{#each dayEvents.slice(0, MAX_CHIPS) as event}
				<button
					type="button"
					onclick={() => (selectionMode ? onToggleSelect(event) : handleEventClick(event))}
					aria-pressed={selectionMode ? isSelected(event) : undefined}
					title={selectionMode ? (isSelected(event) ? 'Deselect' : 'Select') : chipTooltip(event, calendars)}
					class="flex min-h-[26px] w-full items-center gap-1 overflow-hidden rounded-md px-1 py-[3px] text-left text-[11px] font-medium leading-tight transition-colors sm:min-h-0 {isAdEvent(event)
						? 'border border-amber-300 bg-amber-100'
						: 'bg-white hover:brightness-95'} {selectionMode && isSelected(event) ? 'ring-2 ring-primary-400' : ''}"
					style={chipStyle(event)}
				>
					{#if selectionMode}
						<span
							class="flex h-3 w-3 shrink-0 items-center justify-center rounded-sm border {isSelected(event)
								? 'border-primary-600 bg-primary-600 text-white'
								: 'border-slate-400 bg-white'}"
							aria-hidden="true"
						>
							{#if isSelected(event)}
								<svg class="h-2 w-2" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="4">
									<path stroke-linecap="round" stroke-linejoin="round" d="M5 13l4 4L19 7" />
								</svg>
							{/if}
						</span>
					{/if}
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

			{#each dayTasks.slice(0, MAX_TASK_CHIPS) as task (task.id)}
				{@const overdue = toDate(task.dueDate).getTime() < today.toMillis()}
				<span
					class="flex w-full items-center gap-1 overflow-hidden rounded-md border border-dashed bg-slate-50 px-1 py-[3px] text-left text-[11px] font-medium leading-tight text-slate-600 {overdue
						? 'border-red-400 text-red-600'
						: 'border-slate-400'}"
					title="Task due: {task.title}"
				>
					<svg class="h-3 w-3 shrink-0 {overdue ? 'text-red-400' : 'text-slate-400'}" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
						<path stroke-linecap="round" stroke-linejoin="round" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" />
					</svg>
					<span class="truncate">{task.title}</span>
					{#if task.recurrenceFrequency}
						<svg class="ml-auto h-3 w-3 shrink-0 text-purple-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2" aria-label="Recurring">
							<path stroke-linecap="round" stroke-linejoin="round" d="M4 4v5h5M20 20v-5h-5M4 9a8 8 0 0114-3m2 9a8 8 0 01-14 3" />
						</svg>
					{/if}
				</span>
			{/each}

			{#if dayEvents.length + dayTasks.length > MAX_CHIPS + Math.min(dayTasks.length, MAX_TASK_CHIPS) || dayEvents.length > MAX_CHIPS || dayTasks.length > MAX_TASK_CHIPS}
				{@const overflow = dayEvents.length - Math.min(dayEvents.length, MAX_CHIPS) + dayTasks.length - Math.min(dayTasks.length, MAX_TASK_CHIPS)}
				{#if overflow > 0}
					<button
						type="button"
						onclick={(e) => {
							e.stopPropagation();
							openOverflow(cellDate, dayEvents);
						}}
						class="inline-flex min-h-[26px] items-center rounded px-1 text-[11px] font-medium text-slate-400 transition-colors hover:text-primary-600 sm:min-h-0"
					>
						+{overflow} more
					</button>
				{/if}
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
		on:update={() => invalidateAll()}
		on:delete={handleDelete}
	/>
{/if}

<!-- Day overflow modal: all events for a day with more than MAX_CHIPS -->
<DayEventsModal
	show={showOverflow}
	date={overflowDate}
	events={overflowEvents}
	{calendars}
	onEventClick={handleOverflowEventClick}
/>
