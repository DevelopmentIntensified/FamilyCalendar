<!--
	All-day / Multi-day toggles, the repeat + reminder pickers, then the start
	date, end date, start time and end time. An all-day event hides the times; a
	multi-day event pairs the dates. Both order mistakes say so inline.

	Doc: ../../README.md#public-interface
-->
<script lang="ts">
	import {
		calendarEndBeforeStart,
		calendarEndDateBeforeStart,
		type CalendarEventFormFields
	} from '../calendar.eventForm.rules';
	import CalendarEventRecurrenceFields from './CalendarEventRecurrenceFields.svelte';

	interface Props {
		fields: CalendarEventFormFields;
		detected: (field: string) => boolean;
		isRecurringOccurrence: boolean;
		editScope: 'this' | 'all';
		onpatch: (patch: Partial<CalendarEventFormFields>, touchedField?: string) => void;
		onscopeselect: (scope: 'this' | 'all') => void;
	}

	let { fields, detected, isRecurringOccurrence, editScope, onpatch, onscopeselect }: Props =
		$props();

	const endBeforeStart = $derived(calendarEndBeforeStart(fields));
	const endDateBeforeStart = $derived(calendarEndDateBeforeStart(fields));
</script>

<div class="flex items-center gap-3">
	<button
		type="button"
		onclick={() => onpatch({ allDay: !fields.allDay }, 'allDay')}
		class="flex flex-1 items-center justify-between rounded-full border px-4 py-2 text-sm font-medium transition-all {fields.allDay
			? 'border-primary-300 bg-primary-50 text-primary-700'
			: 'border-slate-200 bg-white text-slate-600 hover:border-slate-300'}"
	>
		<span>All day</span>
		<div
			class="relative h-4 w-8 rounded-full transition-colors {fields.allDay
				? 'bg-primary-500'
				: 'bg-slate-300'}"
		>
			<div
				class="absolute left-0.5 top-0.5 h-3 w-3 rounded-full bg-white transition-transform {fields.allDay
					? 'translate-x-4'
					: ''}"
			></div>
		</div>
	</button>
	<button
		type="button"
		onclick={() => onpatch({ multiDay: !fields.multiDay }, 'endDate')}
		class="flex flex-1 items-center justify-between rounded-full border px-4 py-2 text-sm font-medium transition-all {fields.multiDay
			? 'border-primary-300 bg-primary-50 text-primary-700'
			: 'border-slate-200 bg-white text-slate-600 hover:border-slate-300'}"
	>
		<span>Multi-day</span>
		<div
			class="relative h-4 w-8 rounded-full transition-colors {fields.multiDay
				? 'bg-primary-500'
				: 'bg-slate-300'}"
		>
			<div
				class="absolute left-0.5 top-0.5 h-3 w-3 rounded-full bg-white transition-transform {fields.multiDay
					? 'translate-x-4'
					: ''}"
			></div>
		</div>
	</button>
</div>

<CalendarEventRecurrenceFields
	{fields}
	{isRecurringOccurrence}
	{editScope}
	{onpatch}
	{onscopeselect}
/>

<div class={fields.multiDay ? 'grid grid-cols-2 gap-3' : ''}>
	<div>
		<label for="event-date" class="mb-1 block text-sm font-medium text-slate-700">
			Start Date
			{#if detected('date')}<span class="ml-1 text-emerald-600">✓</span>{/if}
		</label>
		<input
			id="event-date"
			type="date"
			value={fields.date}
			oninput={(event) => onpatch({ date: event.currentTarget.value }, 'date')}
			required
			class="mt-1 block w-full rounded-lg border border-slate-300 px-3 py-2 text-sm shadow-sm focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500"
		/>
	</div>
	{#if fields.multiDay}
		<div>
			<label for="event-end-date" class="mb-1 block text-sm font-medium text-slate-700">
				End Date
				{#if detected('endDate')}<span class="ml-1 text-emerald-600">✓</span>{/if}
			</label>
			<input
				id="event-end-date"
				type="date"
				value={fields.endDate}
				oninput={(event) => onpatch({ endDate: event.currentTarget.value }, 'endDate')}
				class="mt-1 block w-full rounded-lg border border-slate-300 px-3 py-2 text-sm shadow-sm focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500"
			/>
			{#if endDateBeforeStart}
				<p class="mt-1 text-xs text-red-600">End date can't be before start date</p>
			{/if}
		</div>
	{/if}
</div>

{#if !fields.allDay}
	<div class="grid grid-cols-2 gap-3">
		<div>
			<label for="event-start-time" class="mb-1 block text-sm font-medium text-slate-700">
				Start Time
				{#if detected('startTime')}<span class="ml-1 text-emerald-600">✓</span>{/if}
			</label>
			<input
				id="event-start-time"
				type="time"
				value={fields.startTime}
				oninput={(event) => onpatch({ startTime: event.currentTarget.value }, 'startTime')}
				class="mt-1 block w-full rounded-lg border border-slate-300 px-3 py-2 text-sm shadow-sm focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500"
			/>
		</div>
		<div>
			<label for="event-end-time" class="mb-1 block text-sm font-medium text-slate-700">
				End Time
				{#if detected('endTime')}<span class="ml-1 text-emerald-600">✓</span>{/if}
			</label>
			<input
				id="event-end-time"
				type="time"
				value={fields.endTime}
				oninput={(event) => onpatch({ endTime: event.currentTarget.value }, 'endTime')}
				class="mt-1 block w-full rounded-lg border border-slate-300 px-3 py-2 text-sm shadow-sm focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500"
			/>
			{#if endBeforeStart}
				<p class="mt-1 text-xs text-red-600">End must be after start</p>
			{/if}
		</div>
	</div>
{/if}
