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
	import {
		buildMovePayload,
		yToMinutes,
		normalizeRange,
		formatRangeLabel
	} from '$lib/utils/eventMove';
	import { invalidateAll } from '$app/navigation';
	import TaskDetailModal from './TaskDetailModal.svelte';
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
		if (suppressClick) {
			suppressClick = false;
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
	interface SelectingState {
		day: DateTime;
		anchorMin: number;
		curMin: number;
	}
	interface RangeSel {
		day: DateTime;
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

	function handleRangeMouseDown(e: MouseEvent, day: DateTime) {
		if (selectionMode || e.button !== 0) return;
		// SAFETY: column mousedowns originate from elements inside the week-day column
		if ((e.target as HTMLElement | null)?.closest?.('button')) return;
		// SAFETY: mousedown handler is bound to the week-day column element
		const grid = e.currentTarget as HTMLElement | null;
		const minutes = minutesFromMouse(e, grid);
		if (!Number.isFinite(minutes)) return;
		rangeSel = null;
		selecting = { day, anchorMin: minutes, curMin: minutes };
	}

	function handleRangeMouseMove(e: MouseEvent) {
		if (!selecting) return;
		// SAFETY: mousemove handler is bound to the week-day column element
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
		rangeSel = { day: selecting.day, startMin, endMin };
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
		// SAFETY: touch handler is bound to the week-day column element
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
			selecting = { day, anchorMin, curMin: Math.min(24 * 60, anchorMin + 60) };
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
		const onStart = (e: TouchEvent) => handleRangeTouchStart(e, currentDay, node);
		const onMove = (e: TouchEvent) => handleRangeTouchMove(e);
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
		const start = rangeSel.day.startOf('day').plus({ minutes: rangeSel.startMin });
		const end = rangeSel.day.startOf('day').plus({ minutes: rangeSel.endMin });
		rangeSel = null;
		createAt(start, end);
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
		<div class="sticky top-0 z-10 grid grid-cols-8 border-b border-slate-200 bg-slate-50">
			<div class="w-14 shrink-0 border-r border-slate-200"></div>
			{#each weekDays as wd}
				<div class="flex-1 border-r border-slate-100 last:border-r-0">
					<button
						type="button"
						class="w-full py-2 text-center transition-colors hover:bg-slate-100 active:bg-slate-200"
						onclick={() => openDay(wd)}
						aria-label="Open {wd.toFormat('EEEE, MMMM d')}"
					>
						<div
							class="text-xs font-medium uppercase text-slate-500 {isToday(wd)
								? 'text-primary-600'
								: ''}"
						>
							{wd.toFormat('EEE')}
						</div>
						<div
							class="text-lg font-semibold {isToday(wd) ? 'text-primary-600' : 'text-slate-900'}"
						>
							{wd.day}
						</div>
					</button>
				</div>
			{/each}
		</div>

		<!-- All-Day Events Row -->
		<div class="grid grid-cols-8 border-b border-slate-200 bg-slate-50/50">
			<div
				class="flex w-14 shrink-0 items-center justify-end border-r border-slate-200 px-1 py-1 pr-2 text-xs text-slate-500"
			>
				All day
			</div>
			{#each weekDays as wd}
				{@const allDayEvents = getEventsForDay(wd).filter((e) => e.allDay)}
				{@const dayTasks = getTasksForDay(wd)}
				<div
					class="min-h-[40px] flex-1 space-y-0.5 border-r border-slate-100 p-0.5 last:border-r-0"
				>
					{#each allDayEvents as event}
						{@const rv = rsvpVisual(event.rsvpStatus)}
						<button
							type="button"
							onclick={() => handleEventClick(event)}
							aria-pressed={selectionMode ? isSelected(event) : undefined}
							class="flex w-full cursor-pointer items-center gap-1 truncate rounded bg-white px-1 py-0.5 text-left text-xs font-medium transition-all hover:opacity-90 active:scale-[0.99] active:opacity-70 {rv?.containerClass ??
								''} {selectionMode && isSelected(event)
								? 'bg-primary-50/70 ring-2 ring-primary-400'
								: ''}"
						>
							{#if selectionMode}
								<span
									class="flex h-3 w-3 shrink-0 items-center justify-center rounded-sm border transition-all {isSelected(
										event
									)
										? 'border-primary-600 bg-primary-600 text-white'
										: 'border-slate-400 bg-white'}"
									aria-hidden="true"
								>
									<svg
										class="h-2 w-2 transition-transform {isSelected(event)
											? 'scale-100'
											: 'scale-0'}"
										fill="none"
										viewBox="0 0 24 24"
										stroke="currentColor"
										stroke-width="4"
									>
										<path stroke-linecap="round" stroke-linejoin="round" d="M5 13l4 4L19 7" />
									</svg>
								</span>
							{/if}
							style="border-left: 3px solid {event.color || '#94a3b8'}" >
							{#if rv}
								<span class="mr-0.5 shrink-0 rounded px-0.5 text-[9px] font-bold {rv.badgeClass}"
									>{rv.icon}</span
								>
							{/if}
							<span class="truncate">{event.title}</span>
							{#if event.creatorName}
								<CreatorBadge name={event.creatorName} />
							{/if}
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
		{#if moveError}
			<p role="alert" class="px-2 py-1 text-xs font-medium text-red-600">{moveError}</p>
		{/if}
		<div class="max-h-[60vh] overflow-y-auto">
			<div class="relative" style="height: calc(24 * 60px);">
				<!-- Hour background grid -->
				{#each hours as hour}
					<div
						class="grid grid-cols-8 border-b border-slate-100 {isCurrentHour(hour, $currentDate)
							? 'bg-primary-50/30'
							: ''}"
						style="height: 60px;"
					>
						<div class="w-14 shrink-0 border-r border-slate-200 py-3 pr-2 text-right">
							<span class="text-xs font-medium text-slate-500">
								{hour === 0
									? '12 AM'
									: hour < 12
										? `${hour} AM`
										: hour === 12
											? '12 PM'
											: `${hour - 12} PM`}
							</span>
						</div>
						{#each weekDays as wd (wd.toMillis())}
							<div class="flex-1 border-r border-slate-100 last:border-r-0"></div>
						{/each}
					</div>
				{/each}

				<!-- Event overlay -->
				<div class="pointer-events-none absolute inset-0 grid grid-cols-8">
					<div class="w-14 shrink-0"></div>
					{#each weekDays as wd}
						{@const dayEvents = getEventsForDay(wd).filter((e) => !e.allDay)}
						{@const laidOut = layoutTimed(
							[...dayEvents].sort((a, b) => toDate(a.start).getTime() - toDate(b.start).getTime())
						)}
						<!-- svelte-ignore a11y-click-events-have-key-events -->
						<div
							class="pointer-events-auto relative transition-colors hover:bg-slate-50/60 active:bg-slate-100/60"
							data-testid="week-day-column"
							ondragover={(e) => e.preventDefault()}
							ondrop={(e) => handleColumnDrop(e, wd)}
							onclick={(e) => handleColumnClick(e, wd)}
							onmousedown={(e) => handleRangeMouseDown(e, wd)}
							onmousemove={handleRangeMouseMove}
							onmouseup={handleRangeMouseUp}
							use:rangeTouch={wd}
						>
							{#if selecting && selecting.day.hasSame(wd, 'day')}
								{@const [selStart, selEnd] = normalizeRange(selecting.anchorMin, selecting.curMin)}
								<div
									class="pointer-events-none absolute inset-x-1 z-20 rounded bg-primary-200/50"
									style="top: {(selStart / 1440) * 100}%; height: {((selEnd - selStart) / 1440) *
										100}%;"
								></div>
							{/if}
							{#if rangeSel && rangeSel.day.hasSame(wd, 'day')}
								<div
									class="pointer-events-none absolute inset-x-1 z-20 rounded bg-primary-200/60"
									style="top: {(rangeSel.startMin / 1440) * 100}%; height: {((rangeSel.endMin -
										rangeSel.startMin) /
										1440) *
										100}%;"
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
											class="rounded-md border border-slate-200 px-1.5 py-1 text-[11px] font-medium text-slate-600 transition-all hover:bg-slate-50 active:scale-95"
										>
											−15
										</button>
										<button
											type="button"
											onclick={() => stepRangeEnd(15)}
											aria-label="Extend by 15 minutes"
											class="rounded-md border border-slate-200 px-1.5 py-1 text-[11px] font-medium text-slate-600 transition-all hover:bg-slate-50 active:scale-95"
										>
											+15
										</button>
										<button
											type="button"
											onclick={createRange}
											aria-label="Create event for selected time"
											class="rounded-md bg-primary-600 px-2 py-1 text-[11px] font-medium text-white transition-all hover:bg-primary-700 active:scale-95"
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
							{#each laidOut as slot (slot.event.id)}
								{@const widthPct = (1 / slot.lanes) * 100}
								{@const rv = rsvpVisual(slot.event.rsvpStatus)}
								<button
									type="button"
									onclick={() => handleEventClick(slot.event)}
									draggable={!selectionMode}
									ondragstart={(e) => handleDragStart(e, slot.event)}
									aria-pressed={selectionMode ? isSelected(slot.event) : undefined}
									title={selectionMode ? undefined : chipTooltip(slot.event, calendarIds)}
									class="absolute cursor-pointer overflow-hidden truncate rounded bg-white px-1 py-0.5 text-left text-xs font-medium transition-all hover:opacity-90 active:opacity-70 sm:text-sm {rv?.containerClass ??
										''} {selectionMode ? 'active:scale-[0.98]' : ''} {selectionMode &&
									isSelected(slot.event)
										? 'bg-primary-50/70 ring-2 ring-primary-400'
										: ''}"
									style="top: {getEventTop(slot.event)}%; height: {getEventHeight(
										slot.event
									)}%; left: calc({slot.lane *
										widthPct}% + 2px); width: calc({widthPct}% - 4px); border-left: 3px solid {slot
										.event.color || '#94a3b8'}; min-height: 26px;"
								>
									<span class="block truncate">
										{#if selectionMode}
											<span
												class="mr-1 inline-flex h-3.5 w-3.5 shrink-0 items-center justify-center rounded border transition-all {isSelected(
													slot.event
												)
													? 'border-primary-600 bg-primary-600 text-white'
													: 'border-slate-300 bg-white'}"
												aria-hidden="true"
											>
												<svg
													class="h-2.5 w-2.5 transition-transform {isSelected(slot.event)
														? 'scale-100'
														: 'scale-0'}"
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
											<span class="mr-0.5 rounded px-0.5 text-[9px] font-bold {rv.badgeClass}"
												>{rv.icon}</span
											>
										{/if}
										{slot.event.title}
									</span>
									<span class="block truncate text-[10px] opacity-75">
										{formatEventTime(slot.event.start)}{#if slot.event.end}
											- {formatEventTime(slot.event.end)}{/if}{#if slot.event.creatorName}
											· by {slot.event.creatorName}{/if}
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

<!-- Inline exit-selection ask (replaces window.confirm on drag) -->
{#if confirmExitSelection}
	<div
		class="fixed bottom-14 left-1/2 z-40 w-[calc(100%-1.5rem)] max-w-3xl -translate-x-1/2 rounded-xl border border-slate-200 bg-white p-3 shadow-xl"
		role="alertdialog"
		aria-label="Exit selection mode"
	>
		<div class="flex flex-wrap items-center gap-2">
			<span class="text-xs font-medium text-slate-700">Exit selection mode to move this event?</span
			>
			<button
				type="button"
				onclick={() => {
					confirmExitSelection = false;
					onToggleSelectionMode(false);
				}}
				class="rounded-lg bg-primary-600 px-2.5 py-1.5 text-xs font-semibold text-white hover:bg-primary-700"
			>
				Exit selection
			</button>
			<button
				type="button"
				onclick={() => (confirmExitSelection = false)}
				class="rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50"
			>
				Stay
			</button>
		</div>
	</div>
{/if}

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
