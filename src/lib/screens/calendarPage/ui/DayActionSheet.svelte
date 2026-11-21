<!--
	The narrow-width day sheet (legacy `DayActionSheet`): the day heading, its
	Events with times and RSVP, then the four actions — Add event, Open Day
	Dashboard (`?date=`), View this day's events, Open Day View. A swipe down
	past 100px dismisses; kernel `Sheet` owns that gesture and the focus trap.
-->
<script lang="ts">
	import type { DateTime } from 'luxon';
	import { formatClockTime } from '$lib/kernel/time/dates';
	import Sheet from '$lib/kernel/ui/Sheet.svelte';
	import type { CalendarPageState } from '../calendarPage.state.svelte';
	import CalendarChip from './CalendarChip.svelte';

	interface Props {
		state: CalendarPageState;
		open: boolean;
		day: DateTime;
		onclose: () => void;
		onviewevents: () => void;
	}

	let { state, open, day, onclose, onviewevents }: Props = $props();

	const bucket = $derived(state.days.get(day.toISODate() ?? '') ?? { rows: [], tasks: [] });

	const actionClass =
		'flex w-full items-center gap-3 rounded-xl border border-slate-200 bg-white px-4 py-3.5 text-left text-sm font-medium text-slate-700 transition-colors hover:bg-slate-50';
</script>

<Sheet
	{open}
	{onclose}
	title="Day actions"
	variant="bottom"
	testid="day-action-sheet"
	closeLabel="Close"
>
	<h2 class="mb-3 text-lg font-bold text-slate-900">{day.toFormat('EEEE, MMMM d')}</h2>
	{#if bucket.rows.length > 0}
		<div
			class="mb-3 max-h-[30dvh] divide-y divide-slate-100 overflow-y-auto overscroll-contain rounded-xl border border-slate-100"
		>
			{#each bucket.rows as row (row.id)}
				<button
					type="button"
					onclick={() => {
						onclose();
						state.openEdit(row.id);
					}}
					class="flex w-full items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-slate-50 active:bg-slate-100"
				>
					<div class="min-w-0 flex-1">
						<CalendarChip
							{row}
							calendars={state.shell.calendars}
							density="word"
							onopen={(target) => state.openEdit(target.id)}
							class="w-full px-1 py-0.5 text-sm"
						/>
						{#if !row.allDay && row.start}
							<span class="text-xs text-slate-500">{formatClockTime(row.start, state.zone)}</span>
							{#if row.creatorName}
								<span class="text-xs text-slate-500"> · by {row.creatorName}</span>
							{/if}
						{/if}
					</div>
					<svg
						class="h-4 w-4 shrink-0 text-slate-300"
						fill="none"
						viewBox="0 0 24 24"
						stroke="currentColor"
						stroke-width="2"
					>
						<path stroke-linecap="round" stroke-linejoin="round" d="M9 5l7 7-7 7" />
					</svg>
				</button>
			{/each}
		</div>
	{/if}

	<div class="space-y-2">
		<button
			type="button"
			onclick={() => {
				onclose();
				state.openCreate(day);
			}}
			class={actionClass}
		>
			<span
				class="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary-100 text-primary-700"
			>
				<svg class="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
					<path stroke-linecap="round" stroke-linejoin="round" d="M12 4v16m8-8H4" />
				</svg>
			</span>
			Add event
		</button>

		<a href="/calendar/dashboard?date={day.toISODate()}" class={actionClass}>
			<span
				class="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-slate-100 text-slate-600"
			>
				<svg class="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.5">
					<path
						stroke-linecap="round"
						stroke-linejoin="round"
						d="M4 4h7v7H4zM13 4h7v7h-7zM4 13h7v7H4zM13 13h7v7h-7z"
					/>
				</svg>
			</span>
			Open Day Dashboard
		</a>

		<button
			type="button"
			onclick={() => {
				onclose();
				onviewevents();
			}}
			class={actionClass}
		>
			<span
				class="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-slate-100 text-slate-600"
			>
				<svg class="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.5">
					<path
						stroke-linecap="round"
						stroke-linejoin="round"
						d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"
					/>
				</svg>
			</span>
			View this day's events
		</button>

		<button
			type="button"
			onclick={() => {
				onclose();
				state.openDay(day);
			}}
			class={actionClass}
		>
			<span
				class="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-slate-100 text-slate-600"
			>
				<svg class="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.5">
					<path
						stroke-linecap="round"
						stroke-linejoin="round"
						d="M9 19V6l12-3v13M9 19c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zm12-3c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zM9 10l12-3"
					/>
				</svg>
			</span>
			Open Day View
		</button>
	</div>
</Sheet>
