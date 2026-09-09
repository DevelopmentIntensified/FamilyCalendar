<script lang="ts">
	import { createEventForm } from './EventFormModel.svelte';
	import { getContactColor } from '$lib/utils/contactColors';
	import LocationSearch from '$lib/components/LocationSearch.svelte';
	import AttendantPicker from './AttendantPicker.svelte';

	interface Props {
		form: ReturnType<typeof createEventForm>;
		familyMembers: {
			userId: string;
			firstName?: string;
			lastName?: string;
			email: string;
		}[];
		calendarIds: { id: string; name: string; color?: string }[];
		showMore: boolean;
		showAttendees: boolean;
	}

	let { form, familyMembers, calendarIds, showMore, showAttendees }: Props = $props();

	let calendarDropdownOpen = $state(false);

	let selectedCal = $derived(calendarIds.find((c) => c.id === form.selectedCalendarId) || null);
	let calColor = $derived(
		selectedCal
			? selectedCal.color
				? { bg: selectedCal.color, text: '#ffffff' }
				: getContactColor(selectedCal.name)
			: { bg: '#F1F5F9', text: '#64748B' }
	);
</script>

<div>
	<div class="mb-1 text-sm font-medium text-slate-700">
		Location
		{#if form.isDetected('location')}<span class="ml-1 text-emerald-600">✓</span>{/if}
	</div>
	<LocationSearch bind:value={form.location} />
</div>

{#if showAttendees}
	<div>
		<div class="mb-1 text-sm font-medium text-slate-700">
			Attendees
			{#if form.isDetected('attendants')}<span class="ml-1 text-emerald-600">✓</span>{/if}
		</div>
		<AttendantPicker
			selected={form.attendants}
			{familyMembers}
			recent={form.recentAttendants}
			selections={form.inviteTypes}
			onChangeInviteType={(value, type) => form.setInviteType(value, type)}
			on:toggle={(e) => form.toggleAttendant(e.detail)}
		/>
	</div>
{/if}

{#if (form.isEditMode || showMore) && calendarIds.length > 1}
	<div class="relative">
		<div class="mb-1 text-sm font-medium text-slate-700">Calendar</div>
		<button
			type="button"
			on:click={() => (calendarDropdownOpen = !calendarDropdownOpen)}
			on:blur={() => setTimeout(() => (calendarDropdownOpen = false), 150)}
			class="flex w-full items-center gap-3 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm shadow-sm transition-all focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500"
		>
			<span
				class="flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[11px] font-bold"
				style="background-color: {calColor.bg}; color: {calColor.text}"
			>
				{selectedCal ? selectedCal.name.charAt(0).toUpperCase() : '?'}
			</span>
			<span class="flex-1 truncate text-left font-medium text-slate-700"
				>{selectedCal?.name || 'Select calendar'}</span
			>
			<svg
				class="h-4 w-4 text-slate-400"
				fill="none"
				viewBox="0 0 24 24"
				stroke="currentColor"
				stroke-width="2"
			>
				<path stroke-linecap="round" stroke-linejoin="round" d="M19 9l-7 7-7-7" />
			</svg>
		</button>

		{#if calendarDropdownOpen}
			<div
				class="absolute z-10 mt-1 max-h-52 w-full overflow-y-auto rounded-lg border border-slate-200 bg-white shadow-lg"
			>
				<div class="p-1">
					{#each calendarIds as cal}
						{@const color = cal.color
							? { bg: cal.color, text: '#ffffff' }
							: getContactColor(cal.name)}
						{@const selected = form.selectedCalendarId === cal.id}
						<button
							type="button"
							on:click={() => {
								form.selectedCalendarId = cal.id;
								form.markTouched('calendar');
								calendarDropdownOpen = false;
							}}
							class="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left transition-colors hover:bg-slate-50 {selected
								? 'bg-primary-50'
								: ''}"
						>
							<span
								class="flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-bold"
								style="background-color: {color.bg}; color: {color.text}"
							>
								{cal.name.charAt(0).toUpperCase()}
							</span>
							<span class="flex-1 truncate font-medium text-slate-700">{cal.name}</span>
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
