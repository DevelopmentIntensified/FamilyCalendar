<script lang="ts">
	import { createEventDispatcher } from 'svelte';
	import { DateTime } from 'luxon';
	import type { Writable } from 'svelte/store';
	import type { Event } from '$lib/types';
	import { formatDate } from '$lib/utils/dateUtils';
	import { formatEventTime, toDate } from '$lib/utils/eventTime';
	import { freqNoun } from '$lib/utils/taskDisplay';
	import { layoutTimed, nowPositionPct } from '$lib/utils/dayViewLayout';
	import { RangeSelectMachine } from '$lib/utils/rangeSelect';
	import EventModal from './EventModal.svelte';
	import AttendanceBadge from './AttendanceBadge.svelte';
	import CreatorBadge from './CreatorBadge.svelte';
	import { invalidateAll } from '$app/navigation';
	import { rsvpVisual } from '$lib/utils/eventChip';
	import {
		buildMovePayload,
		yToMinutes,
		normalizeRange,
		formatRangeLabel
	} from '$lib/utils/eventMove';
	import TaskDetailModal from './TaskDetailModal.svelte';
	import DayAllDayList from './DayAllDayList.svelte';
	import DayHourGrid from './DayHourGrid.svelte';
	import DayHeader from './DayHeader.svelte';
	import ExitSelectionAsk from './ExitSelectionAsk.svelte';
	import type { CalendarTask } from './TaskDetailModal.svelte';

	export let currentDate: Writable<DateTime>;
	export let events: Event[] = [];
	export let calendarIds: { id: string; name: string; color?: string }[] = [];
	export let dueTasks: CalendarTask[] = [];
	export let createAt: (start: DateTime, end?: DateTime) => void = () => {};
	export let refreshAll: () => Promise<void> = invalidateAll;
	export let selectionMode: boolean = false;
	export let addMode: boolean = false;
	export let selectedIds: string[] = [];
	export let onToggleSelectionMode: (on: boolean) => void = () => {};
	export let onToggleSelect: (event: Event) => void = () => {};

	const isSelected = (event: Event) => selectedIds.includes(event.id);
	let moveError = '';
	/** Inline ask to leave selection mode before a drag-move (no confirm()). */
	let confirmExitSelection = false;
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
	function isStringValue(value: unknown): value is string {
		return typeof value === 'string';
	}

	function isDropPayload(value: unknown): value is { id?: string | null } {
		return typeof value === 'object' && value !== null && 'id' in value;
	}

	let selectedTask: CalendarTask | null = null;
	function openTask(task: CalendarTask) {
		selectedTask = task;
	}

	$: laidOut = layoutTimed(timedEvents);

	$: isToday = formatDate(selectedDate) === formatDate(today);
	$: nowPct = nowPositionPct();

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
			confirmExitSelection = true;
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
		const targetId = event.masterId || event.id;
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
			await refreshAll();
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
				const parsed: unknown = JSON.parse(raw);
				id = isStringValue(parsed) ? parsed : isDropPayload(parsed) ? (parsed.id ?? null) : null;
			} catch {
				id = raw;
			}
		}
		draggingId = null;
		if (!id) return;
		const target = events.find((ev) => ev.id === id);
		if (!target) return;
		// SAFETY: drop handler is bound to the day-grid element
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
		if (rs.consumeSuppressClick()) {
			syncRange();
			return;
		}
		// Chip taps open the event; empty-grid taps start a new one.
		// SAFETY: grid clicks originate from elements inside the day-grid
		if ((e.target as HTMLElement | null)?.closest?.('button')) return;
		// SAFETY: click handler is bound to the day-grid element
		const grid = e.currentTarget as HTMLElement | null;
		const top = grid?.getBoundingClientRect()?.top ?? 0;
		const minutes = yToMinutes(e.clientY, top, PX_PER_HOUR);
		if (!Number.isFinite(minutes)) return;
		moveError = '';
		createAt(selectedDate.startOf('day').plus({ minutes }));
	}

	// ---- Time-range select (drag on desktop, long-press on touch) ----
	// State machine is shared (#046); these locals mirror it so legacy
	// assignments keep triggering updates. Always syncRange() after ops.
	const rs = new RangeSelectMachine(PX_PER_HOUR);
	let selecting = rs.selecting;
	let rangeSel = rs.rangeSel;
	let suppressClick = rs.suppressClick;
	function syncRange() {
		selecting = rs.selecting;
		rangeSel = rs.rangeSel;
		suppressClick = rs.suppressClick;
	}

	function minutesFromMouse(e: MouseEvent, grid: HTMLElement | null): number {
		const top = grid?.getBoundingClientRect()?.top ?? 0;
		return rs.minutesFromClientY(e.clientY, top);
	}

	function handleRangeMouseDown(e: MouseEvent) {
		if (selectionMode || e.button !== 0) return;
		// SAFETY: grid mousedowns originate from elements inside the day-grid
		if ((e.target as HTMLElement | null)?.closest?.('button')) return;
		// SAFETY: mousedown handler is bound to the day-grid element
		const grid = e.currentTarget as HTMLElement | null;
		const minutes = minutesFromMouse(e, grid);
		if (!Number.isFinite(minutes)) return;
		rs.beginDrag(selectedDate, minutes);
		syncRange();
	}

	function handleRangeMouseMove(e: MouseEvent) {
		if (!rs.selecting) return;
		// SAFETY: mousemove handler is bound to the day-grid element
		const grid = e.currentTarget as HTMLElement | null;
		const minutes = minutesFromMouse(e, grid);
		if (!Number.isFinite(minutes)) return;
		rs.dragTo(minutes, rs.mouseMinDelta());
		syncRange();
	}

	function finalizeSelecting() {
		rs.finalize();
		syncRange();
	}

	function handleRangeMouseUp() {
		if (!rs.selecting) return;
		// Plain taps (no real movement) fall through to single-time create.
		rs.endDrag();
		syncRange();
	}

	function handleRangeTouchStart(e: TouchEvent, day: DateTime, grid: HTMLElement | null) {
		if (selectionMode) return;
		// SAFETY: touch handler is bound to the day-grid element
		if ((e.target as HTMLElement | null)?.closest?.('button')) return;
		const touch = e.touches[0];
		if (!touch) return;
		const top = grid?.getBoundingClientRect()?.top ?? 0;
		const anchorMin = rs.minutesFromClientY(touch.clientY, top);
		rs.touchStart(day, touch.clientY, anchorMin, { selectionMode, addMode }, syncRange);
		syncRange();
	}

	function handleRangeTouchMove(e: TouchEvent, day: DateTime, grid: HTMLElement | null) {
		const touch = e.touches[0];
		if (!touch) return;
		const minutes =
			addMode && rs.selecting
				? rs.minutesFromClientY(touch.clientY, grid?.getBoundingClientRect()?.top ?? 0)
				: null;
		if (minutes !== null && !Number.isFinite(minutes)) return;
		rs.touchMove(touch.clientY, minutes, addMode);
		syncRange();
	}

	function handleRangeTouchEnd() {
		rs.touchEnd(addMode);
		syncRange();
	}

	// Touch listeners go through an action (direct addEventListener):
	// Svelte's delegated touch handlers are unreliable across browsers.
	function rangeTouch(node: HTMLElement, day: DateTime) {
		let currentDay = day;
		const onStart = (e: TouchEvent) => {
			handleRangeTouchStart(e, currentDay, node);
		};
		const onMove = (e: TouchEvent) => handleRangeTouchMove(e, currentDay, node);
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
		rs.stepEnd(delta);
		syncRange();
	}

	function createRange() {
		const ep = rs.rangeEndpoints();
		if (!ep) return;
		rs.rangeSel = null;
		syncRange();
		createAt(ep.start, ep.end);
	}

	function closeModal() {
		selectedEvent = null;
	}

	function handleDelete() {
		// EventModal performs the API call; refresh server data here.
		refreshAll().then(closeModal);
	}
