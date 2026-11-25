<!--
	One Event chip, for every view (#068/#111). The recipe is calendar's
	`describeEventChip` (shape = kind, colour = the row's own calendar), resolved
	once by the caller through `calendarChipRowOf`; this component only lays the
	mark, the title and its badges out at the density it is asked for.

	`density` is the view's claim about its own room: `glyph` (a month cell, the
	week band) draws the mark and hides the word, `word` (list, sheet, day band)
	spells the kind out. A chip is a button when the view can act on it, and
	Selection mode turns it into a checkbox that never opens anything.
-->
<script lang="ts">
	import CalendarAttendance from './CalendarAttendance.svelte';
	import CalendarCreator from './CalendarCreator.svelte';
	import CalendarMark from './CalendarMark.svelte';
	import type { CalendarPageCalendar } from '../calendarPage.contract';
	import { calendarChipRowOf } from '../calendarPage.grid.rules';
	import type { CalendarPageDisplayRow } from '../calendarPage.state.svelte';

	interface Props {
		row: CalendarPageDisplayRow;
		calendars: readonly CalendarPageCalendar[];
		density?: 'glyph' | 'word';
		selectionMode?: boolean;
		selected?: boolean;
		onopen?: (row: CalendarPageDisplayRow) => void;
		onselect?: (row: CalendarPageDisplayRow) => void;
		ondragstart?: (event: DragEvent, row: CalendarPageDisplayRow) => void;
		/** Extra positioning classes from the view (hour grids place absolutely). */
		class?: string;
		style?: string;
	}

	let {
		row,
		calendars,
		density = 'glyph',
		selectionMode = false,
		selected = false,
		onopen,
		onselect,
		ondragstart,
		class: extraClass = '',
		style: extraStyle = ''
	}: Props = $props();

	const chip = $derived(
		calendarChipRowOf(
			{
				title: row.title,
				calendarId: row.calendarId,
				allDay: row.allDay,
				isAd: row.isAd,
				rsvpStatus: row.rsvpStatus
			},
			calendars,
			density
		)
	);

	function activate() {
		if (selectionMode) onselect?.(row);
		else onopen?.(row);
	}
</script>

<button
	type="button"
	data-chip-kind={chip.shell.kind}
	onclick={activate}
	draggable={selectionMode ? false : undefined}
	ondragstart={selectionMode ? undefined : (event) => ondragstart?.(event, row)}
	aria-pressed={selectionMode ? selected : undefined}
	title={selectionMode ? (selected ? 'Deselect' : 'Select') : (row.title ?? '')}
	aria-label={selectionMode ? undefined : chip.shell.tooltip || row.title || ''}
	class="flex min-w-0 items-center gap-1 overflow-hidden rounded-md bg-white px-1 py-0.5 text-left text-[11px] font-medium leading-tight transition-colors hover:brightness-95 active:brightness-90 {extraClass} {chip
		.shell.containerClass} {chip.rsvp?.containerClass ?? ''} {selectionMode && selected
		? 'ring-2 ring-primary-400'
		: ''}"
	style="{chip.shell.style} {extraStyle}"
>
	{#if selectionMode}
		<span
			class="flex h-3 w-3 shrink-0 items-center justify-center rounded-sm border {selected
				? 'border-primary-600 bg-primary-600 text-white'
				: 'border-slate-400 bg-white'}"
			aria-hidden="true"
		>
			{#if selected}
				<svg class="h-2 w-2" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="4">
					<path stroke-linecap="round" stroke-linejoin="round" d="M5 13l4 4L19 7" />
				</svg>
			{/if}
		</span>
	{/if}
	{#if chip.rsvp && !selectionMode}
		<span class="shrink-0 rounded px-0.5 text-[9px] font-bold {chip.rsvp.badgeClass}"
			>{chip.rsvp.icon}</span
		>
	{/if}
	<CalendarMark kind={chip.shell.kind} density={chip.shell.markDensity} />
	<span class="min-w-0 truncate">{row.title}</span>
	{#if row.creatorName && density === 'word'}
		<CalendarCreator name={row.creatorName} />
	{/if}
	{#if row.attendance && row.attendance.invited > 1}
		<CalendarAttendance attendance={row.attendance} variant={density === 'word' ? 'row' : 'chip'} />
	{/if}
</button>
