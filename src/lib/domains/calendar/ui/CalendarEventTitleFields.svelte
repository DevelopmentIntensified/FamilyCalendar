<!--
	Title, Description, and the collapsed→expanded gate: a create modal opens on
	Quick Add, Title and Description only, and "Show More" reveals date, time,
	location, attendants and calendar. A parser-detected title carries the green
	tick.

	Doc: ../../README.md#public-interface
-->
<script lang="ts">
	import type { CalendarEventFormFields } from '../calendar.eventForm.rules';

	interface Props {
		fields: CalendarEventFormFields;
		isEdit: boolean;
		showMore: boolean;
		detected: (field: string) => boolean;
		onpatch: (patch: Partial<CalendarEventFormFields>, touchedField?: string) => void;
		onshowmore: () => void;
	}

	let { fields, isEdit, showMore, detected, onpatch, onshowmore }: Props = $props();
</script>

<div>
	<label for="event-title" class="mb-1 block text-sm font-medium text-slate-700">
		Event Title {#if detected('title')}<span class="ml-1 text-emerald-600">✓</span>{/if}*
	</label>
	<input
		id="event-title"
		type="text"
		value={fields.title}
		oninput={(event) => onpatch({ title: event.currentTarget.value }, 'title')}
		placeholder="e.g., Family Dinner, Doctor Appointment"
		required
		class="mt-1 block w-full rounded-lg border border-slate-300 px-3 py-2 text-sm shadow-sm transition-all focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500"
	/>
</div>

<div>
	<label for="event-desc" class="mb-1 block text-sm font-medium text-slate-700">Description</label>
	<textarea
		id="event-desc"
		value={fields.description}
		oninput={(event) => onpatch({ description: event.currentTarget.value }, 'description')}
		placeholder="Add details..."
		rows="2"
		class="mt-1 block w-full resize-none rounded-lg border border-slate-300 px-3 py-2 text-sm shadow-sm focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500"
	></textarea>
</div>

{#if !isEdit && !showMore}
	<button
		type="button"
		onclick={onshowmore}
		class="flex w-full items-center justify-center gap-1 rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm font-medium text-slate-700 shadow-sm transition-colors hover:bg-slate-50"
	>
		Show More
		<svg
			class="h-3.5 w-3.5 transition-transform"
			fill="none"
			viewBox="0 0 24 24"
			stroke="currentColor"
			stroke-width="2"
		>
			<path stroke-linecap="round" stroke-linejoin="round" d="M19 9l-7 7-7-7" />
		</svg>
	</button>
{/if}
