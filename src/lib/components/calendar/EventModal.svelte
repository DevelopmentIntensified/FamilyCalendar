<script lang="ts">
	import { createEventDispatcher } from 'svelte';
	import type { Event } from '$lib/types';
	import { DateTime } from 'luxon';
	import EventFormModal from './EventFormModal.svelte';

	export let event: Event;
	export let show = false;

	const dispatch = createEventDispatcher();

	let showEditForm = false;

	function close() {
		show = false;
		showEditForm = false;
		dispatch('close');
	}

	function handleDelete() {
		if (confirm('Delete this event?')) {
			dispatch('delete', { id: event.id });
		}
	}

	function handleEdit() {
		showEditForm = true;
	}

	function handleFormClose() {
		showEditForm = false;
	}

	function handleUpdate(event: CustomEvent) {
		dispatch('update', event.detail);
		showEditForm = false;
	}

	function formatTime(time: string | undefined): string {
		if (!time) return '';
		const [h, m] = time.split(':').map(Number);
		const ampm = h >= 12 ? 'PM' : 'AM';
		const hour = h > 12 ? h - 12 : h === 0 ? 12 : h;
		return `${hour}:${m.toString().padStart(2, '0')} ${ampm}`;
	}
</script>

{#if show}
	{#if showEditForm}
		<EventFormModal
			show={true}
			event={event}
			calendarIds={[]}
			on:close={handleFormClose}
			on:update={handleUpdate}
		/>
	{:else}
		<div class="fixed inset-0 z-50 flex items-center justify-center p-4" transition:fade={{ duration: 100 }}>
			<button class="absolute inset-0 bg-black/40" onclick={close}></button>
			
			<div class="relative w-full max-w-lg max-h-[90vh] overflow-y-auto rounded-2xl bg-white shadow-2xl" transition:fly={{ y: 10, duration: 150 }}>
				<!-- Header -->
				<div class="flex items-center justify-between border-b border-slate-100 p-6">
					<h2 class="text-xl font-bold text-slate-900 truncate">{event.title}</h2>
					<button type="button" onclick={close} class="text-slate-400 hover:text-slate-600 transition-colors">
						<svg class="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
							<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
						</svg>
					</button>
				</div>

				<!-- Content -->
				<div class="space-y-4 p-6">
					<!-- Color indicator -->
					<div class="flex items-center gap-3">
						<div class="h-4 w-4 rounded-full {event.color || 'bg-slate-400'}"></div>
						<span class="text-sm text-slate-600">{event.isAd ? 'Ad Event' : event.isFamilyEvent ? 'Family Event' : 'Personal Event'}</span>
					</div>

					<!-- Date & Time -->
					{#if event.date}
						{@const eventDate = event.date instanceof Date ? DateTime.fromJSDate(event.date) : DateTime.fromISO(event.date)}
						<div class="flex items-center gap-2 text-slate-700">
							<svg class="h-4 w-4 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
								<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
							</svg>
							<span>{eventDate.toFormat('EEEE, MMMM d, yyyy')}</span>
						</div>

						{#if event.allDay}
							<div class="flex items-center gap-2 text-slate-700">
								<svg class="h-4 w-4 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
									<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
								</svg>
								<span>All day</span>
							</div>
						{:else if event.startTime}
							<div class="flex items-center gap-2 text-slate-700">
								<svg class="h-4 w-4 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
									<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
								</svg>
								<span>{formatTime(event.startTime)}{#if event.endTime} - {formatTime(event.endTime)}{/if}</span>
							</div>
						{/if}
					{/if}

					<!-- Location -->
					{#if event.location}
						<div class="flex items-center gap-2 text-slate-700">
							<svg class="h-4 w-4 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
								<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
								<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
							</svg>
							<span class="truncate">{event.location}</span>
						</div>
					{/if}

					<!-- Description -->
					{#if event.description}
						<div class="rounded-lg bg-slate-50 p-4">
							<p class="text-sm text-slate-600">{event.description}</p>
						</div>
					{/if}

					<!-- RSVP Status -->
					{#if event.rsvpStatus}
						<div class="flex items-center gap-2">
							<span class="text-sm text-slate-500">Your RSVP:</span>
							<span class="rounded-full px-2 py-0.5 text-xs font-medium
								{event.rsvpStatus === 'going' ? 'bg-green-100 text-green-700' : 
								event.rsvpStatus === 'maybe' ? 'bg-yellow-100 text-yellow-700' :
								event.rsvpStatus === 'declined' ? 'bg-red-100 text-red-700' :
								'bg-slate-100 text-slate-700'}">
								{event.rsvpStatus}
							</span>
						</div>
					{/if}
				</div>

				<!-- Actions -->
				<div class="flex items-center justify-between border-t border-slate-100 p-6">
					<button
						type="button"
						onclick={handleDelete}
						class="text-sm font-medium text-red-600 hover:text-red-700 transition-colors"
					>
						Delete Event
					</button>
					<div class="flex gap-3">
						<button
							type="button"
							onclick={close}
							class="rounded-lg border border-slate-200 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 transition-colors"
						>
							Close
						</button>
						<button
							type="button"
							onclick={handleEdit}
							class="rounded-lg bg-primary-600 px-4 py-2 text-sm font-medium text-white hover:bg-primary-700 transition-colors"
						>
							Edit
						</button>
					</div>
				</div>
			</div>
		</div>
	{/if}
{/if}
