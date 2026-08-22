<script lang="ts">
	import { formatDate } from '$lib/utils/dateUtils';
	import { DateTime } from 'luxon';
	import type { Event } from '$lib/types';
	import EventModal from './EventModal.svelte';
	import { invalidateAll } from '$app/navigation';
	import { chipStyle, chipColor, chipTooltip } from '$lib/utils/eventChip';

	export let currentDate: DateTime;
	export let events: Event[];
	export let days: number[];
	export let nextMonth: boolean | undefined;
	export let lastMonth: boolean | undefined;
	export let calendars: { id: string; name: string; color?: string }[] = [];
	export let openDay: (date: DateTime) => void = () => {};
	export let dueTasks: { id: string; title: string; dueDate: Date | string }[] = [];

	const MAX_CHIPS = 3;
	const MAX_TASK_CHIPS = 2;

	function normalizeDate(v: Date | string): Date {
		return v instanceof Date ? v : new Date(v);
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

	function handleDelete(event: CustomEvent) {
		// EventModal performs the API call; refresh server data here.
		invalidateAll().then(closeModal);
	}
</script>

{#each days as day}
	{@const cellDate = currentDate.set({ day })}
	{@const date = formatDate(cellDate)}
	{@const dayEvents = events.filter((event) => formatDate(event.date) === date)}
	{@const dayTasks = dueTasks.filter((t) => formatDate(normalizeDate(t.dueDate)) === date)}
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
			{#each dayEvents.slice(0, MAX_CHIPS) as event}
				<button
					type="button"
					onclick={() => handleEventClick(event)}
					title={chipTooltip(event, calendars)}
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

			{#each dayTasks.slice(0, MAX_TASK_CHIPS) as task (task.id)}
				<span
					class="flex w-full items-center gap-1 rounded-md border border-dashed border-slate-400 bg-slate-50 px-1 py-[3px] text-left text-[11px] font-medium leading-tight text-slate-600"
					title="Task due: {task.title}"
				>
					<svg class="h-3 w-3 shrink-0 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
						<path stroke-linecap="round" stroke-linejoin="round" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" />
					</svg>
					<span class="truncate">{task.title}</span>
				</span>
			{/each}

			{#if dayEvents.length + dayTasks.length > MAX_CHIPS + Math.min(dayTasks.length, MAX_TASK_CHIPS) || dayEvents.length > MAX_CHIPS || dayTasks.length > MAX_TASK_CHIPS}
				{@const overflow = dayEvents.length - Math.min(dayEvents.length, MAX_CHIPS) + dayTasks.length - Math.min(dayTasks.length, MAX_TASK_CHIPS)}
				{#if overflow > 0}
					<button
						type="button"
						onclick={() => openDay(cellDate)}
						class="rounded px-1 text-[11px] font-medium text-slate-400 transition-colors hover:text-primary-600"
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
		on:delete={handleDelete}
	/>
{/if}
