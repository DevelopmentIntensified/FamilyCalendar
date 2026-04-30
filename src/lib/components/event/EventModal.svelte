<script lang="ts">
	import type { PageData } from '$routes/(calendar)/calendar/$types';
	import type { FamilyMember } from '$lib/types';
	import NLInput from '$lib/components/event/NLInput.svelte';
	import FormField from '$lib/components/event/FormField.svelte';
	import TimeRow from '$lib/components/event/TimeRow.svelte';
	import AttendantSelector from '$lib/components/event/AttendantSelector.svelte';
	import LocationSearch from '$lib/components/LocationSearch.svelte';

	let {
		data,
		showModal = $bindable(false),
		form = {
			title: { value: '', detected: false, userEdited: false, visible: true },
			date: { value: '', detected: false, userEdited: false, visible: true },
			startTime: { value: '', detected: false, userEdited: false, visible: false },
			endTime: { value: '', detected: false, userEdited: false, visible: false },
			location: { value: '', detected: false, userEdited: false, visible: false },
			description: { value: '', detected: false, userEdited: false, visible: false },
			attendants: { value: [] as string[], detected: false, userEdited: false, visible: false }
		},
		allDay = $bindable(false),
		allDayMentioned = $bindable(false),
		allFieldsVisible = $bindable(false),
		nlInput = $bindable(''),
		parsing = false,
		parseError = '',
		startValue = $bindable(''),
		endValue = $bindable(''),
		loading = false,
		defaultCalendarId = $bindable(''),
		showAttendantsDropdown = $bindable(false),
		onNlInput = () => {},
		applyParsedResult = (parsed: any) => {},
		handleFieldChange = (field: string) => {},
		toggleField = (field: string) => {},
		toggleAttendant = (member: FamilyMember) => {},
		showAllFields = () => {},
		hideAllExtra = () => {},
		resetForm = () => {},
		close = () => {}
	}: {
		data: PageData;
		showModal?: boolean;
		form?: any;
		allDay?: boolean;
		allDayMentioned?: boolean;
		allFieldsVisible?: boolean;
		nlInput?: string;
		parsing?: boolean;
		parseError?: string;
		startValue?: string;
		endValue?: string;
		loading?: boolean;
		defaultCalendarId?: string;
		showAttendantsDropdown?: boolean;
		onNlInput?: () => void;
		applyParsedResult?: (parsed: any) => void;
		handleFieldChange?: (field: string) => void;
		toggleField?: (field: string) => void;
		toggleAttendant?: (member: FamilyMember) => void;
		showAllFields?: () => void;
		hideAllExtra?: () => void;
		resetForm?: () => void;
		close?: () => void;
	} = $props();
</script>

