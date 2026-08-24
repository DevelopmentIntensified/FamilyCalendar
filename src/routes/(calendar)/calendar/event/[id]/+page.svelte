<script lang="ts">
	import { enhance } from '$app/forms';
	import { goto, invalidateAll } from '$app/navigation';
	import { DateTime } from 'luxon';
	import type { PageData, ActionData } from './$types';

	let { data, form }: { data: PageData; form: ActionData } = $props();

	const event = $derived(data.event);
	const calendar = $derived(data.calendar);
	const attendees = $derived(data.attendees || []);
	const userAttendance = $derived(data.userAttendance);
	const timeZone = $derived(data.userSettings?.timeZone || Intl.DateTimeFormat().resolvedOptions().timeZone);
	const isFamilyEvent = $derived(data.isFamilyEvent);

	let showDeleteConfirm = $state(false);
	let rsvpStatus = $state(userAttendance);
	let rsvpPending = $state(false);

	async function setRsvp(status: string) {
		if (rsvpPending) return;
		const next = rsvpStatus === status ? 'undecided' : status;
		const previous = rsvpStatus;
		rsvpStatus = next; // optimistic
		rsvpPending = true;
		try {
			const res = await fetch(`/api/events/${data.event.id}/rsvp`, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ status: next })
			});
			if (res.ok) {
				await invalidateAll(); // refresh attendee list from server
			} else {
				rsvpStatus = previous;
			}
		} catch {
			rsvpStatus = previous;
		} finally {
			rsvpPending = false;
		}
	}

	const counts = $derived<Record<string, number>>({
		going: attendees.filter((a: any) => a.status === 'going').length,
		maybe: attendees.filter((a: any) => a.status === 'maybe').length,
		declined: attendees.filter((a: any) => a.status === 'declined' || a.status === 'not_going').length
	});
	const RSVP_OPTIONS = [
		{ status: 'going', label: 'Going' },
		{ status: 'maybe', label: 'Maybe' },
		{ status: 'declined', label: "Can't go" }
	];

	function displayName(a: any): string {
		const name = [a.firstName, a.lastName].filter(Boolean).join(' ').trim();
		return name || a.name || a.userId || 'Guest';
	}

	function goBack() {
		goto('/calendar');
	}

	function handleRsvp(response: any) {
		if (response?.result?.status) {
			rsvpStatus = response.result.status;
		}
	}
</script>