</script>

<!-- svelte-ignore a11y_no_static_element_interactions -->
<div class="min-w-0 overflow-x-hidden" onmouseup={handleRangeMouseUp}>
	<DayHeader {selectedDate} {today} onBack={() => dispatch('back')} />
	<DayAllDayList
		{allDayEvents}
		{dayTasks}
		{selectionMode}
		{isSelected}
		onEventClick={handleEventClick}
		onOpenTask={openTask}
	/>
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
			<button
				type="button"
				onclick={() => createAt(selectedDate)}
				class="mt-4 rounded-lg bg-primary-600 px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-primary-700"
			>
				Add event
			</button>
		</div>
	{:else if dayEvents.length > 0}
		{#if moveError}
			<p role="alert" class="mb-2 text-xs font-medium text-red-600">{moveError}</p>
		{/if}
		<DayHourGrid
			pxPerHour={PX_PER_HOUR}
			gridHeight={GRID_HEIGHT}
			{selectedDate}
			{isToday}
			{nowPct}
			{laidOut}
			{selecting}
			{rangeSel}
			{addMode}
			{selectionMode}
			{isSelected}
			rangeTouchAction={rangeTouch}
			onGridDrop={handleGridDrop}
			onGridClick={handleGridClick}
			onRangeMouseDown={handleRangeMouseDown}
			onRangeMouseMove={handleRangeMouseMove}
			onRangeMouseUp={handleRangeMouseUp}
			onStepRangeEnd={stepRangeEnd}
			onCreateRange={createRange}
			onDismissRange={() => { rangeSel = null; syncRange(); }}
			onEventClick={handleEventClick}
			onDragStart={handleDragStart}
		/>
	{/if}
</div>

<ExitSelectionAsk
		open={confirmExitSelection}
		onExit={() => {
			confirmExitSelection = false;
			onToggleSelectionMode(false);
		}}
		onStay={() => (confirmExitSelection = false)}
	/>

<!-- Event Detail Modal -->
{#if selectedEvent}
	<EventModal
		event={selectedEvent}
		show={true}
		calendars={calendarIds}
		onClose={closeModal}
		on:update={() => refreshAll()}
		on:delete={handleDelete}
	/>
{/if}

<!-- Task detail popup -->
{#if selectedTask}
	<TaskDetailModal task={selectedTask} onClose={() => (selectedTask = null)} />
{/if}
