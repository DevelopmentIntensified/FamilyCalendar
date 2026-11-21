<!--
	Location (debounced search), Attendees (only when the caller says so — edit
	mode or after Show More), and the calendar picker (only with 2+ calendars).
	The calendar button paints its own colour and initial, so "which calendar is
	this event on" reads before the menu opens.

	This component owns no state beyond the picker's open flag: the form state
	class holds every value.

	Doc: ../../README.md#public-interface
-->
<script lang="ts">
	import { initials } from '$lib/kernel/ui/colorHash';
	import type { CalendarApi } from '../calendar.api';
	import type { CalendarEventFormFields } from '../calendar.eventForm.rules';
	import { calendarContactColor } from '../calendar.eventView.rules';
	import type { CalendarFamilyMember } from '../calendar.eventForm.state.svelte';
	import CalendarEventAttendantPicker from './CalendarEventAttendantPicker.svelte';
	import CalendarEventLocationSearch from './CalendarEventLocationSearch.svelte';

	interface Props {
		fields: CalendarEventFormFields;
		detected: (field: string) => boolean;
		isEdit: boolean;
		showMore: boolean;
		showAttendees: boolean;
		members: readonly CalendarFamilyMember[];
		recent: readonly string[];
		calendars: readonly { id: string; name: string; color?: string | null }[];
		api: CalendarApi;
		onpatch: (patch: Partial<CalendarEventFormFields>, touchedField?: string) => void;
		ontoggleattendee: (value: string) => void;
		oninvitetype: (value: string, type: 'required' | 'optional') => void;
	}

	let {
		fields,
		detected,
		isEdit,
		showMore,
		showAttendees,
		members,
		recent,
		calendars,
		api,
		onpatch,
		ontoggleattendee,
		oninvitetype
	}: Props = $props();

	let pickerOpen = $state(false);

	const selectedCalendar = $derived(
		calendars.find((calendar) => calendar.id === fields.selectedCalendarId) ?? null
	);
	const calendarColor = $derived(
		selectedCalendar
			? selectedCalendar.color
				? { bg: selectedCalendar.color, text: '#ffffff' }
				: calendarContactColor(selectedCalendar.name)
			: { bg: '#F1F5F9', text: '#64748B' }
	);
</script>

<div>
	<div class="mb-1 text-sm font-medium text-slate-700">
		Location
		{#if detected('location')}<span class="ml-1 text-emerald-600">✓</span>{/if}
	</div>
	<CalendarEventLocationSearch
		value={fields.location}
		onvalue={(value) => onpatch({ location: value }, 'location')}
		{api}
	/>
</div>

{#if showAttendees}
	<div>
		<div class="mb-1 text-sm font-medium text-slate-700">
			Attendees
			{#if detected('attendants')}<span class="ml-1 text-emerald-600">✓</span>{/if}
		</div>
		<CalendarEventAttendantPicker
			selected={fields.attendants}
			{members}
			{recent}
			inviteTypes={fields.inviteTypes}
			ontoggle={ontoggleattendee}
			ontype={oninvitetype}
		/>
	</div>
{/if}

{#if (isEdit || showMore) && calendars.length > 1}
	<div class="relative">
		<div class="mb-1 text-sm font-medium text-slate-700">Calendar</div>
		<button
			type="button"
			onclick={() => (pickerOpen = !pickerOpen)}
			onblur={() => setTimeout(() => (pickerOpen = false), 150)}
			class="flex w-full items-center gap-3 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm shadow-sm transition-all focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500"
			data-testid="calendar-picker"
		>
			<span
				class="flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[11px] font-bold"
				style="background-color: {calendarColor.bg}; color: {calendarColor.text}"
			>
				{selectedCalendar ? selectedCalendar.name.charAt(0).toUpperCase() : '?'}
			</span>
			<span class="flex-1 truncate text-left font-medium text-slate-700"
				>{selectedCalendar?.name || 'Select calendar'}</span
			>
			<svg class="h-4 w-4 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
				<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7" />
			</svg>
		</button>

		{#if pickerOpen}
			<div
				class="absolute z-10 mt-1 max-h-52 w-full overflow-y-auto rounded-lg border border-slate-200 bg-white shadow-lg"
			>
				<div class="p-1">
					{#each calendars as calendar (calendar.id)}
						{@const color = calendar.color
							? { bg: calendar.color, text: '#ffffff' }
							: calendarContactColor(calendar.name)}
						{@const selected = fields.selectedCalendarId === calendar.id}
						<button
							type="button"
							onclick={() => {
								onpatch({ selectedCalendarId: calendar.id }, 'calendar');
								pickerOpen = false;
							}}
							class="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left transition-colors hover:bg-slate-50 {selected
								? 'bg-primary-50'
								: ''}"
						>
							<span
								class="flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-bold"
								style="background-color: {color.bg}; color: {color.text}"
							>
								{initials(calendar.name, '')}
							</span>
							<span class="flex-1 truncate font-medium text-slate-700">{calendar.name}</span>
							{#if selected}
								<svg
									class="h-4 w-4 text-primary-600"
									fill="none"
									viewBox="0 0 24 24"
									stroke="currentColor"
									stroke-width="3"
								>
									<path stroke-linecap="round" stroke-linejoin="round" d="M5 13l4 4L19 7" />
								</svg>
							{/if}
						</button>
					{/each}
				</div>
			</div>
		{/if}
	</div>
{/if}
