<script lang="ts">
	import { writable } from 'svelte/store';
	import { DateTime } from 'luxon';
	import type { PageData } from './$types';
	import type { Event } from '$lib/types';
	import Calendar from '$lib/components/calendar/Calendar.svelte';
	import EventFormModal from '$lib/components/calendar/EventFormModal.svelte';
	import { invalidateAll } from '$app/navigation';

	export let data: PageData;

	const currentDate = writable(DateTime.now());
	let showModal = false;
	let showEditModal = false;
	let selectedEvent: Event | null = null;
	let selectedEventRsvp: any[] = [];

	// Combine all events
	$: allEvents = [
		...(data.userEvents || []),
		...(data.familyEvents || []),
		...(data.adEvents || [])
	];

	function close() {
		showModal = false;
		showEditModal = false;
		selectedEvent = null;
		selectedEventRsvp = [];
	}

	async function handleEventCreated(event: CustomEvent) {
		await invalidateAll();
		close();
	}

	async function handleEventUpdate(event: CustomEvent) {
		await invalidateAll();
		close();
	}

	async function handleEventDelete(event: CustomEvent) {
		const eventId = event.detail.id;
		try {
			const res = await fetch(`/api/events/${eventId}`, { method: 'DELETE' });
			if (res.ok) {
				await invalidateAll();
			}
		} catch (e) {
			console.error('Failed to delete event:', e);
		}
		close();
	}

	// Handle event click from calendar views
	async function handleEventClick(event: CustomEvent) {
		selectedEvent = event.detail;
		// Fetch RSVP data for this event
		try {
			const res = await fetch(`/api/events/${selectedEvent.id}/attendance`);
			if (res.ok) {
				selectedEventRsvp = await res.json();
			}
		} catch (e) {
			console.error('Failed to fetch RSVP data:', e);
		}
		showEditModal = true;
	}
</script>

<div class="pb-24">
	<Calendar 
		{currentDate} 
		events={allEvents} 
		removeEvent={() => {}}
		preferedFirstDayOfWeek={data.user?.firstDayOfWeek || 'sunday'}
		on:eventClick={handleEventClick}
	/>
</div>

<!-- Floating Quick Add Button -->
<button
	onclick={() => showModal = true}
	class="fixed bottom-24 right-6 z-40 flex h-16 w-16 items-center justify-center rounded-full bg-primary-600 shadow-xl shadow-primary-400/50 hover:bg-primary-700 hover:scale-105 transition-all"
	title="Quick Add Event"
>
	<svg class="h-8 w-8 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
		<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M12 4v16m8-8H4" />
	</svg>
</button>

<!-- Create Event Modal -->
{#if showModal}
	<EventFormModal
		show={true}
		calendarIds={data.calendarIds || []}
		familyMembers={data.familyMembers || []}
		on:close={close}
		on:create={handleEventCreated}
	/>
{/if}

<!-- Edit Event Modal -->
{#if showEditModal && selectedEvent}
	<EventFormModal
		show={true}
		event={selectedEvent}
		calendarIds={data.calendarIds || []}
		familyMembers={data.familyMembers || []}
		rsvpData={selectedEventRsvp}
		on:close={close}
		on:update={handleEventUpdate}
		on:delete={handleEventDelete}
	/>
{/if}
