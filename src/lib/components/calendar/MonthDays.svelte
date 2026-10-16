<script lang="ts">
	import { formatDate } from '$lib/utils/dateUtils';
	import { groupByDateKey } from '$lib/utils/eventDisplay';
	import { DateTime } from 'luxon';
	import type { Event } from '$lib/types';
	import EventModal from './EventModal.svelte';
	import DayEventsModal from './DayEventsModal.svelte';
	import DayActionSheet from './DayActionSheet.svelte';
	import MonthDayCell from './MonthDayCell.svelte';
	import { invalidateAll } from '$app/navigation';
	import { toDate } from '$lib/utils/eventTime';
	import TaskDetailModal, { type CalendarTask } from './TaskDetailModal.svelte';

	export let currentDate: DateTime;
	export let events: Event[];
	export let days: number[];
	export let nextMonth = false;
	export let lastMonth = false;
	export let calendars: { id: string; name: string; color?: string }[] = [];
	export let openDay: (date: DateTime) => void = () => {};
	export let dueTasks: CalendarTask[] = [];
	export let createAt: (date: DateTime) => void = () => {};
	export let selectionMode: boolean = false;
	export let selectedIds: string[] = [];
	export let onToggleSelect: (event: Event) => void = () => {};

	let selectedTask: CalendarTask | null = null;
	function openTask(task: CalendarTask) {
		selectedTask = task;
	}

	function isSelected(event: Event): boolean {
		return selectedIds.includes(event.id);
	}

	$: if (nextMonth) {
		currentDate = currentDate.plus({
			month: 1
		});
	} else if (lastMonth) {
		currentDate = currentDate.plus({
			month: -1
		});
	}

	const today = DateTime.now();

	// One-pass buckets (#041): 42 cells share two maps instead of each cell
	// scanning the full occurrence arrays on every reactive pass.
	$: eventsByDate = groupByDateKey(events, (event) => event.date && formatDate(event.date));
	$: tasksByDate = groupByDateKey(dueTasks, (t) => t.dueDate && formatDate(toDate(t.dueDate)));

	let selectedEvent: Event | null = null;

	function handleEventClick(event: Event) {
		selectedEvent = event;
	}

	function closeModal() {
		selectedEvent = null;
	}

	// "+N more" overflow: show a modal listing every event for the day
	// instead of navigating away. Clicking one opens the EventModal detail.
	let showOverflow = false;
	let overflowDate = '';
	let overflowEvents: Event[] = [];
	let overflowTasks: CalendarTask[] = [];

	function openOverflow(cellDate: DateTime, evts: Event[], tasks: CalendarTask[] = []) {
		overflowDate = formatDate(cellDate);
		overflowEvents = evts;
		overflowTasks = tasks;
		showOverflow = true;
	}

	function handleOverflowEventClick(evt: Event) {
		showOverflow = false;
		handleEventClick(evt);
	}

	function handleDelete() {
		// EventModal performs the API call; refresh server data here.
		invalidateAll().then(closeModal);
	}

	// Day-action sheet (#145): a day tap opens the sheet at EVERY width — the
	// owner's 2026-10-04 ruling. There is no breakpoint where the tap changes
	// meaning; "Open Day View" inside the sheet still reaches the day grid.
	let sheetOpen = false;
	let sheetDate: DateTime | null = null;
	let sheetEvents: Event[] = [];
	let sheetTasks: CalendarTask[] = [];

	function handleCellTap(cellDate: DateTime, evts: Event[], tasks: CalendarTask[] = []) {
		sheetDate = cellDate;
		sheetEvents = evts;
		sheetTasks = tasks;
		sheetOpen = true;
	}

	function onSheetViewEvents() {
		if (sheetDate) openOverflow(sheetDate, sheetEvents, sheetTasks);
	}
</script>

{#each days as day}
	{@const cellDate = currentDate.set({ day })}
	{@const date = formatDate(cellDate)}
	<MonthDayCell
		{day}
		{cellDate}
		dayEvents={eventsByDate.get(date) ?? []}
		dayTasks={tasksByDate.get(date) ?? []}
		isTodayDate={date === formatDate(today)}
		isOtherMonth={nextMonth || lastMonth}
		{selectionMode}
		{calendars}
		{isSelected}
		onCellTap={handleCellTap}
		onAdd={createAt}
		onEventClick={handleEventClick}
		{onToggleSelect}
		onTaskClick={openTask}
		onOverflow={openOverflow}
	/>
{/each}

<!-- Event Detail Modal -->
{#if selectedEvent}
	<EventModal
		event={selectedEvent}
		show={true}
		{calendars}
		on:close={closeModal}
		on:update={() => invalidateAll()}
		on:delete={handleDelete}
	/>
{/if}

<!-- Day overflow modal: all events for a day with more than MAX_CHIPS -->
<DayEventsModal
	show={showOverflow}
	date={overflowDate}
	events={overflowEvents}
	tasks={overflowTasks}
	{calendars}
	onEventClick={handleOverflowEventClick}
	onTaskClick={(t) => openTask(t)}
	onClose={() => (showOverflow = false)}
/>

<!-- Mobile day-action sheet -->
{#if sheetDate}
	<DayActionSheet
		date={sheetDate}
		open={sheetOpen}
		events={sheetEvents}
		onAdd={createAt}
		onViewEvents={onSheetViewEvents}
		onOpenDay={() => sheetDate && openDay(sheetDate)}
		onClose={() => (sheetOpen = false)}
		onEventClick={handleEventClick}
	/>
{/if}

<!-- Task detail popup -->
{#if selectedTask}
	<TaskDetailModal task={selectedTask} onClose={() => (selectedTask = null)} />
{/if}
