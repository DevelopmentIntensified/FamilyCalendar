<script lang="ts">
	import { formatDate } from '$lib/utils/dateUtils';
	import { toDate } from '$lib/utils/eventTime';
	import { chipStyle, chipColor, chipTooltip, rsvpVisual } from '$lib/utils/eventChip';
	import { DateTime } from 'luxon';
	import type { Event } from '$lib/types';
	import AttendanceBadge from './AttendanceBadge.svelte';
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
	let shownTasks = $derived(Math.min(dayTasks.length, MAX_TASK_CHIPS));
	let overflow = $derived(
		dayEvents.length - Math.min(dayEvents.length, MAX_CHIPS) + dayTasks.length - shownTasks
	);
	let showOverflow = $derived(
		dayEvents.length + dayTasks.length > MAX_CHIPS + shownTasks ||
			dayEvents.length > MAX_CHIPS ||
			dayTasks.length > MAX_TASK_CHIPS
	);

	function isAdEvent(event: Event): boolean {
		return event.isAd === true;
	}
</script>

<div
	class="group relative min-h-[72px] min-w-0 overflow-hidden rounded-lg border p-0.5 transition-colors {isTodayDate
		? 'border-primary-300 bg-primary-50/40 ring-1 ring-inset ring-primary-200'
		: isOtherMonth
			? 'border-slate-100 bg-slate-50/50'
			: 'border-slate-100 hover:bg-slate-50'} sm:min-h-[104px]"
>
	<button
		type="button"
		class="absolute inset-0 z-0 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-400"
		aria-label="Open {date}"
		onclick={() => onCellTap(cellDate, dayEvents, dayTasks)}
	></button>
	<div
		class="pointer-events-none relative z-10 flex items-center justify-between pl-1.5 pr-1 pt-0.5"
	>
		<span
			class="flex h-5 w-5 items-center justify-center text-xs font-semibold {isTodayDate
				? 'rounded-full bg-primary-600 text-white'
				: isOtherMonth
					? 'text-slate-400'
					: 'text-slate-600'}"
		>
			{day}
		</span>
		<div class="flex items-center gap-0.5">
			{#if !isOtherMonth}
				<div class="hidden items-center gap-0.5 sm:flex">
					<button
						type="button"
						class="pointer-events-auto -m-1 flex h-5 w-5 items-center justify-center rounded p-1 text-slate-300 transition-colors hover:bg-slate-100 hover:text-primary-600 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-primary-400 sm:m-0 sm:p-0"
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
						class="pointer-events-auto -m-1 flex h-5 w-5 items-center justify-center rounded p-1 text-slate-300 transition-colors hover:bg-slate-100 hover:text-primary-600 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-primary-400 sm:m-0 sm:p-0 {selectionMode
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
		class="relative z-10 mt-0.5 space-y-[3px] px-0.5 pb-0.5 {smallScreen && !selectionMode
			? 'pointer-events-none'
			: ''}"
		inert={smallScreen && !selectionMode ? true : undefined}
	>
		{#each dayEvents.slice(0, MAX_CHIPS) as event (event.id)}
			{@const rv = rsvpVisual(event.rsvpStatus)}
			<button
				type="button"
				onclick={() => (selectionMode ? onToggleSelect(event) : onEventClick(event))}
				aria-pressed={selectionMode ? isSelected(event) : undefined}
				title={selectionMode
					? isSelected(event)
						? 'Deselect'
						: 'Select'
					: chipTooltip(event, calendars)}
				class="flex min-h-[26px] w-full items-center gap-1 overflow-hidden rounded-md px-1 py-[3px] text-left text-[11px] font-medium leading-tight transition-colors sm:min-h-0 {isAdEvent(
					event
				)
					? 'border border-amber-300 bg-amber-100'
					: 'bg-white hover:brightness-95 active:brightness-90'} {selectionMode && isSelected(event)
					? 'ring-2 ring-primary-400'
					: ''} {rv?.containerClass ?? ''}"
				style={chipStyle(event)}
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
					<span class="shrink-0 rounded px-0.5 text-[9px] font-bold {rv.badgeClass}">{rv.icon}</span
					>
				{/if}
				{#if !event.allDay && !isAdEvent(event)}
					<span
						class="h-1.5 w-1.5 shrink-0 rounded-full"
						style="background-color: {chipColor(event)}"
					></span>
				{/if}
				{#if isAdEvent(event)}
					<svg class="h-3 w-3 shrink-0 text-amber-600" fill="currentColor" viewBox="0 0 20 20">
						<path
							d="M3 4a1 1 0 011-1h12a1 1 0 011 1v2a1 1 0 01-1 1H4a1 1 0 01-1-1V4zM3 10a1 1 0 011-1h6a1 1 0 011 1v6a1 1 0 01-1 1H4a1 1 0 01-1-1v-6zM14 9a1 1 0 00-1 1v6a1 1 0 001 1h2a1 1 0 001-1v-6a1 1 0 00-1-1h-2z"
						/>
					</svg>
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

		{#each dayTasks.slice(0, MAX_TASK_CHIPS) as task (task.id)}
			{@const overdue = task.dueDate
				? toDate(task.dueDate).getTime() < DateTime.now().toMillis()
				: false}
			<button
				type="button"
				onclick={(ev) => {
					ev.stopPropagation();
					onTaskClick(task);
				}}
				class="relative flex w-full items-center gap-1 overflow-hidden rounded-md border border-dashed bg-slate-50 px-1 py-[3px] text-left text-[11px] font-medium leading-tight text-slate-600 transition-colors hover:bg-slate-100 active:bg-slate-200 {overdue
					? 'border-red-400 text-red-600'
					: 'border-slate-400'}"
				title="View task details"
			>
				<span class="absolute -inset-2" aria-hidden="true"></span>
				<span
					class="h-3 w-3 shrink-0 rounded-full border-2 {overdue
						? 'border-red-400'
						: 'border-slate-300'}"
				></span>
				<span class="truncate">{task.title}</span>
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
		<!-- Kept OUTSIDE the chips container above: on small screens that
			container is pointer-events-none + inert (so taps fall through to
			the cell action sheet), which would make this button untappable. -->
		<div class="relative z-10 px-0.5 pb-0.5">
			<button
				type="button"
				onclick={(e) => {
					e.stopPropagation();
					onOverflow(cellDate, dayEvents, dayTasks);
				}}
				class="pointer-events-auto inline-flex min-h-[26px] items-center rounded px-1 text-[11px] font-medium text-slate-400 transition-colors hover:text-primary-600 sm:min-h-0"
			>
				+{overflow} more
			</button>
		</div>
	{/if}
</div>
