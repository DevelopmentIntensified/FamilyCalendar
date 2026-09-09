<script lang="ts">
	import { createEventForm } from './EventFormModel.svelte';

	interface Props {
		form: ReturnType<typeof createEventForm>;
		editScope: string;
	}

	let { form, editScope = $bindable() }: Props = $props();
</script>

<!-- Repeat picker -->
<div class="flex items-center gap-2">
	<select
		on:change={(e) => {
			form.recurrenceFrequency = e.currentTarget.value || null;
		}}
		value={form.recurrenceFrequency || ''}
		class="rounded-lg border border-slate-300 px-3 py-2 text-sm shadow-sm focus:border-primary-500 focus:outline-none"
		aria-label="Repeat"
	>
		<option value="">Doesn't repeat</option>
		<option value="daily">Daily</option>
		<option value="weekly">Weekly</option>
		<option value="monthly">Monthly</option>
		<option value="yearly">Yearly</option>
	</select>
	{#if form.recurrenceFrequency}
		<span class="whitespace-nowrap text-sm text-slate-600">every</span>
		<input
			type="number"
			min="1"
			max="365"
			bind:value={form.recurrenceInterval}
			class="w-16 rounded-lg border border-slate-300 px-2 py-2 text-sm shadow-sm focus:border-primary-500 focus:outline-none"
			aria-label="Repeat interval"
		/>
		<span class="text-sm text-slate-600">
			{form.recurrenceInterval === 1
				? { daily: 'day', weekly: 'week', monthly: 'month', yearly: 'year' }[
						form.recurrenceFrequency
					]
				: { daily: 'days', weekly: 'weeks', monthly: 'months', yearly: 'years' }[
						form.recurrenceFrequency
					]}
		</span>
	{/if}
</div>

<!-- Reminder picker -->
<div class="flex items-center gap-2">
	<select
		bind:value={form.reminderSelectValue}
		class="rounded-lg border border-slate-300 px-3 py-2 text-sm shadow-sm focus:border-primary-500 focus:outline-none"
		aria-label="Reminder"
	>
		<option value="">No reminder</option>
		<option value="15">15 min before</option>
		<option value="30">30 min before</option>
		<option value="60">1 hour before</option>
		<option value="120">2 hours before</option>
		<option value="1440">1 day before</option>
		{#if form.reminderMinutes != null && ![15, 30, 60, 120, 1440].includes(form.reminderMinutes)}
			<option value={form.reminderSelectValue}>
				{form.reminderMinutes} min before (from Quick Add)
			</option>
		{/if}
	</select>
</div>

{#if form.isRecurringOccurrence}
	<div class="rounded-lg border border-purple-200 bg-purple-50 p-3">
		<h4 class="mb-2 text-xs font-semibold uppercase tracking-wide text-purple-700">
			This event repeats — save changes for:
		</h4>
		<div class="flex gap-4 text-sm text-slate-700">
			<label class="flex cursor-pointer items-center gap-1.5">
				<input type="radio" bind:group={editScope} value="this" name="editScope" />
				This event only
			</label>
			<label class="flex cursor-pointer items-center gap-1.5">
				<input type="radio" bind:group={editScope} value="all" name="editScope" />
				All events in series
			</label>
		</div>
	</div>
{/if}
