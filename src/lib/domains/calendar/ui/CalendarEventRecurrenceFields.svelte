<!--
	Repeat + reminder pickers, and — on an occurrence of a series — the save
	scope (This event only / All events in series). A reminder the parser read
	outside the preset list stays selectable, labelled "(from Quick Add)".

	Doc: ../../README.md#public-interface
-->
<script lang="ts">
	import type { CalendarEventFormFields } from '../calendar.eventForm.rules';

	interface Props {
		fields: CalendarEventFormFields;
		isRecurringOccurrence: boolean;
		editScope: 'this' | 'all';
		onpatch: (patch: Partial<CalendarEventFormFields>, touchedField?: string) => void;
		onscopeselect: (scope: 'this' | 'all') => void;
	}

	let { fields, isRecurringOccurrence, editScope, onpatch, onscopeselect }: Props = $props();

	const UNITS: Record<string, [singular: string, plural: string]> = {
		daily: ['day', 'days'],
		weekly: ['week', 'weeks'],
		monthly: ['month', 'months'],
		yearly: ['year', 'years']
	};
	const PRESET_REMINDERS = [15, 30, 60, 120, 1440];

	const reminderValue = $derived(fields.reminderMinutes == null ? '' : String(fields.reminderMinutes));
</script>

<div class="flex items-center gap-2">
	<select
		onchange={(event) =>
			onpatch({ recurrenceFrequency: event.currentTarget.value || null }, 'recurrence')}
		value={fields.recurrenceFrequency || ''}
		class="rounded-lg border border-slate-300 px-3 py-2 text-sm shadow-sm focus:border-primary-500 focus:outline-none"
		aria-label="Repeat"
	>
		<option value="">Doesn't repeat</option>
		<option value="daily">Daily</option>
		<option value="weekly">Weekly</option>
		<option value="monthly">Monthly</option>
		<option value="yearly">Yearly</option>
	</select>
	{#if fields.recurrenceFrequency}
		<span class="whitespace-nowrap text-sm text-slate-600">every</span>
		<input
			type="number"
			min="1"
			max="365"
			value={fields.recurrenceInterval}
			oninput={(event) =>
				onpatch(
					{ recurrenceInterval: Math.max(1, Math.floor(Number(event.currentTarget.value)) || 1) },
					'recurrence'
				)}
			class="w-16 rounded-lg border border-slate-300 px-2 py-2 text-sm shadow-sm focus:border-primary-500 focus:outline-none"
			aria-label="Repeat interval"
		/>
		<span class="text-sm text-slate-600">
			{UNITS[fields.recurrenceFrequency]?.[fields.recurrenceInterval === 1 ? 0 : 1] ?? ''}
		</span>
	{/if}
</div>

<div class="flex items-center gap-2">
	<select
		value={reminderValue}
		onchange={(event) =>
			onpatch(
				{
					reminderMinutes: event.currentTarget.value
						? Math.floor(Number(event.currentTarget.value))
						: null
				},
				'reminderMinutes'
			)}
		class="rounded-lg border border-slate-300 px-3 py-2 text-sm shadow-sm focus:border-primary-500 focus:outline-none"
		aria-label="Reminder"
	>
		<option value="">No reminder</option>
		<option value="15">15 min before</option>
		<option value="30">30 min before</option>
		<option value="60">1 hour before</option>
		<option value="120">2 hours before</option>
		<option value="1440">1 day before</option>
		{#if fields.reminderMinutes != null && !PRESET_REMINDERS.includes(fields.reminderMinutes)}
			<option value={reminderValue}>{fields.reminderMinutes} min before (from Quick Add)</option>
		{/if}
	</select>
</div>

{#if isRecurringOccurrence}
	<div class="rounded-lg border border-purple-200 bg-purple-50 p-3">
		<h4 class="mb-2 text-xs font-semibold uppercase tracking-wide text-purple-700">
			This event repeats — save changes for:
		</h4>
		<div class="flex gap-4 text-sm text-slate-700">
			<label class="flex cursor-pointer items-center gap-1.5">
				<input
					type="radio"
					checked={editScope === 'this'}
					onchange={() => onscopeselect('this')}
					value="this"
					name="editScope"
				/>
				This event only
			</label>
			<label class="flex cursor-pointer items-center gap-1.5">
				<input
					type="radio"
					checked={editScope === 'all'}
					onchange={() => onscopeselect('all')}
					value="all"
					name="editScope"
				/>
				All events in series
			</label>
		</div>
	</div>
{/if}
