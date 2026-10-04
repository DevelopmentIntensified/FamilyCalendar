<script lang="ts">
	import { formatDate } from '$lib/utils/dateUtils';
	import { toDate } from '$lib/utils/eventTime';
	import { chipTooltip, rsvpVisual } from '$lib/utils/eventChip';
	import { chipA11y, chipKindOf, chipSurfaceStyle, chipTreatment } from '$lib/utils/chipVocabulary';
	import { DateTime } from 'luxon';
	import type { Event } from '$lib/types';
	import AttendanceBadge from './AttendanceBadge.svelte';
	import ChipKindMark from './ChipKindMark.svelte';
	import CreatorBadge from './CreatorBadge.svelte';
	import type { CalendarTask } from './TaskDetailModal.svelte';

	interface Props {
		day: number;
		cellDate: DateTime;
		dayEvents: Event[];
		dayTasks: CalendarTask[];
		isTodayDate: boolean;
		isOtherMonth: boolean;
		smallScreen: boolean;
		selectionMode: boolean;
		calendars: { id: string; name: string; color?: string }[];
		isSelected: (event: Event) => boolean;
		onCellTap: (date: DateTime, events: Event[], tasks: CalendarTask[]) => void;
		onAdd: (date: DateTime) => void;
		onEventClick: (event: Event) => void;
		onToggleSelect: (event: Event) => void;
		onTaskClick: (task: CalendarTask) => void;
		onOverflow: (date: DateTime, events: Event[], tasks: CalendarTask[]) => void;
	}

	let {
		day,
		cellDate,
		dayEvents,
		dayTasks,
		isTodayDate,
		isOtherMonth,
		smallScreen,
		selectionMode,
		calendars,
		isSelected,
		onCellTap,
		onAdd,
		onEventClick,
		onToggleSelect,
		onTaskClick,
		onOverflow
	}: Props = $props();

	const MAX_CHIPS = 3;
	const MAX_TASK_CHIPS = 2;

	let date = $derived(formatDate(cellDate));
	// #128 gap 6: E washes a weekend day. `weekday` is 1=Mon..7=Sun, so 6 and 7
	// are Saturday and Sunday. E keeps the wash off an out-of-month day, which
	// is already muted — two muted signals on one cell is one too many.
	let isWeekend = $derived(cellDate.weekday >= 6 && !isOtherMonth);
	let shownTasks = $derived(Math.min(dayTasks.length, MAX_TASK_CHIPS));
	let overflow = $derived(
		dayEvents.length - Math.min(dayEvents.length, MAX_CHIPS) + dayTasks.length - shownTasks
	);
	let showOverflow = $derived(
		dayEvents.length + dayTasks.length > MAX_CHIPS + shownTasks ||
			dayEvents.length > MAX_CHIPS ||
			dayTasks.length > MAX_TASK_CHIPS
	);
</script>

<!-- #128 gaps 2 + 6 — E's cell, transcribed.

     gap 2, and it was MEASURED, not guessed: with a busy September in a real
     browser at 375x812 this cell rendered **182px** tall against a 72px
     minimum, the grid came to 867px and the page to 1111px. `min-h-` is a
     licence to grow, and `overflow-hidden` clips only AFTER the box has grown —
     so the minimum, not the overflow, was the whole defect. E's own note says
     "height, not min-height … a busy Tuesday is not allowed to push the bottom
     of the month off the screen", and its own comment claiming the app already
     did this was FALSE (fixed on E, #128).

     gap 6: E's chrome — 0.875rem radius (14px), --s200 (#e2e8f0 = slate-200),
     white, 8px across and 10px below, and a weekend wash. -->
<div
	data-testid="month-day-cell"
	class="group relative h-[72px] min-h-0 overflow-hidden rounded-[14px] border px-2 pb-2.5 pt-2 transition-colors md:h-[92px] lg:h-[104px] {isTodayDate
		? 'border-primary-300 bg-primary-50/40 ring-1 ring-inset ring-primary-200'
		: isOtherMonth
			? 'border-slate-100 bg-slate-50/50'
			: isWeekend
				? 'border-slate-200 bg-gradient-to-b from-[#f8f6f3] to-white hover:from-white'
				: 'border-slate-200 bg-white hover:bg-slate-50'}"
