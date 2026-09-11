<script lang="ts">
	import { onMount } from 'svelte';
	import type { DateTime } from 'luxon';
	import type { Event } from '$lib/types';
	import type { LaidOutEvent } from '$lib/utils/dayViewLayout';
	import type { RangeSelecting, RangeSelection } from '$lib/utils/rangeSelect';
	import AttendanceBadge from './AttendanceBadge.svelte';
	import { formatEventTime } from '$lib/utils/eventTime';
	import { formatRangeLabel, normalizeRange } from '$lib/utils/eventMove';
	import { rsvpVisual } from '$lib/utils/eventChip';

	interface Props {
		pxPerHour: number;
		gridHeight: number;
		selectedDate: DateTime;
		isToday: boolean;
		nowPct: number;
		laidOut: LaidOutEvent<Event>[];
		selecting: RangeSelecting | null;
		rangeSel: RangeSelection | null;
		addMode: boolean;
		selectionMode: boolean;
		isSelected: (event: Event) => boolean;
		rangeTouchAction: (node: HTMLElement, day: DateTime) => { update: (day: DateTime) => void; destroy: () => void };
		onGridDrop: (e: DragEvent) => void;
		onGridClick: (e: MouseEvent) => void;
		onRangeMouseDown: (e: MouseEvent) => void;
		onRangeMouseMove: (e: MouseEvent) => void;
		onRangeMouseUp: () => void;
		onStepRangeEnd: (delta: number) => void;
		onCreateRange: () => void;
		onDismissRange: () => void;
		onEventClick: (event: Event) => void;
		onDragStart: (e: DragEvent, event: Event) => void;
	}

	let {
		pxPerHour: PX_PER_HOUR, gridHeight: GRID_HEIGHT, selectedDate, isToday, nowPct,
		laidOut, selecting, rangeSel, addMode, selectionMode, isSelected,
		rangeTouchAction, onGridDrop, onGridClick, onRangeMouseDown,
		onRangeMouseMove, onRangeMouseUp, onStepRangeEnd, onCreateRange,
		onDismissRange, onEventClick, onDragStart
	}: Props = $props();

	// Autoscroll to the current hour (moved with the grid out of DayView).
	let gridBody: HTMLElement | undefined;
	onMount(() => {
		if (!gridBody) return;
		const targetHour = isToday ? Math.max(0, new Date().getHours() - 1) : 7;
		const top = gridBody.getBoundingClientRect().top + window.scrollY + targetHour * PX_PER_HOUR;
		window.scrollTo({ top: Math.max(0, top - 72), behavior: 'auto' });
	});
</script>

<!-- Day hour grid + overlay (#046 split out of DayView) -->
<div
	class="flex w-full min-w-0 overflow-x-hidden rounded-xl border border-slate-200"
	bind:this={gridBody}
>
	<!-- Gutter -->
	<div class="w-14 shrink-0 select-none sm:w-16" aria-hidden="true">
		{#each Array.from({ length: 24 }, (_, i) => i) as h}
			<div
				class="pr-2 text-right text-[10px] font-medium text-slate-400"
				style="height: {PX_PER_HOUR}px"
			>
				<span class="inline-block -translate-y-1.5">{String(h).padStart(2, '0')}</span>
			</div>
		{/each}
	</div>

	<!-- Grid body -->
	<!-- svelte-ignore a11y-click-events-have-key-events -->
	<div
		class="relative min-w-0 flex-1 border-l border-slate-200"
		style="height: {GRID_HEIGHT}px; {addMode ? 'touch-action: none;' : ''}"
		data-testid="day-grid"
		ondragover={(e) => e.preventDefault()}
		ondrop={onGridDrop}
		onclick={onGridClick}
		onmousedown={onRangeMouseDown}
		onmousemove={onRangeMouseMove}
		onmouseup={onRangeMouseUp}
		use:rangeTouchAction={selectedDate}
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
						onclick={() => onStepRangeEnd(-15)}
						aria-label="Shorten by 15 minutes"
						class="rounded-md border border-slate-200 px-1.5 py-1 text-[11px] font-medium text-slate-600 transition-all hover:bg-slate-50 active:scale-95"
					>
						−15
					</button>
					<button
						type="button"
						onclick={() => onStepRangeEnd(15)}
						aria-label="Extend by 15 minutes"
						class="rounded-md border border-slate-200 px-1.5 py-1 text-[11px] font-medium text-slate-600 transition-all hover:bg-slate-50 active:scale-95"
					>
						+15
					</button>
					<button
						type="button"
						onclick={onCreateRange}
						aria-label="Create event for selected time"
						class="rounded-md bg-primary-600 px-2 py-1 text-[11px] font-medium text-white transition-all hover:bg-primary-700 active:scale-95"
					>
						Create
					</button>
					<button
						type="button"
						onclick={onDismissRange}
						aria-label="Dismiss time selection"
						class="rounded-md px-1.5 py-1 text-[11px] text-slate-400 hover:text-slate-600"
					>
						✕
					</button>
				</div>
			</div>
		{/if}
		{#each Array.from({ length: 24 }, (_, i) => i) as h}
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
				onclick={() => onEventClick(slot.event)}
				draggable={!selectionMode}
				ondragstart={(e) => onDragStart(e, slot.event)}
				aria-pressed={selectionMode ? isSelected(slot.event) : undefined}
				class="absolute z-10 overflow-hidden rounded-md border border-slate-200 bg-white px-1.5 py-1 text-left shadow-sm transition-all hover:brightness-95 {rv?.containerClass ??
					''} {selectionMode ? 'active:scale-[0.98]' : ''} {selectionMode &&
				isSelected(slot.event)
					? 'bg-primary-50/70 ring-2 ring-primary-400'
					: ''}"
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
							class="flex h-3.5 w-3.5 shrink-0 items-center justify-center rounded border transition-all {isSelected(
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
						>{formatEventTime(slot.event.start)}{#if slot.event.creatorName}
							· by {slot.event.creatorName}{/if}</span
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