{#if showModal}
	<div class="fixed inset-0 z-50 flex items-center justify-center p-4" transition:fade={{ duration: 100 }}>
		<button class="absolute inset-0 bg-black/40" onclick={close} aria-label="Close modal"></button>
		
		<div class="relative w-full max-w-lg max-h-[90vh] overflow-y-auto rounded-2xl bg-white shadow-2xl" transition:fly={{ y: 10, duration: 150 }}>
			<form method="POST" action="?/createEvent" use:enhance={() => { loading = true; return async ({ update }) => { await update(); close(); }; }} class="p-6 space-y-4">
				<div class="flex items-center justify-between pb-2 border-b border-slate-100">
					<h2 class="text-lg font-bold text-slate-900">New Event</h2>
					<button type="button" onclick={close} class="text-slate-400 hover:text-slate-600" aria-label="Close modal">
						<svg class="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
							<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
						</svg>
					</button>
				</div>
				
				<!-- NL Input -->
				<NLInput {nlInput} {onNlInput} {parsing} {parseError} />
				
				<!-- Hidden form fields -->
				<input type="hidden" name="start" value={startValue} />
				<input type="hidden" name="end" value={endValue} />
				<input type="hidden" name="allDay" value={allDay.toString()} />
				<input type="hidden" name="ownerId" value={data.user.id} />
				<input type="hidden" name="calendarId" value={defaultCalendarId || data.userCalendarId || ''} />
				<input type="hidden" name="location" value={form.location.value} />
				<input type="hidden" name="attendants" value={form.attendants.value.join(',')} />
				
				<!-- Form Fields -->
				<div class="space-y-4">
					<!-- Title -->
					<FormField
						field={form.title}
						label="Title"
						type="text"
						name="title"
						placeholder="Event title"
						required
						bindValue={form.title.value}
						onChange={() => handleFieldChange('title')}
					/>
				
					<!-- Date -->
					<FormField
						field={form.date}
						label="Date"
						type="date"
						onToggle={() => toggleField('date')}
						bindValue={form.date.value}
						onChange={() => handleFieldChange('date')}
					/>
				
					<!-- All Day Checkbox -->
					{#if allDayMentioned || allFieldsVisible}
						<div class="flex items-center gap-3 py-1">
							<input
								type="checkbox"
								id="allDay"
								bind:checked={allDay}
								class="h-4 w-4 rounded border-slate-300 text-primary-600 focus:ring-primary-500"
							/>
							<label for="allDay" class="text-sm font-medium text-slate-700">All day event</label>
						</div>
					{/if}
				
					<!-- Calendar Selector -->
					{#if allFieldsVisible && data.calendarIds && data.calendarIds.length > 1}
						<div class="pt-2">
							<label for="calendarId" class="block text-sm font-medium text-slate-700 mb-1">Calendar</label>
							<select
								id="calendarId"
								bind:value={defaultCalendarId}
								class="block w-full rounded-lg border border-slate-300 px-3 py-2 focus:border-primary-500 focus:outline-none focus:ring-2 focus:ring-primary-500"
							>
								{#each data.calendarIds as calendar}
									<option value={calendar.id}>{calendar.name}</option>
								{/each}
							</select>
						</div>
					{/if}
				
					<!-- Time Row -->
					<TimeRow
						startTime={form.startTime}
						endTime={form.endTime}
						{allDay}
						{allFieldsVisible}
						onChange={(field) => handleFieldChange(field)}
					/>
				
					<!-- Location -->
					<div class="relative" class:hidden={!form.location.visible && !allFieldsVisible}>
						<label for="location-search" class="flex items-center justify-between text-xs font-medium text-slate-500 mb-1">
							<span>Location</span>
							{#if form.location.detected}
								<span class="text-green-600 text-xs">✓ detected</span>
							{/if}
						</label>
						<LocationSearch id="location-search" bind:value={form.location.value} />
					</div>
				
					<!-- Description -->
					<FormField
						field={form.description}
						label="Description"
						type="textarea"
						placeholder="Details..."
						onToggle={() => toggleField('description')}
						bindValue={form.description.value}
						onChange={() => handleFieldChange('description')}
					/>
				
					<!-- Attendants -->
					<AttendantSelector
						attendants={form.attendants}
						familyMembers={data.familyMembers || []}
						bind:showDropdown={showAttendantsDropdown}
						onToggle={() => toggleField('attendants')}
					/>
				</div>
			
				<!-- Expand/Collapse Button -->
				<button type="button" onclick={() => allFieldsVisible ? hideAllExtra() : showAllFields()} class="flex w-full items-center justify-center gap-2 rounded-xl border border-dashed border-slate-300 px-4 py-2.5 font-medium text-slate-600 hover:bg-slate-50 transition-colors">
					<svg class="h-4 w-4 transition-transform {allFieldsVisible ? 'rotate-180' : ''}" fill="none" viewBox="0 0 24 24" stroke="currentColor">
						<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7" />
					</svg>
					{allFieldsVisible ? 'Show Less' : 'More Options'}
				</button>
			
				<!-- Create Button -->
				<button type="submit" disabled={loading || !form.title.value.trim()} class="w-full rounded-xl bg-primary-600 px-4 py-3 font-medium text-white hover:bg-primary-700 disabled:opacity-50 mt-3 transition-colors">
					{loading ? 'Creating...' : 'Create Event'}
				</button>
			</form>
		</div>
	</div>
{/if}