>
	<button
		type="button"
		class="absolute inset-0 z-0 rounded-[14px] focus:outline-none focus:ring-2 focus:ring-primary-400"
		aria-label="Open {date}"
		onclick={() => onCellTap(cellDate, dayEvents, dayTasks)}
	></button>
	<!-- One column that fills the fixed height: the day-number row, the chips
	     that clip, and the overflow button that must NOT clip. -->
	<div class="pointer-events-none relative z-10 flex h-full min-h-0 flex-col">
		<div class="flex shrink-0 items-center justify-between gap-1">
			<!-- #128 gap 5: E draws a 28px disc on EVERY day, and makes today a
			     fill rather than a different size. A circle that only appears on
			     one day is not a shape, it is an exception. -->
			<span
				data-testid="day-disc"
				class="flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-[13px] font-bold {isTodayDate
					? 'bg-primary-600 text-white'
					: isOtherMonth
						? 'text-slate-400'
						: 'text-slate-600'}"
			>
				{day}
			</span>
			<div class="flex items-center gap-0.5">
				{#if !isOtherMonth}
					<!-- #128 gap 4: E draws the per-cell tools at EVERY width and
					     reveals them on hover or focus. The app hid them below
					     `md`, so a 375px phone had a cell with no `+` on it at
					     all. Because the reveal is hover-gated they stay
					     unreachable by touch, so this does NOT re-open #119's
					     "one tap, two answers" at 640-767: there is no second
					     answer on a phone, only on a pointer.
					     The `pointer-events` pair is E's bug and not its look: at
					     opacity 0 an un-hovered 20px target would still be live
					     under a thumb. -->
					<div
						class="flex items-center gap-0.5 opacity-0 transition-opacity duration-150 focus-within:opacity-100 group-hover:opacity-100"
					>
						<button
							type="button"
							class="pointer-events-none flex h-5 w-5 items-center justify-center rounded p-1 text-slate-300 transition-colors hover:bg-slate-100 hover:text-primary-600 focus-visible:pointer-events-auto focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-primary-400 group-hover:pointer-events-auto sm:m-0 sm:p-0"
							aria-label="Add on {date}"
							title="Add on {date}"
							onclick={(e) => {
								e.stopPropagation();
								onAdd(cellDate);
							}}
						>
							<svg
								class="h-3 w-3"
								fill="none"
								viewBox="0 0 24 24"
								stroke="currentColor"
								stroke-width="2.5"
							>
								<path stroke-linecap="round" stroke-linejoin="round" d="M12 4v16m8-8H4" />
							</svg>
						</button>
						<a
							href="/calendar/dashboard?date={cellDate.toISODate()}"
							class="pointer-events-none flex h-5 w-5 items-center justify-center rounded p-1 text-slate-300 transition-colors hover:bg-slate-100 hover:text-primary-600 focus-visible:pointer-events-auto focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-primary-400 group-hover:pointer-events-auto sm:m-0 sm:p-0 {selectionMode
								? 'hidden'
								: ''}"
							aria-label="Day dashboard for {date}"
							title="Day dashboard"
						>
							<svg
								class="h-3 w-3"
								fill="none"
								viewBox="0 0 24 24"
								stroke="currentColor"
								stroke-width="2"
							>
								<path
									stroke-linecap="round"
									stroke-linejoin="round"
									d="M4 4h7v7H4zM13 4h7v7h-7zM4 13h7v7H4zM13 13h7v7h-7z"
								/>
							</svg>
						</a>
					</div>
				{/if}
				{#if isTodayDate}
					<span
						class="hidden whitespace-nowrap pr-0.5 text-[10px] font-medium uppercase tracking-wide text-primary-500 sm:inline"
						>today</span
					>
				{/if}
			</div>
		</div>
		<div
			data-testid="month-chips"
			class="mt-1 min-h-0 flex-1 space-y-[2px] overflow-hidden {smallScreen && !selectionMode
				? 'pointer-events-none'
				: ''}"
			inert={smallScreen && !selectionMode ? true : undefined}
		>
			{#each dayEvents.slice(0, MAX_CHIPS) as event (event.id)}
				{@const rv = rsvpVisual(event.rsvpStatus)}
				{@const kind = chipKindOf(event)}
				{@const treatment = chipTreatment(kind)}
				<!-- #067: a glyph view has no room for the word, so the name
				lands on the hover hint — the same phrase a screen reader gets
				from the mark. One source: chipA11y, never a per-view string. -->
				{@const named = chipA11y(kind, 'glyph')}
				{@const hint = named
					? `${named} · ${chipTooltip(event, calendars)}`
					: chipTooltip(event, calendars)}
				<button
					type="button"
					data-chip-kind={kind}
					onclick={() => (selectionMode ? onToggleSelect(event) : onEventClick(event))}
					aria-pressed={selectionMode ? isSelected(event) : undefined}
					title={selectionMode ? (isSelected(event) ? 'Deselect' : 'Select') : hint}
					class="flex min-h-[18px] w-full items-center gap-1 overflow-hidden rounded-md bg-white px-1 py-0 text-left text-[11px] font-medium leading-tight transition-colors hover:brightness-95 active:brightness-90 sm:min-h-0 sm:py-[3px] {treatment.containerClass} {selectionMode &&
					isSelected(event)
						? 'ring-2 ring-primary-400'
						: ''} {rv?.containerClass ?? ''}"
					style={chipSurfaceStyle(event)}
				>
					{#if selectionMode}
						<span
							class="flex h-3 w-3 shrink-0 items-center justify-center rounded-sm border {isSelected(
								event
							)
								? 'border-primary-600 bg-primary-600 text-white'
								: 'border-slate-400 bg-white'}"
							aria-hidden="true"
						>
							{#if isSelected(event)}
								<svg
									class="h-2 w-2"
									fill="none"
									viewBox="0 0 24 24"
									stroke="currentColor"
									stroke-width="4"
								>
									<path stroke-linecap="round" stroke-linejoin="round" d="M5 13l4 4L19 7" />
								</svg>
							{/if}
						</span>
					{/if}
					{#if rv && !selectionMode}
						<span class="shrink-0 rounded px-0.5 text-[9px] font-bold {rv.badgeClass}"
							>{rv.icon}</span
						>
					{/if}
					<!-- #068: the month cell is a glyph view — the computed chip
					width at 320px cannot hold the word, so the mark's shape and
					the screen-reader phrase carry the kind instead. -->
					<ChipKindMark {kind} density="glyph" />
					<span class="min-w-0 truncate">{event.title}</span>
					{#if event.creatorName}
						<CreatorBadge name={event.creatorName} />
					{/if}
					{#if event.attendance && event.attendance.invited > 1}
						<AttendanceBadge attendance={event.attendance} />
					{/if}
				</button>
			{/each}

			{#each dayTasks.slice(0, MAX_TASK_CHIPS) as task (task.id)}
				{@const overdue = task.dueDate
					? toDate(task.dueDate).getTime() < DateTime.now().toMillis()
					: false}
				{@const treatment = chipTreatment('task')}
				<button
					type="button"
					data-chip-kind="task"
					onclick={(ev) => {
						ev.stopPropagation();
						onTaskClick(task);
					}}
					class="relative flex w-full items-center gap-1 overflow-hidden rounded-md border border-dashed bg-white px-1 py-0 text-left text-[11px] font-medium leading-tight text-slate-600 transition-colors hover:bg-slate-100 active:bg-slate-200 sm:min-h-0 sm:py-[3px] {treatment.containerClass} {overdue
						? 'border-red-400 text-red-600'
						: ''}"
					title="View task details"
				>
					<span class="absolute -inset-2" aria-hidden="true"></span>
					<ChipKindMark kind="task" density="glyph" />
					<span class="min-w-0 truncate">{task.title}</span>
					{#if task.recurrenceFrequency}
						<svg
							class="ml-auto h-3 w-3 shrink-0 text-purple-400"
							fill="none"
							viewBox="0 0 24 24"
							stroke="currentColor"
							stroke-width="2"
							aria-label="Recurring"
						>
							<path
								stroke-linecap="round"
								stroke-linejoin="round"
								d="M4 4v5h5M20 20v-5h-5M4 9a8 8 0 0114-3m2 9a8 8 0 01-14 3"
							/>
						</svg>
					{/if}
				</button>
			{/each}
		</div>

		{#if showOverflow && overflow > 0}
			<!-- Kept OUTSIDE the clipping chips container above, for two reasons.
			     On small screens that container is pointer-events-none + inert
			     (so taps fall through to the cell action sheet), which would make
			     this button untappable; and #128 gap 2 makes that container clip,
			     so a `+N more` inside it would scroll out of sight. From `sm` up
			     it is the only way into a clipped day's full list, so it gets its
			     own `shrink-0` row inside the fixed height. -->
			<div class="relative z-10 mt-px shrink-0">
				<button
					type="button"
					onclick={(e) => {
						e.stopPropagation();
						onOverflow(cellDate, dayEvents, dayTasks);
					}}
					class="pointer-events-auto inline-flex h-4 items-center rounded px-0.5 text-[10px] font-medium text-slate-400 transition-colors hover:text-primary-600 sm:h-auto sm:min-h-0 sm:text-[11px]"
				>
					+{overflow} more
				</button>
			</div>
		{/if}
	</div>
</div>
