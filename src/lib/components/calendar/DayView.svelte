<script lang="ts">
	import { createEventDispatcher, onMount } from 'svelte';
	import { DateTime } from 'luxon';
	import type { Writable } from 'svelte/store';
	import type { Event } from '$lib/types';
	import { formatDate } from '$lib/utils/dateUtils';
	import { formatEventTime, toDate } from '$lib/utils/eventTime';
	import EventModal from './EventModal.svelte';
	import AttendanceBadge from './AttendanceBadge.svelte';
	import { invalidateAll } from '$app/navigation';
	import { rsvpVisual } from '$lib/utils/eventChip';
	import { buildMovePayload, yToMinutes, normalizeRange, formatRangeLabel } from '$lib/utils/eventMove';
	import TaskDetailModal, { type CalendarTask } from './TaskDetailModal.svelte';

	export let currentDate: Writable<DateTime>;
	export let events: Event[] = [];
	export let calendarIds: { id: string; name: string; color?: string }[] = [];
	export let dueTasks: CalendarTask[] = [];
	export let createAt: (date: DateTime) => void = () => {};
	export let selectionMode: boolean = false;
	export let selectedIds: string[] = [];
	export let onToggleSelectionMode: (on: boolean) => void = () => {};
	export let onToggleSelect: (event: Event) => void = () => {};

	const isSelected = (event: Event) => selectedIds.includes(event.id);
	let moveError = '';
	// Drag source id kept in component state: dataTransfer is unreliable
	// across browsers (and jsdom), so internal moves don't depend on it.
	let draggingId: string | null = null;

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
	const FREQ_NOUN: Record<string, string> = {
		daily: 'day',
		weekly: 'week',
		monthly: 'month',
		yearly: 'year'
	};

	let selectedTask: CalendarTask | null = null;
	function openTask(task: CalendarTask) {
		selectedTask = task;
	}

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
		// The day view scrolls as one unit with the page (no inner scroll area).
		// Bring the target hour's row into view via the window.
		const top = gridBody.getBoundingClientRect().top + window.scrollY + targetHour * PX_PER_HOUR;
		window.scrollTo({ top: Math.max(0, top - 72), behavior: 'auto' });
	});

	let selectedEvent: Event | null = null;

	function handleEventClick(event: Event) {
		if (selectionMode) {
			onToggleSelect(event);
			return;
		}
		selectedEvent = event;
	}

	function handleDragStart(e: DragEvent, event: Event) {
		// Selection mode owns taps; dragging asks to leave it first.
		if (selectionMode) {
			e.preventDefault();
			if (typeof confirm === 'function' && confirm('Exit selection mode to move this event?')) {
				onToggleSelectionMode(false);
			}
			return;
		}
		moveError = '';
		draggingId = event.id;
		try {
			e.dataTransfer?.setData('application/json', JSON.stringify({ id: event.id }));
			e.dataTransfer?.setData('text/plain', event.id);
			if (e.dataTransfer) e.dataTransfer.effectAllowed = 'move';
		} catch {
			// Drag payloads unsupported — the drop handler uses draggingId.
		}
	}

	async function moveEvent(event: Event, day: DateTime, minutes: number) {
		if (!event.start) return;
		moveError = '';
		const payload = buildMovePayload(event, { day, minutes });
		const targetId = (event as Event & { masterId?: string }).masterId || event.id;
		try {
			const res = await fetch(`/api/events/${targetId}`, {
				method: 'PUT',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify(payload)
			});
			if (!res.ok) {
				const j = await res.json().catch(() => ({}));
				moveError = j.error || 'Could not move the event. Try again.';
				return;
			}
			await invalidateAll();
		} catch {
			moveError = 'Could not move the event. Try again.';
		}
	}

	function handleGridDrop(e: DragEvent) {
		e.preventDefault();
		const raw =
			e.dataTransfer?.getData('application/json') || e.dataTransfer?.getData('text/plain');
		let id: string | null = draggingId;
		if (!id && raw) {
			try {
				const parsed = JSON.parse(raw);
				id = typeof parsed === 'string' ? parsed : (parsed.id ?? null);
			} catch {
				id = raw;
			}
		}
		draggingId = null;
		if (!id) return;
		const target = events.find((ev) => ev.id === id);
		if (!target) return;
		const grid = e.currentTarget as HTMLElement | null;
		const top = grid?.getBoundingClientRect()?.top ?? 0;
		const minutes = yToMinutes(e.clientY, top, PX_PER_HOUR);
		if (!Number.isFinite(minutes)) return;
		moveEvent(target, selectedDate, minutes);
	}

	function handleGridClick(e: MouseEvent) {
		// Selection mode owns all taps; empty-grid taps must not open create.
		if (selectionMode) return;
		// A drag/long-press that just finalized must not fall through to create.
		if (suppressClick) {
			suppressClick = false;
			return;
		}
		// Chip taps open the event; empty-grid taps start a new one.
		if ((e.target as HTMLElement | null)?.closest?.('button')) return;
		const grid = e.currentTarget as HTMLElement | null;
		const top = grid?.getBoundingClientRect()?.top ?? 0;
		const minutes = yToMinutes(e.clientY, top, PX_PER_HOUR);
		if (!Number.isFinite(minutes)) return;
		moveError = '';
		createAt(selectedDate.startOf('day').plus({ minutes }));
	}

	// ---- Time-range select (drag on desktop, long-press on touch) ----
	interface SelectingState {
		anchorMin: number;
		curMin: number;
	}
	interface RangeSel {
		startMin: number;
		endMin: number;
	}
	let selecting: SelectingState | null = null;
	let rangeSel: RangeSel | null = null;
	let suppressClick = false;
	let longPressTimer: ReturnType<typeof setTimeout> | null = null;
	let longPressStartY = 0;
	const LONG_PRESS_MS = 450;

	function minutesFromMouse(e: MouseEvent, grid: HTMLElement | null): number {
		const top = grid?.getBoundingClientRect()?.top ?? 0;
		return yToMinutes(e.clientY, top, PX_PER_HOUR);
	}

	function handleRangeMouseDown(e: MouseEvent) {
		if (selectionMode || e.button !== 0) return;
		if ((e.target as HTMLElement | null)?.closest?.('button')) return;
		const grid = e.currentTarget as HTMLElement | null;
		const minutes = minutesFromMouse(e, grid);
		if (!Number.isFinite(minutes)) return;
		rangeSel = null;
		selecting = { anchorMin: minutes, curMin: minutes };
	}

	function handleRangeMouseMove(e: MouseEvent) {
		if (!selecting) return;
		const grid = e.currentTarget as HTMLElement | null;
		const minutes = minutesFromMouse(e, grid);
		if (!Number.isFinite(minutes)) return;
		selecting = { ...selecting, curMin: minutes };
		if (Math.abs(selecting.curMin - selecting.anchorMin) * (PX_PER_HOUR / 60) > 6) {
			suppressClick = true;
		}
	}

	function finalizeSelecting() {
		if (!selecting) return;
		const [startMin, endMin] = normalizeRange(selecting.anchorMin, selecting.curMin);
		rangeSel = { startMin, endMin };
		selecting = null;
	}

	function handleRangeMouseUp() {
		if (!selecting) return;
		// Plain taps (no real movement) fall through to single-time create.
		if (suppressClick) {
			finalizeSelecting();
		} else {
			selecting = null;
		}
	}

	function handleRangeTouchStart(e: TouchEvent, day: DateTime, grid: HTMLElement | null) {
		if (selectionMode) return;
		if ((e.target as HTMLElement | null)?.closest?.('button')) return;
		const touch = e.touches[0];
		if (!touch) return;
		const top = grid?.getBoundingClientRect()?.top ?? 0;
		longPressStartY = touch.clientY;
		const anchorMin = yToMinutes(touch.clientY, top, PX_PER_HOUR);
		if (longPressTimer) clearTimeout(longPressTimer);
		longPressTimer = setTimeout(() => {
			// Long-press selects a default one-hour block; the popover
			// steppers refine it (no gesture fighting with scroll).
			if (!Number.isFinite(anchorMin)) return;
			suppressClick = true;
			rangeSel = null;
			selecting = { anchorMin, curMin: Math.min(24 * 60, anchorMin + 60) };
			finalizeSelecting();
		}, LONG_PRESS_MS);
	}

	function handleRangeTouchMove(e: TouchEvent) {
		const touch = e.touches[0];
		if (!touch || !longPressTimer) return;
		// Finger moved before the long-press fired: it's a scroll, not a select.
		if (Math.abs(touch.clientY - longPressStartY) > 10) {
			clearTimeout(longPressTimer);
			longPressTimer = null;
		}
	}

	function handleRangeTouchEnd() {
		if (longPressTimer) {
			clearTimeout(longPressTimer);
			longPressTimer = null;
		}
	}

	// Touch listeners go through an action (direct addEventListener):
	// Svelte's delegated touch handlers are unreliable across browsers.
	function rangeTouch(node: HTMLElement, day: DateTime) {
		let currentDay = day;
		const onStart = (e: Event) => {
			handleRangeTouchStart(e as TouchEvent, currentDay, node);
		};
		const onMove = (e: Event) => handleRangeTouchMove(e as TouchEvent);
		const onEnd = () => handleRangeTouchEnd();
		node.addEventListener('touchstart', onStart);
		node.addEventListener('touchmove', onMove);
		node.addEventListener('touchend', onEnd);
		return {
			update(newDay: DateTime) {
				currentDay = newDay;
			},
			destroy() {
				node.removeEventListener('touchstart', onStart);
				node.removeEventListener('touchmove', onMove);
				node.removeEventListener('touchend', onEnd);
			}
		};
	}

	function stepRangeEnd(delta: number) {
		if (!rangeSel) return;
		rangeSel = {
			...rangeSel,
			endMin: Math.min(24 * 60, Math.max(rangeSel.startMin + 15, rangeSel.endMin + delta))
		};
	}

	function createRange() {
		if (!rangeSel) return;
		const start = selectedDate.startOf('day').plus({ minutes: rangeSel.startMin });
		const end = selectedDate.startOf('day').plus({ minutes: rangeSel.endMin });
		rangeSel = null;
		createAt(start, end);
	}

	function closeModal() {
		selectedEvent = null;
	}

	function handleDelete(event: CustomEvent) {
		// EventModal performs the API call; refresh server data here.
		invalidateAll().then(closeModal);
	}
