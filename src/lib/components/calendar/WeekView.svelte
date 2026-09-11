<script lang="ts">
	import { formatDate } from '$lib/utils/dateUtils';
	import { DateTime } from 'luxon';
	import type { Writable } from 'svelte/store';
	import type { Event } from '$lib/types';
	import EventModal from './EventModal.svelte';
	import AttendanceBadge from './AttendanceBadge.svelte';
	import CreatorBadge from './CreatorBadge.svelte';
	import { chipTooltip, rsvpVisual } from '$lib/utils/eventChip';
	import { formatEventTime, toDate } from '$lib/utils/eventTime';
	import { layoutTimed } from '$lib/utils/dayViewLayout';
	import { RangeSelectMachine } from '$lib/utils/rangeSelect';
	import {
		buildMovePayload,
		yToMinutes,
		normalizeRange,
		formatRangeLabel
	} from '$lib/utils/eventMove';
	import { invalidateAll } from '$app/navigation';
	import TaskDetailModal from './TaskDetailModal.svelte';
	import ExitSelectionAsk from './ExitSelectionAsk.svelte';
	import WeekHeader from './WeekHeader.svelte';
	import WeekAllDayRow from './WeekAllDayRow.svelte';
	import WeekHourGrid from './WeekHourGrid.svelte';
	import type { CalendarTask } from './TaskDetailModal.svelte';

	export let currentDate: Writable<DateTime>;
	export let events: Event[];
	export let removeEvent: (id: string) => void;
	export let preferedFirstDayOfWeek: string = 'sunday';
	export let calendarIds: { id: string; name: string; color?: string }[] = [];
	export let openDay: (date: DateTime) => void = () => {};
	export let dueTasks: CalendarTask[] = [];
	export let createAt: (start: DateTime, end?: DateTime) => void = () => {};
	export let refreshAll: () => Promise<void> = invalidateAll;
	export let selectionMode: boolean = false;
	export let addMode: boolean = false;
	export let selectedIds: string[] = [];
	export let onToggleSelectionMode: (on: boolean) => void = () => {};
	export let onToggleSelect: (event: Event) => void = () => {};
	// Legacy prop: parents still pass removeEvent; EventModal owns deletion now.
	void removeEvent;

	const PX_PER_HOUR = 60;

	const isSelected = (event: Event) => selectedIds.includes(event.id);
	let moveError = '';
	/** Inline ask to leave selection mode before a drag-move (no confirm()). */
	let confirmExitSelection = false;
	// Drag source id kept in component state: dataTransfer is unreliable
	// across browsers (and jsdom), so internal moves don't depend on it.
	let draggingId: string | null = null;

	function isStringValue(value: unknown): value is string {
		return typeof value === 'string';
	}

	function isDropPayload(value: unknown): value is { id?: string | null } {
		return typeof value === 'object' && value !== null && 'id' in value;
	}

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

	function getEventsForDay(day: DateTime): Event[] {
		const dateStr = formatDate(day);
		return events.filter((e) => {
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

	function handleColumnDrop(e: DragEvent, day: DateTime) {
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
		// SAFETY: drop handler is bound to the week-day column element
		const grid = e.currentTarget as HTMLElement | null;
		const top = grid?.getBoundingClientRect()?.top ?? 0;
		const minutes = yToMinutes(e.clientY, top, PX_PER_HOUR);
		if (!Number.isFinite(minutes)) return;
		moveEvent(target, day, minutes);
	}

	function handleColumnClick(e: MouseEvent, day: DateTime) {
		// Selection mode owns all taps; empty-grid taps must not open create.
		if (selectionMode) return;
		// A drag/long-press that just finalized must not fall through to create.
		if (rs.consumeSuppressClick()) {
			syncRange();
			return;
		}
		// Chip taps open the event; empty-grid taps start a new one.
		// SAFETY: column clicks originate from elements inside the week-day column
		if ((e.target as HTMLElement | null)?.closest?.('button')) return;
		// SAFETY: click handler is bound to the week-day column element
		const grid = e.currentTarget as HTMLElement | null;
		const top = grid?.getBoundingClientRect()?.top ?? 0;
		const minutes = yToMinutes(e.clientY, top, PX_PER_HOUR);
		if (!Number.isFinite(minutes)) return;
		moveError = '';
		createAt(day.startOf('day').plus({ minutes }));
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

	function handleRangeMouseDown(e: MouseEvent, day: DateTime) {
		if (selectionMode || e.button !== 0) return;
		// SAFETY: column mousedowns originate from elements inside the week-day column
		if ((e.target as HTMLElement | null)?.closest?.('button')) return;
		// SAFETY: mousedown handler is bound to the week-day column element
		const grid = e.currentTarget as HTMLElement | null;
		const minutes = minutesFromMouse(e, grid);
		if (!Number.isFinite(minutes)) return;
		rs.beginDrag(day, minutes);
		syncRange();
	}

	function handleRangeMouseMove(e: MouseEvent) {
		if (!rs.selecting) return;
		// SAFETY: mousemove handler is bound to the week-day column element
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
		// SAFETY: touch handler is bound to the week-day column element
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
		const onStart = (e: TouchEvent) => handleRangeTouchStart(e, currentDay, node);
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
<div class="overflow-x-auto" onmouseup={handleRangeMouseUp}>
	<!-- Phones (<640px) keep a 700px scroll floor; tablets (>=640px) flex to
		the container so no side scrolling is needed. -->
	<div class="min-w-[700px] sm:min-w-0">
		<!-- Week Header -->
		<WeekHeader {weekDays} {isToday} {openDay} />

		<WeekAllDayRow
			{weekDays}
			eventsForDay={getEventsForDay}
			tasksForDay={getTasksForDay}
			{selectionMode}
			{isSelected}
			onEventClick={handleEventClick}
			onOpenTask={openTask}
		/>
		<!-- Week Body - Scrollable -->
		<WeekHourGrid
			{weekDays}
			{hours}
			{currentDate}
			{moveError}
			{isCurrentHour}
			eventsForDay={getEventsForDay}
			{selecting}
			{rangeSel}
			{addMode}
			{selectionMode}
			{isSelected}
			{calendarIds}
			{totalWeekItems}
			rangeTouchAction={rangeTouch}
			onColumnDrop={handleColumnDrop}
			onColumnClick={handleColumnClick}
			onRangeMouseDown={handleRangeMouseDown}
			onRangeMouseMove={handleRangeMouseMove}
			onRangeMouseUp={handleRangeMouseUp}
			onStepRangeEnd={stepRangeEnd}
			onCreateRange={createRange}
			onDismissRange={() => { rangeSel = null; syncRange(); }}
			onEventClick={handleEventClick}
			onDragStart={handleDragStart}
		/>
	</div>
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
