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
	import { onMount } from 'svelte';
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

	// Mobile day-action sheet: on small screens a day tap opens a bottom sheet
	// (Add event / Open Day Dashboard / View events) instead of the tiny header
	// buttons. Desktop keeps the existing tap-to-open-day behavior.
	let sheetOpen = false;
	let sheetDate: DateTime | null = null;
	let sheetEvents: Event[] = [];
	let sheetTasks: CalendarTask[] = [];

	let smallScreen = false;
	onMount(() => {
		// Aligned with BottomNav (md:hidden ⇒ shows below 768px) so landscape
		// phones/small tablets get the day action sheet instead of day-view nav.
		const mq = window.matchMedia('(max-width: 767px)');
		const apply = () => (smallScreen = mq.matches);
		apply();
		if (mq.addEventListener) {
			mq.addEventListener('change', apply);
			return () => mq.removeEventListener('change', apply);
		}
		mq.addListener(apply);
		return () => mq.removeListener(apply);
	});

	function handleCellTap(cellDate: DateTime, evts: Event[], tasks: CalendarTask[] = []) {
		if (smallScreen) {
			sheetDate = cellDate;
			sheetEvents = evts;
			sheetTasks = tasks;
			sheetOpen = true;
		} else {
			openDay(cellDate);
		}
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
		{smallScreen}
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
