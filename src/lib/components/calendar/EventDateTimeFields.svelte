<script lang="ts">
	import { createEventForm } from './EventFormModel.svelte';
	import EventRecurrenceFields from './EventRecurrenceFields.svelte';

	interface Props {
		form: ReturnType<typeof createEventForm>;
		editScope: string;
	}

	let { form, editScope = $bindable() }: Props = $props();
</script>

<div class="flex items-center gap-3">
	<button
		type="button"
		on:click={() => {
			form.allDay = !form.allDay;
			form.markTouched('allDay');
		}}
		class="flex flex-1 items-center justify-between rounded-full border px-4 py-2 text-sm font-medium transition-all {form.allDay
			? 'border-primary-300 bg-primary-50 text-primary-700'
			: 'border-slate-200 bg-white text-slate-600 hover:border-slate-300'}"
	>
		<span>All day</span>
		<div
			class="relative h-4 w-8 rounded-full transition-colors {form.allDay
				? 'bg-primary-500'
				: 'bg-slate-300'}"
		>
			<div
				class="absolute left-0.5 top-0.5 h-3 w-3 rounded-full bg-white transition-transform {form.allDay
					? 'translate-x-4'
					: ''}"
			></div>
		</div>
	</button>
	<button
		type="button"
		on:click={() => {
			form.multiDay = !form.multiDay;
			form.markTouched('endDate');
		}}
		class="flex flex-1 items-center justify-between rounded-full border px-4 py-2 text-sm font-medium transition-all {form.multiDay
			? 'border-primary-300 bg-primary-50 text-primary-700'
			: 'border-slate-200 bg-white text-slate-600 hover:border-slate-300'}"
	>
		<span>Multi-day</span>
		<div
			class="relative h-4 w-8 rounded-full transition-colors {form.multiDay
				? 'bg-primary-500'
				: 'bg-slate-300'}"
		>
			<div
				class="absolute left-0.5 top-0.5 h-3 w-3 rounded-full bg-white transition-transform {form.multiDay
					? 'translate-x-4'
					: ''}"
			></div>
		</div>
	</button>
</div>

<EventRecurrenceFields {form} bind:editScope />

<div class={form.multiDay ? 'grid grid-cols-2 gap-3' : ''}>
	<div>
		<label for="event-date" class="mb-1 block text-sm font-medium text-slate-700">
			Start Date
			{#if form.isDetected('date')}<span class="ml-1 text-emerald-600">✓</span>{/if}
		</label>
		<input
			id="event-date"
			type="date"
			bind:value={form.date}
			on:input={() => form.markTouched('date')}
			required
			class="mt-1 block w-full rounded-lg border border-slate-300 px-3 py-2 text-sm shadow-sm focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500"
		/>
	</div>
	{#if form.multiDay}
		<div>
			<label for="event-end-date" class="mb-1 block text-sm font-medium text-slate-700">
				End Date
				{#if form.isDetected('endDate')}<span class="ml-1 text-emerald-600">✓</span>{/if}
			</label>
			<input
				id="event-end-date"
				type="date"
				bind:value={form.endDate}
				on:input={() => form.markTouched('endDate')}
				class="mt-1 block w-full rounded-lg border border-slate-300 px-3 py-2 text-sm shadow-sm focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500"
			/>
			{#if form.endDateBeforeStart}
				<p class="mt-1 text-xs text-red-600">End date can't be before start date</p>
			{/if}
		</div>
	{/if}
</div>

{#if !form.allDay}
	<div class="grid grid-cols-2 gap-3">
		<div>
			<label for="start-time" class="mb-1 block text-sm font-medium text-slate-700">
				Start Time
				{#if form.isDetected('startTime')}<span class="ml-1 text-emerald-600">✓</span>{/if}
			</label>
			<input
				id="start-time"
				type="time"
				bind:value={form.startTime}
				on:input={() => form.markTouched('startTime')}
				class="mt-1 block w-full rounded-lg border border-slate-300 px-3 py-2 text-sm shadow-sm focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500"
			/>
		</div>
		<div>
			<label for="end-time" class="mb-1 block text-sm font-medium text-slate-700">
				End Time
				{#if form.isDetected('endTime')}<span class="ml-1 text-emerald-600">✓</span>{/if}
			</label>
			<input
				id="end-time"
				type="time"
				bind:value={form.endTime}
				on:input={() => form.markTouched('endTime')}
				class="mt-1 block w-full rounded-lg border border-slate-300 px-3 py-2 text-sm shadow-sm focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500"
			/>
			{#if form.endBeforeStart}
				<p class="mt-1 text-xs text-red-600">End must be after start</p>
			{/if}
		</div>
	</div>
{/if}
