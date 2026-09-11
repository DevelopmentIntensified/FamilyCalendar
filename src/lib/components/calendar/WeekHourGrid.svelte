<script lang="ts">
	import type { DateTime } from 'luxon';
	import type { Writable } from 'svelte/store';
	import type { Event } from '$lib/types';
	import type { RangeSelecting, RangeSelection } from '$lib/utils/rangeSelect';
	import { formatEventTime, toDate } from '$lib/utils/eventTime';
	import { formatRangeLabel, normalizeRange } from '$lib/utils/eventMove';
	import { layoutTimed } from '$lib/utils/dayViewLayout';
	import { chipTooltip, rsvpVisual } from '$lib/utils/eventChip';

	interface Props {
		weekDays: DateTime[];
		hours: number[];
		currentDate: Writable<DateTime>;
		moveError: string;
		isCurrentHour: (hour: number, day: DateTime) => boolean;
		eventsForDay: (day: DateTime) => Event[];
		selecting: RangeSelecting | null;
		rangeSel: RangeSelection | null;
		addMode: boolean;
		selectionMode: boolean;
		isSelected: (event: Event) => boolean;
		calendarIds: { id: string; name: string; color?: string }[];
		totalWeekItems: number;
		rangeTouchAction: (node: HTMLElement, day: DateTime) => { update: (day: DateTime) => void; destroy: () => void };
		onColumnDrop: (e: DragEvent, day: DateTime) => void;
		onColumnClick: (e: MouseEvent, day: DateTime) => void;
		onRangeMouseDown: (e: MouseEvent, day: DateTime) => void;
		onRangeMouseMove: (e: MouseEvent) => void;
		onRangeMouseUp: () => void;
		onStepRangeEnd: (delta: number) => void;
		onCreateRange: () => void;
		onDismissRange: () => void;
		onEventClick: (event: Event) => void;
		onDragStart: (e: DragEvent, event: Event) => void;
	}

	let {
		weekDays, hours, currentDate, moveError, isCurrentHour, eventsForDay,
		selecting, rangeSel, addMode, selectionMode, isSelected, calendarIds,
		totalWeekItems, rangeTouchAction, onColumnDrop, onColumnClick,
		onRangeMouseDown, onRangeMouseMove, onRangeMouseUp, onStepRangeEnd,
		onCreateRange, onDismissRange, onEventClick, onDragStart
	}: Props = $props();

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
</script>

<!-- Week hour grid + event overlay (#046 split out of WeekView) -->
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
				{@const dayEvents = eventsForDay(wd).filter((e) => !e.allDay)}
				{@const laidOut = layoutTimed(
					[...dayEvents].sort((a, b) => toDate(a.start).getTime() - toDate(b.start).getTime())
				)}
				<!-- svelte-ignore a11y-click-events-have-key-events -->
				<div
					class="pointer-events-auto relative transition-colors hover:bg-slate-50/60 active:bg-slate-100/60"
					data-testid="week-day-column"
					ondragover={(e) => e.preventDefault()}
					ondrop={(e) => onColumnDrop(e, wd)}
					onclick={(e) => onColumnClick(e, wd)}
					onmousedown={(e) => onRangeMouseDown(e, wd)}
					onmousemove={onRangeMouseMove}
					onmouseup={onRangeMouseUp}
					use:rangeTouchAction={wd}
					style:touch-action={addMode ? 'none' : undefined}
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
					{#each laidOut as slot (slot.event.id)}
						{@const widthPct = (1 / slot.lanes) * 100}
						{@const rv = rsvpVisual(slot.event.rsvpStatus)}
						<button
							type="button"
							onclick={() => onEventClick(slot.event)}
							draggable={!selectionMode}
							ondragstart={(e) => onDragStart(e, slot.event)}
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
