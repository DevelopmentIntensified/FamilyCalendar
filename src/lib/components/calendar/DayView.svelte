<script lang="ts">
	import { createEventDispatcher, onMount } from 'svelte';
	import { DateTime } from 'luxon';
	import type { Writable } from 'svelte/store';
	import type { Event } from '$lib/types';
	import { formatDate } from '$lib/utils/dateUtils';
	import { formatEventTime, toDate } from '$lib/utils/eventTime';
	import EventModal from './EventModal.svelte';
	import { invalidateAll } from '$app/navigation';
	import { rsvpVisual } from '$lib/utils/eventChip';

	export let currentDate: Writable<DateTime>;
	export let events: Event[] = [];
	export let calendarIds: { id: string; name: string; color?: string }[] = [];
	export let dueTasks: {
		id: string;
		title: string;
		dueDate: Date | string;
		recurrenceFrequency?: string | null;
		recurrenceInterval?: number | null;
	}[] = [];

	const dispatch = createEventDispatcher<{ back: void }>();

	const today = DateTime.now();
	const PX_PER_HOUR = 56;
	const GRID_HEIGHT = 24 * PX_PER_HOUR;

	$: selectedDate = $currentDate;

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
	$: dayTasks = dueTasks.filter(
		(t) => t.dueDate && formatDate(toDate(t.dueDate)) === formatDate(selectedDate)
	);
	const FREQ_NOUN: Record<string, string> = { daily: 'day', weekly: 'week', monthly: 'month', yearly: 'year' };

	interface LaidOutEvent {
		event: Event;
		lane: number;
		lanes: number;
		topPct: number;
		heightPct: number;
	}

	function layoutTimed(list: Event[]): LaidOutEvent[] {
		const laneEnds: number[] = [];
		const out: Omit<LaidOutEvent, 'lanes'>[] = [];
		for (const event of list) {
			const s = toDate(event.start);
			const startMin = s.getHours() * 60 + s.getMinutes();
			let endMin = startMin + 60;
			if (event.end) {
				const e2 = toDate(event.end);
				endMin = Math.max(endMin, e2.getHours() * 60 + e2.getMinutes());
			}
			let lane = laneEnds.findIndex((t) => startMin >= t);
			if (lane === -1) lane = laneEnds.length;
			laneEnds[lane] = endMin;
			out.push({
				event,
				lane,
				topPct: (startMin / 1440) * 100,
				heightPct: (Math.min(endMin - startMin, 1440 - startMin) / 1440) * 100
			});
		}
		const lanes = Math.max(laneEnds.length, 1);
		return out.map((o) => ({ ...o, lanes }));
	}

	$: laidOut = layoutTimed(timedEvents);

	$: isToday = formatDate(selectedDate) === formatDate(today);
	$: nowPct = ((new Date().getHours() * 60 + new Date().getMinutes()) / 1440) * 100;

	let gridBody: HTMLElement | undefined;
	onMount(() => {
		if (!gridBody) return;
		const targetHour = isToday ? Math.max(0, new Date().getHours() - 1) : 7;
		gridBody.scrollTop = targetHour * PX_PER_HOUR;
	});

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

	{#if allDayEvents.length > 0}
		<div class="mb-3 rounded-xl bg-slate-50 p-3">
			<h3 class="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">All day</h3>
			<div class="space-y-1.5">
				{#each allDayEvents as event}
					{@const rv = rsvpVisual(event.rsvpStatus)}
					<button
						type="button"
						onclick={() => handleEventClick(event)}
						class="w-full rounded bg-white px-3 py-2 text-left text-sm font-medium text-slate-900 hover:opacity-90 {rv?.containerClass ?? ''}"
						style="border-left: 3px solid {event.color || '#94a3b8'}"
					>
						<span class="flex items-center gap-1.5">
							{#if rv}
								<span class="shrink-0 rounded-full px-1.5 py-0.5 text-[10px] font-bold leading-none {rv.badgeClass}">{rv.icon} {rv.label}</span>
							{/if}
							<span class="truncate">{event.title}</span>
						</span>
					</button>
				{/each}
			</div>
		</div>
	{/if}

	{#if dayTasks.length > 0}
		<div class="mb-3 rounded-xl border border-dashed border-slate-300 bg-slate-50 p-3">
			<h3 class="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">Tasks</h3>
			<div class="space-y-1.5">
				{#each dayTasks as task (task.id)}
					<div
						class="flex w-full items-center gap-2 rounded border border-dashed border-slate-400 bg-white px-3 py-2 text-sm font-medium text-slate-700"
					>
						<svg class="h-4 w-4 shrink-0 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
							<path stroke-linecap="round" stroke-linejoin="round" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" />
						</svg>
						<span class="truncate">{task.title}</span>
						{#if task.recurrenceFrequency}
							<span class="ml-auto shrink-0 text-[10px] font-semibold uppercase tracking-wide text-purple-500">
								🔁 {task.recurrenceInterval && task.recurrenceInterval > 1 ? `${task.recurrenceInterval}× ` : ''}{FREQ_NOUN[task.recurrenceFrequency] ?? task.recurrenceFrequency}
							</span>
						{/if}
					</div>
				{/each}
			</div>
		</div>
	{/if}

	{#if dayEvents.length === 0 && dayTasks.length === 0}
		<div class="flex flex-col items-center justify-center py-16 text-center">
			<svg class="mb-4 h-14 w-14 text-slate-300" fill="none" viewBox="0 0 24 24" stroke="currentColor">
				<path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
			</svg>
			<p class="max-w-xs text-lg font-medium text-slate-700">Nothing scheduled. A free day is a gift — or add something fun.</p>
		</div>
	{:else if dayEvents.length > 0}
		<!-- Hour grid -->
		<div class="flex max-h-[65vh] overflow-y-auto rounded-xl border border-slate-200" bind:this={gridBody}>
			<!-- Gutter -->
			<div class="w-14 shrink-0 select-none sm:w-16" aria-hidden="true">
				{#each Array(24) as _, h}
					<div class="pr-2 text-right text-[10px] font-medium text-slate-400" style="height: {PX_PER_HOUR}px">
						<span class="-translate-y-1.5 inline-block">{String(h).padStart(2, '0')}</span>
					</div>
				{/each}
			</div>

			<!-- Grid body -->
			<div class="relative flex-1 border-l border-slate-200" style="height: {GRID_HEIGHT}px">
				{#each Array(24) as _, h}
					<div class="absolute inset-x-0 border-t border-slate-100 {h % 6 === 0 ? 'border-slate-200' : ''}" style="top: {h * PX_PER_HOUR}px"></div>
				{/each}

				{#if isToday}
					<div class="pointer-events-none absolute inset-x-0 z-20 flex items-center" style="top: {nowPct}%" aria-hidden="true">
						<span class="-ml-1 h-2 w-2 rounded-full bg-red-500"></span>
						<span class="h-px flex-1 bg-red-400"></span>
					</div>
				{/if}

				{#each laidOut as slot (slot.event.id)}
					{@const widthPct = (1 / slot.lanes) * 100}
					{@const rv = rsvpVisual(slot.event.rsvpStatus)}
					<button
						type="button"
						onclick={() => handleEventClick(slot.event)}
						class="absolute z-10 overflow-hidden rounded-md border border-slate-200 bg-white px-1.5 py-1 text-left shadow-sm transition-colors hover:brightness-95 {rv?.containerClass ?? ''}"
						style="
							top: {slot.topPct}%;
							height: {Math.max(slot.heightPct, (26 / GRID_HEIGHT) * 100)}%;
							left: calc({slot.lane * widthPct}% + 2px);
							width: calc({widthPct}% - 4px);
							border-left: 3px solid {slot.event.color || '#94a3b8'};
						"
						title="{formatEventTime(slot.event.start)} {slot.event.title}"
					>
						<span class="block truncate text-[11px] font-semibold leading-tight text-slate-800">
							{#if rv}
								<span class="mr-0.5 rounded px-1 text-[9px] font-bold leading-3 {rv.badgeClass}">{rv.icon}</span>
							{/if}
							{slot.event.title}
						</span>
						{#if slot.heightPct >= 4}
							<span class="block truncate text-[10px] leading-tight text-slate-400">{formatEventTime(slot.event.start)}</span>
						{/if}
						{#if slot.heightPct >= 6 && slot.event.location}
							<span class="block truncate text-[10px] leading-tight text-slate-400">{slot.event.location}</span>
						{/if}
					</button>
				{/each}
			</div>
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
		on:update={() => invalidateAll()}
		on:delete={handleDelete}
	/>
{/if}