<div class="container mx-auto min-h-screen bg-gray-100 p-4 pt-20">
	<div class="mx-auto max-w-3xl">
		<button onclick={goBack} class="mb-4 flex items-center text-primary-600 hover:text-primary-700">
			<svg
				xmlns="http://www.w3.org/2000/svg"
				class="mr-1 h-5 w-5"
				viewBox="0 0 24 24"
				fill="none"
				stroke="currentColor"
				stroke-width="2"
				stroke-linecap="round"
				stroke-linejoin="round"><polyline points="15 18 9 12 15 6"></polyline></svg>
			Back to Calendar
		</button>

		<div class="overflow-hidden rounded-lg bg-white shadow-xl">
			<div class="bg-primary-600 px-4 py-6 sm:px-6">
				<h1 class="text-center text-3xl font-extrabold text-white">{event.title}</h1>
			</div>

			<div class="p-6 sm:p-8">
				<div class="mb-6 grid grid-cols-1 gap-4 md:grid-cols-2">
					<div class="space-y-3">
						<!-- Date -->
						<div class="flex items-center">
							<svg xmlns="http://www.w3.org/2000/svg" class="mr-2 h-5 w-5 text-gray-500" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
								<rect x="3" y="4" width="18" height="18" rx="2" ry="2"></rect>
								<line x1="16" y1="2" x2="16" y2="6"></line>
								<line x1="8" y1="2" x2="8" y2="6"></line>
								<line x1="3" y1="10" x2="21" y2="10"></line>
							</svg>
							<span class="text-gray-700">
								{DateTime.fromJSDate(event.date).setZone(timeZone).toLocaleString(DateTime.DATE_MED_WITH_WEEKDAY)}
							</span>
						</div>

						<!-- Start & End Time -->
						<div class="flex items-center">
							<svg xmlns="http://www.w3.org/2000/svg" class="mr-2 h-5 w-5 text-gray-500" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
								<circle cx="12" cy="12" r="10"></circle>
								<polyline points="12 6 12 12 16 14"></polyline>
							</svg>
							<span class="text-gray-700">
								{DateTime.fromJSDate(event.start).setZone(timeZone).toLocaleString(DateTime.TIME_SIMPLE)} - {DateTime.fromJSDate(event.end).setZone(timeZone).toLocaleString(DateTime.TIME_SIMPLE)}
							</span>
						</div>

						<!-- Location -->
						{#if event.location}
						<div class="flex items-center">
							<svg xmlns="http://www.w3.org/2000/svg" class="mr-2 h-5 w-5 text-gray-500" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
								<path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"></path>
								<circle cx="12" cy="10" r="3"></circle>
							</svg>
							<span class="text-gray-700">{event.location}</span>
						</div>
						{/if}

						<!-- Calendar -->
						{#if calendar}
						<div class="flex items-center">
							<svg xmlns="http://www.w3.org/2000/svg" class="mr-2 h-5 w-5 text-gray-500" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
								<path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"></path>
								<polyline points="9 22 9 12 15 12 15 22"></polyline>
							</svg>
							<span class="text-gray-700">{isFamilyEvent ? 'Family Calendar' : 'My Calendar'}</span>
						</div>
						{/if}

						<!-- Created Date -->
						<div class="flex items-center">
							<svg xmlns="http://www.w3.org/2000/svg" class="mr-2 h-5 w-5 text-gray-500" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
								<circle cx="12" cy="12" r="10"></circle>
								<line x1="12" y1="8" x2="12" y2="16"></line>
								<line x1="8" y1="12" x2="16" y2="12"></line>
							</svg>
							<span class="text-gray-700">Created {DateTime.fromJSDate(event.created_at).toLocaleString(DateTime.DATE_MED)}</span>
						</div>
					</div>

			<!-- Attendees -->
			{#if attendees.length > 0}
				<div>
					<h3 class="mb-2 text-lg font-semibold text-gray-800">Attendees ({attendees.length})</h3>
					<div class="space-y-2">
						{#each attendees as attendee (attendee.id)}
							<div class="flex items-center justify-between rounded-lg bg-gray-50 px-3 py-2">
								<span class="text-sm text-gray-700">{displayName(attendee)}</span>
								<span class="rounded-full px-2 py-1 text-xs font-medium {
									attendee.status === 'going' ? 'bg-green-100 text-green-800' :
									attendee.status === 'maybe' ? 'bg-yellow-100 text-yellow-800' :
									attendee.status === 'not_going' || attendee.status === 'declined' ? 'bg-red-100 text-red-800' :
									'bg-gray-100 text-gray-800'
								}">{attendee.status === 'declined' ? 'not going' : attendee.status}</span>
							</div>
						{/each}
					</div>
				</div>
				{/if}
				</div>

				<!-- Description -->
				{#if event.description}
				<div class="mb-6">
					<h2 class="mb-2 text-lg font-semibold text-gray-800">Description</h2>
					<p class="text-gray-700">{event.description}</p>
				</div>
				{/if}

			<!-- RSVP Section -->
			{#if isFamilyEvent}
			<div class="mb-6 border-t pt-6">
				<div class="mb-3 flex items-center justify-between">
					<h3 class="text-lg font-semibold text-gray-800">Your RSVP</h3>
					{#if rsvpStatus !== 'undecided'}
						<span class="text-xs text-gray-400">tap again to clear</span>
					{/if}
				</div>
				<div role="group" aria-label="Your RSVP" class="flex overflow-hidden rounded-xl border border-gray-200 bg-gray-50 p-1">
					{#each RSVP_OPTIONS as option (option.status)}
						{@const active = rsvpStatus === option.status}
						<button
							type="button"
							onclick={() => setRsvp(option.status)}
							disabled={rsvpPending}
							aria-pressed={active}
							class="flex flex-1 items-center justify-center gap-1.5 rounded-lg px-2 py-2.5 text-sm font-medium transition-all disabled:opacity-60 {
								option.status === 'going'
									? active
										? 'bg-green-600 text-white shadow-md shadow-green-600/30'
										: 'text-green-700 hover:bg-green-100/70'
									: option.status === 'maybe'
										? active
											? 'bg-yellow-500 text-white shadow-md shadow-yellow-500/30'
											: 'text-yellow-700 hover:bg-yellow-100/70'
										: active
											? 'bg-red-600 text-white shadow-md shadow-red-600/30'
											: 'text-red-700 hover:bg-red-100/70'
							}"
						>
							{option.label}
							{#if counts[option.status] > 0}
								<span class="rounded-full px-1.5 py-0.5 text-[10px] font-bold {active ? 'bg-white/25' : 'bg-gray-200 text-gray-600'}">
									{counts[option.status]}
								</span>
							{/if}
						</button>
					{/each}
				</div>
			</div>
			{/if}

				<!-- Action Buttons -->
				<div class="flex flex-wrap gap-3 border-t pt-6">
					<a
						href="/calendar?edit={event.id}"
						class="flex items-center rounded-md bg-primary-600 px-4 py-2 text-sm font-medium text-white hover:bg-primary-700"
					>
						<svg xmlns="http://www.w3.org/2000/svg" class="mr-2 h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
							<path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path>
							<path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path>
						</svg>
						Edit Event
					</a>

					{#if !showDeleteConfirm}
					<button
						type="button"
						onclick={() => showDeleteConfirm = true}
						class="flex items-center rounded-md border border-red-300 bg-white px-4 py-2 text-sm font-medium text-red-600 hover:bg-red-50"
					>
						<svg xmlns="http://www.w3.org/2000/svg" class="mr-2 h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
							<polyline points="3 6 5 6 21 6"></polyline>
							<path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
						</svg>
						Delete Event
					</button>
					{:else}
					<div class="flex items-center gap-2">
						<span class="text-sm text-red-600">Delete this event?</span>
						<form action="?/deleteEvent" method="POST" use:enhance={() => {
							return async ({ update }) => {
								await update();
							};
						}} class="inline">
							<input type="text" value={event.id} class="hidden" name="eventId" />
							<button
								type="submit"
								class="rounded-md bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700"
							>
								Confirm Delete
							</button>
						</form>
						<button
							type="button"
							onclick={() => showDeleteConfirm = false}
							class="rounded-md border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
						>
							Cancel
						</button>
					</div>
					{/if}
				</div>
			</div>
		</div>
	</div>
</div>