</script>

<div class="min-w-0 overflow-x-hidden" onmouseup={handleRangeMouseUp}>
	<!-- Day Header -->
	<div class="mb-4 flex items-center gap-3 border-b border-slate-200 pb-3">
		<button
			type="button"
			onclick={() => dispatch('back')}
			class="flex h-11 w-11 items-center justify-center rounded-lg border border-slate-200 text-slate-600 transition-colors hover:bg-slate-50"
			aria-label="Back"
		>
			<svg class="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
				<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 19l-7-7 7-7" />
			</svg>
		</button>
		<h2 class="text-xl font-semibold text-slate-900 sm:text-2xl">
			{selectedDate.toFormat('EEEE, MMMM d')}
			{#if formatDate(selectedDate) === formatDate(today)}
				<span
					class="ml-2 rounded-full bg-primary-100 px-2 py-0.5 align-middle text-xs font-medium text-primary-700"
					>Today</span
				>
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
						aria-pressed={selectionMode ? isSelected(event) : undefined}
						class="w-full rounded bg-white px-3 py-2 text-left text-sm font-medium text-slate-900 hover:opacity-90 transition-all active:scale-[0.99] {rv?.containerClass ??
							''} {selectionMode && isSelected(event) ? 'ring-2 ring-primary-400 bg-primary-50/70' : ''}"
						style="border-left: 3px solid {event.color || '#94a3b8'}"
					>
						<span class="flex items-center gap-1.5">
							{#if selectionMode}
								<span
									class="flex h-4 w-4 shrink-0 items-center justify-center rounded border transition-all {isSelected(event) ? 'border-primary-600 bg-primary-600 text-white' : 'border-slate-300 bg-white'}"
									aria-hidden="true"
								>
									<svg
										class="h-2.5 w-2.5 transition-transform {isSelected(event) ? 'scale-100' : 'scale-0'}"
										fill="none"
										viewBox="0 0 24 24"
										stroke="currentColor"
										stroke-width="4"
									>
										<path stroke-linecap="round" stroke-linejoin="round" d="M5 13l4 4L19 7" />
									</svg>
								</span>
							{/if}
							{#if rv}
								<span
									class="shrink-0 rounded-full px-1.5 py-0.5 text-[10px] font-bold leading-none {rv.badgeClass}"
									>{rv.icon} {rv.label}</span
								>
							{/if}
							<span class="truncate">{event.title}</span>
							{#if event.attendance && event.attendance.invited > 1}
								<AttendanceBadge attendance={event.attendance} />
							{/if}
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
					<button
						type="button"
						onclick={() => openTask(task)}
						title="View task details"
						class="relative flex w-full items-center gap-2 rounded border border-dashed border-slate-400 bg-white px-3 py-2 text-left text-sm font-medium text-slate-700 transition-colors hover:border-slate-500 hover:bg-slate-50"
					>
						<span class="absolute -inset-2" aria-hidden="true"></span>
						<span
							class="h-4 w-4 shrink-0 rounded-full border-2 border-slate-300 transition-colors group-hover:border-slate-500"
						></span>
						<span class="truncate">{task.title}</span>
						{#if task.recurrenceFrequency}
							<span
								class="ml-auto shrink-0 text-[10px] font-semibold uppercase tracking-wide text-purple-500"
							>
								🔁 {task.recurrenceInterval && task.recurrenceInterval > 1
									? `${task.recurrenceInterval}× `
									: ''}{FREQ_NOUN[task.recurrenceFrequency] ?? task.recurrenceFrequency}
							</span>
						{/if}
					</button>
				{/each}
			</div>
		</div>
	{/if}

	{#if dayEvents.length === 0 && dayTasks.length === 0}
		<div class="flex flex-col items-center justify-center py-16 text-center">
			<svg
				class="mb-4 h-14 w-14 text-slate-300"
				fill="none"
				viewBox="0 0 24 24"
				stroke="currentColor"
			>
				<path
					stroke-linecap="round"
					stroke-linejoin="round"
					stroke-width="1.5"
					d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"
				/>
			</svg>
			<p class="max-w-xs text-lg font-medium text-slate-700">
				Nothing scheduled. A free day is a gift — or add something fun.
			</p>
		</div>
	{:else if dayEvents.length > 0}
		{#if moveError}
			<p role="alert" class="mb-2 text-xs font-medium text-red-600">{moveError}</p>
		{/if}
		<!-- Hour grid (renders full height inline; the page is the one scroller) -->
		<div
			class="flex w-full min-w-0 overflow-x-hidden rounded-xl border border-slate-200"
			bind:this={gridBody}
		>
			<!-- Gutter -->
			<div class="w-14 shrink-0 select-none sm:w-16" aria-hidden="true">
				{#each Array(24) as _, h}
					<div
						class="pr-2 text-right text-[10px] font-medium text-slate-400"
						style="height: {PX_PER_HOUR}px"
					>
						<span class="inline-block -translate-y-1.5">{String(h).padStart(2, '0')}</span>
					</div>
				{/each}
			</div>

			<!-- Grid body -->
			<div
				class="relative min-w-0 flex-1 border-l border-slate-200"
				style="height: {GRID_HEIGHT}px"
				data-testid="day-grid"
				ondragover={(e) => e.preventDefault()}
				ondrop={handleGridDrop}
				onclick={handleGridClick}
				onmousedown={handleRangeMouseDown}
				onmousemove={handleRangeMouseMove}
				onmouseup={handleRangeMouseUp}
				use:rangeTouch={selectedDate}
			>
				{#if selecting}
					{@const [selStart, selEnd] = normalizeRange(selecting.anchorMin, selecting.curMin)}
					<div
						class="pointer-events-none absolute inset-x-1 z-20 rounded bg-primary-200/50"
						style="top: {(selStart / 1440) * 100}%; height: {((selEnd - selStart) / 1440) * 100}%;"
					></div>
				{/if}
				{#if rangeSel}
					<div
						class="pointer-events-none absolute inset-x-1 z-20 rounded bg-primary-200/60"
						style="top: {(rangeSel.startMin / 1440) * 100}%; height: {((rangeSel.endMin - rangeSel.startMin) / 1440) * 100}%;"
					></div>
					<div
						class="absolute inset-x-1 z-30 rounded-xl border border-primary-200 bg-white p-2 shadow-xl"
						style="top: {(rangeSel.endMin / 1440) * 100}%;"
					>
						<div class="text-[11px] font-semibold text-slate-800">
							{formatRangeLabel(rangeSel.startMin, rangeSel.endMin)}
						</div>
						<div class="mt-1 flex items-center gap-1">
							<button
								type="button"
								onclick={() => stepRangeEnd(-15)}
								aria-label="Shorten by 15 minutes"
								class="rounded-md border border-slate-200 px-1.5 py-1 text-[11px] font-medium text-slate-600 hover:bg-slate-50 active:scale-95 transition-all"
							>
								−15
							</button>
							<button
								type="button"
								onclick={() => stepRangeEnd(15)}
								aria-label="Extend by 15 minutes"
								class="rounded-md border border-slate-200 px-1.5 py-1 text-[11px] font-medium text-slate-600 hover:bg-slate-50 active:scale-95 transition-all"
							>
								+15
							</button>
							<button
								type="button"
								onclick={createRange}
								aria-label="Create event for selected time"
								class="rounded-md bg-primary-600 px-2 py-1 text-[11px] font-medium text-white hover:bg-primary-700 active:scale-95 transition-all"
							>
								Create
							</button>
							<button
								type="button"
								onclick={() => (rangeSel = null)}
								aria-label="Dismiss time selection"
								class="rounded-md px-1.5 py-1 text-[11px] text-slate-400 hover:text-slate-600"
							>
								✕
							</button>
						</div>
					</div>
				{/if}
				{#each Array(24) as _, h}
					<div
						class="absolute inset-x-0 border-t border-slate-100 {h % 6 === 0
							? 'border-slate-200'
							: ''}"
						style="top: {h * PX_PER_HOUR}px"
					></div>
				{/each}

				{#if isToday}
					<div
						class="pointer-events-none absolute inset-x-0 z-20 flex items-center"
						style="top: {nowPct}%"
						aria-hidden="true"
					>
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
						draggable={!selectionMode}
						ondragstart={(e) => handleDragStart(e, slot.event)}
						aria-pressed={selectionMode ? isSelected(slot.event) : undefined}
						class="absolute z-10 overflow-hidden rounded-md border border-slate-200 bg-white px-1.5 py-1 text-left shadow-sm transition-all hover:brightness-95 {rv?.containerClass ??
							''} {selectionMode ? 'active:scale-[0.98]' : ''} {selectionMode && isSelected(slot.event) ? 'ring-2 ring-primary-400 bg-primary-50/70' : ''}"
						style="
							top: {slot.topPct}%;
							height: {Math.max(slot.heightPct, (26 / GRID_HEIGHT) * 100)}%;
							left: calc({slot.lane * widthPct}% + 2px);
							width: calc({widthPct}% - 4px);
							border-left: 3px solid {slot.event.color || '#94a3b8'};
						"
						title="{formatEventTime(slot.event.start)} {slot.event.title}"
					>
						<span
							class="flex items-center gap-1 truncate text-[11px] font-semibold leading-tight text-slate-800"
						>
							{#if selectionMode}
								<span
									class="flex h-3.5 w-3.5 shrink-0 items-center justify-center rounded border transition-all {isSelected(slot.event) ? 'border-primary-600 bg-primary-600 text-white' : 'border-slate-300 bg-white'}"
									aria-hidden="true"
								>
									<svg
										class="h-2.5 w-2.5 transition-transform {isSelected(slot.event) ? 'scale-100' : 'scale-0'}"
										fill="none"
										viewBox="0 0 24 24"
										stroke="currentColor"
										stroke-width="4"
									>
										<path stroke-linecap="round" stroke-linejoin="round" d="M5 13l4 4L19 7" />
									</svg>
								</span>
							{/if}
							{#if rv}
								<span
									class="mr-0.5 shrink-0 rounded px-1 text-[9px] font-bold leading-3 {rv.badgeClass}"
									>{rv.icon}</span
								>
							{/if}
							<span class="truncate">{slot.event.title}</span>
							{#if slot.event.attendance && slot.event.attendance.invited > 1}
								<AttendanceBadge attendance={slot.event.attendance} />
							{/if}
						</span>
						{#if slot.heightPct >= 4}
							<span class="block truncate text-[10px] leading-tight text-slate-400"
								>{formatEventTime(slot.event.start)}</span
							>
						{/if}
						{#if slot.heightPct >= 6 && slot.event.location}
							<span class="block truncate text-[10px] leading-tight text-slate-400"
								>{slot.event.location}</span
							>
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
		onClose={closeModal}
		on:update={() => invalidateAll()}
		on:delete={handleDelete}
	/>
{/if}

<!-- Task detail popup -->
{#if selectedTask}
	<TaskDetailModal task={selectedTask} onClose={() => (selectedTask = null)} />
{/if}
