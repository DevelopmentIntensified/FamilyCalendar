<!--
	ONE hour grid for 1..7 day columns (legacy `DayHourGrid` + `WeekHourGrid`,
	which were the same grid twice). It draws the 24 hour rows, the current-hour
	wash and now line, the lane-laid Event chips, the range painter with its
	steppers, the drop target and the autoscroll.

	Layout math is `calendarPage.lanes.rules` (per-overlap-cluster lanes, #066)
	and the drag machine is `calendarPage.select.rules` — the same machine the
	day and week views legacy carried twice. The grid never reads a clock: `now`
	is the state's ticker value.

	Autoscroll follows the legacy rule: today opens near the current hour, any
	other day at 07:00 (a working day's first useful hour).
-->
<script lang="ts">
	import { onMount } from 'svelte';
	import { DateTime } from 'luxon';
	import type { CalendarPageState, CalendarPageDisplayRow } from '../calendarPage.state.svelte';
	import { formatRangeLabel, normalizeRange } from '$lib/domains/calendar/index';
	import { layoutCalendarDaySlots, nowLinePercent } from '../calendarPage.lanes.rules';
	import { RangeSelectMachine, type CalendarRangeFlags } from '../calendarPage.select.rules';
	import CalendarChip from './CalendarChip.svelte';

	interface Props {
		state: CalendarPageState;
		/** The columns: one for Day view, seven for Week view. */
		days: DateTime[];
		/** `day` lets the page scroll; `week` scrolls inside a 60vh window. */
		variant: 'day' | 'week';
	}

	let { state, days, variant }: Props = $props();

	const pxPerHour = $derived(variant === 'day' ? 56 : 60);
	const height = $derived(24 * pxPerHour);
	const machine = new RangeSelectMachine(pxPerHour);
	let selecting = $state(machine.selecting);
	let range = $state(machine.rangeSel);
	let dragging = $state<CalendarPageDisplayRow | null>(null);
	let body = $state<HTMLElement | null>(null);

	function sync() {
		selecting = machine.selecting;
		range = machine.rangeSel;
	}

	const flags = $derived<CalendarRangeFlags>({
		selectionMode: state.selectionMode,
		addMode: state.addMode
	});

	/** The rows a column draws, in the caller's order (the service sorted them). */
	function rowsOf(day: DateTime): CalendarPageDisplayRow[] {
		return state.days.get(day.toISODate() ?? '')?.rows ?? [];
	}

	const nowPct = $derived(nowLinePercent(state.now, state.zone));

	function isToday(day: DateTime): boolean {
		return (day.toISODate() ?? '') === state.todayKey;
	}

	function minutesFrom(event: MouseEvent, node: HTMLElement): number {
		return machine.minutesFromClientY(event.clientY, node.getBoundingClientRect().top);
	}

	function onColumnClick(event: MouseEvent, day: DateTime) {
		if (state.selectionMode) return;
		if (machine.consumeSuppressClick()) {
			sync();
			return;
		}
		if ((event.target as HTMLElement | null)?.closest?.('button')) return;
		state.openCreate(day.startOf('day').plus({ minutes: minutesFrom(event, event.currentTarget as HTMLElement) }));
	}

	function onMouseDown(event: MouseEvent, day: DateTime) {
		if (state.selectionMode || event.button !== 0) return;
		const node = event.currentTarget as HTMLElement;
		if ((event.target as HTMLElement | null)?.closest?.('button')) return;
		machine.beginDrag(day, minutesFrom(event, node));
		sync();
	}

	function onMouseMove(event: MouseEvent) {
		if (!machine.selecting) return;
		machine.dragTo(minutesFrom(event, event.currentTarget as HTMLElement), machine.mouseMinDelta());
		sync();
	}

	function onMouseUp() {
		if (!machine.selecting) return;
		machine.endDrag();
		sync();
	}

	function touchAction(node: HTMLElement, day: DateTime) {
		let current = day;
		const start = (event: TouchEvent) => {
			if (state.selectionMode) return;
			const touch = event.touches[0];
			if (!touch) return;
			const anchor = machine.minutesFromClientY(touch.clientY, node.getBoundingClientRect().top);
			machine.touchStart(current, touch.clientY, anchor, flags, sync);
			sync();
		};
		const move = (event: TouchEvent) => {
			const touch = event.touches[0];
			if (!touch) return;
			const minutes = state.addMode
				? machine.minutesFromClientY(touch.clientY, node.getBoundingClientRect().top)
				: null;
			machine.touchMove(touch.clientY, minutes, state.addMode);
			sync();
		};
		const end = () => {
			machine.touchEnd(state.addMode);
			sync();
		};
		node.addEventListener('touchstart', start, { passive: true });
		node.addEventListener('touchmove', move, { passive: true });
		node.addEventListener('touchend', end);
		return {
			update(next: DateTime) {
				current = next;
			},
			destroy() {
				node.removeEventListener('touchstart', start);
				node.removeEventListener('touchmove', move);
				node.removeEventListener('touchend', end);
			}
		};
	}

	function onDrop(event: DragEvent, day: DateTime) {
		event.preventDefault();
		const row = dragging;
		dragging = null;
		if (!row) return;
		const minutes = minutesFrom(event, event.currentTarget as HTMLElement);
		if (!Number.isFinite(minutes)) return;
		void state.moveEvent(row, day, minutes);
	}

	function createFromRange() {
		const endpoints = machine.rangeEndpoints();
		if (!endpoints) return;
		machine.rangeSel = null;
		sync();
		state.openCreate(endpoints.start);
	}

	function step(delta: number) {
		machine.stepEnd(delta);
		sync();
	}

	onMount(() => {
		if (variant !== 'day' || !body) return;
		const anchor = isToday(days[0] ?? state.date)
			? Math.max(0, DateTime.fromJSDate(state.now, { zone: state.zone }).hour - 1)
			: 7;
		const top =
			body.getBoundingClientRect().top + window.scrollY + anchor * pxPerHour;
		window.scrollTo({ top: Math.max(0, top - 72), behavior: 'auto' });
	});
</script>

{#if state.moveError}
	<p role="alert" class="mb-2 text-xs font-medium text-red-600">{state.moveError}</p>
{/if}

<div class={variant === 'week' ? 'max-h-[60vh] overflow-y-auto' : ''}>
	<div
		class="relative flex w-full min-w-0 overflow-x-hidden rounded-xl border border-slate-200"
		bind:this={body}
	>
		<!-- Hour labels -->
		<div class="w-14 shrink-0 select-none sm:w-16" aria-hidden="true">
			{#each Array.from({ length: 24 }, (_, hour) => hour) as hour (hour)}
				<div
					class="pr-2 text-right text-[10px] font-medium text-slate-400"
					style="height: {pxPerHour}px"
				>
					<span class="inline-block -translate-y-1.5">
						{#if variant === 'week'}
							{hour === 0
								? '12 AM'
								: hour < 12
									? `${hour} AM`
									: hour === 12
										? '12 PM'
										: `${hour - 12} PM`}
						{:else}
							{String(hour).padStart(2, '0')}
						{/if}
					</span>
				</div>
			{/each}
		</div>

		<!-- The columns -->
		<div
			class="relative min-w-0 flex-1 border-l border-slate-200 {variant === 'day' ? 'flex' : 'flex'}"
			style="height: {height}px; {state.addMode ? 'touch-action: none;' : ''}"
			data-testid={variant === 'day' ? 'day-grid' : 'week-grid'}
			role="presentation"
			onmouseup={onMouseUp}
		>
			{#each Array.from({ length: 24 }, (_, hour) => hour) as hour (hour)}
				<div
					class="pointer-events-none absolute inset-x-0 border-t border-slate-100 {hour % 6 === 0
						? 'border-slate-200'
						: ''}"
					style="top: {hour * pxPerHour}px"
				></div>
			{/each}

			{#if days.some(isToday)}
				<div
					class="pointer-events-none absolute inset-x-0 z-20 flex items-center"
					style="top: {nowPct}%"
					aria-hidden="true"
				>
					<span class="-ml-1 h-2 w-2 rounded-full bg-red-500"></span>
					<span class="h-px flex-1 bg-red-400"></span>
				</div>
			{/if}

			{#each days as day (day.toISODate() ?? day.toMillis())}
				{@const rows = rowsOf(day).filter((row) => !row.allDay)}
				{@const laidOut = layoutCalendarDaySlots(rows, state.zone)}
				<div
					class="relative min-w-0 flex-1 border-r border-slate-100 transition-colors last:border-r-0 hover:bg-slate-50/60 active:bg-slate-100/60"
					data-testid={variant === 'week' ? 'week-day-column' : undefined}
					role="presentation"
					ondragover={(event) => event.preventDefault()}
					ondrop={(event) => onDrop(event, day)}
					onclick={(event) => onColumnClick(event, day)}
					onmousedown={(event) => onMouseDown(event, day)}
					onmousemove={onMouseMove}
					onmouseup={onMouseUp}
					use:touchAction={day}
					style:touch-action={state.addMode ? 'none' : undefined}
				>
					{#if selecting && selecting.day.hasSame(day, 'day')}
						{@const [selStart, selEnd] = normalizeRange(selecting.anchorMin, selecting.curMin)}
						<div
							class="pointer-events-none absolute inset-x-1 z-20 rounded bg-primary-200/50"
							style="top: {(selStart / 1440) * 100}%; height: {((selEnd - selStart) / 1440) * 100}%;"
						></div>
					{/if}
					{#if range && range.day.hasSame(day, 'day')}
						<div
							class="pointer-events-none absolute inset-x-1 z-20 rounded bg-primary-200/60"
							style="top: {(range.startMin / 1440) * 100}%; height: {((range.endMin -
								range.startMin) /
								1440) *
								100}%;"
						></div>
						<div
							class="absolute inset-x-1 z-30 rounded-xl border border-primary-200 bg-white p-2 shadow-xl"
							style="top: {(range.endMin / 1440) * 100}%;"
						>
							<div class="text-[11px] font-semibold text-slate-800">
								{formatRangeLabel(range.startMin, range.endMin)}
							</div>
							<div class="mt-1 flex items-center gap-1">
								<button
									type="button"
									onclick={() => step(-15)}
									aria-label="Shorten by 15 minutes"
									class="min-h-11 rounded-md border border-slate-200 px-2.5 text-[11px] font-medium text-slate-600 transition-all hover:bg-slate-50 active:scale-95"
								>
									−15
								</button>
								<button
									type="button"
									onclick={() => step(15)}
									aria-label="Extend by 15 minutes"
									class="min-h-11 rounded-md border border-slate-200 px-2.5 text-[11px] font-medium text-slate-600 transition-all hover:bg-slate-50 active:scale-95"
								>
									+15
								</button>
								<button
									type="button"
									onclick={createFromRange}
									aria-label="Create event for selected time"
									class="min-h-11 rounded-md bg-primary-600 px-2.5 text-[11px] font-medium text-white transition-all hover:bg-primary-700 active:scale-95"
								>
									Create
								</button>
								<button
									type="button"
									onclick={() => {
										machine.rangeSel = null;
										sync();
									}}
									aria-label="Dismiss time selection"
									class="flex min-h-11 min-w-11 items-center justify-center rounded-md text-[11px] text-slate-400 hover:text-slate-600"
								>
									✕
								</button>
							</div>
						</div>
					{/if}

					{#each laidOut as slot (slot.row.id)}
						{@const widthPct = (1 / slot.lanes) * 100}
						<CalendarChip
							row={slot.row}
							calendars={state.shell.calendars}
							density={variant === 'day' ? 'word' : 'glyph'}
							selectionMode={state.selectionMode}
							selected={state.selectedSet.has(slot.row.id)}
							onopen={(row) => state.openEdit(row.id)}
							onselect={(row) => state.toggleSelect(row.id)}
							ondragstart={(_event, row) => (dragging = row)}
							class="absolute z-10 overflow-hidden border border-slate-200 px-1.5 py-1 shadow-sm"
							style="top: {slot.topPct}%; height: {Math.max(slot.heightPct, (26 / height) * 100)}%; left: calc({slot.lane *
								widthPct}% + 2px); width: calc({widthPct}% - 4px);"
						/>
					{/each}
				</div>
			{/each}
		</div>
	</div>
</div>
