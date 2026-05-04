<script lang="ts">
	import { enhance } from '$app/forms';
	import { goto } from '$app/navigation';
	import { DateTime } from 'luxon';

	export let data;
	const event = data.event;
	const currentAttendance = data.userAttendance;
	const timeZone = data.userSettings?.timeZone || Intl.DateTimeFormat().resolvedOptions().timeZone;
	const isFamilyEvent = data.isFamilyEvent;

	let showDeleteConfirm = false;
	let rsvpStatus = currentAttendance;

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
		<button on:click={goBack} class="mb-4 flex items-center text-primary-600 hover:text-primary-700">
			<svg
				xmlns="http://www.w3.org/2000/svg"
				class="mr-1 h-5 w-5"
				viewBox="0 0 24 24"
				fill="none"
				stroke="currentColor"
				stroke-width="2"
				stroke-linecap="round"
				stroke-linejoin="round"><polyline points="15 18 9 12 15 6"></polyline></svg
			>
			Back to Calendar
		</button>
		<div class="overflow-hidden rounded-lg bg-white shadow-xl">
			<div class="bg-primary-600 px-4 py-6 sm:px-6">
				<h1 class="text-center text-3xl font-extrabold text-white">{event.title}</h1>
			</div>
			<div class="p-6 sm:p-8">
				<div class="mb-6 grid grid-cols-1 gap-4 md:grid-cols-2">
					<div class="space-y-3">
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
						<div class="flex items-center">
							<svg xmlns="http://www.w3.org/2000/svg" class="mr-2 h-5 w-5 text-gray-500" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
								<circle cx="12" cy="12" r="10"></circle>
								<polyline points="12 6 12 12 16 14"></polyline>
							</svg>
							<span class="text-gray-700">
								{DateTime.fromJSDate(event.start).setZone(timeZone).toLocaleString(DateTime.TIME_SIMPLE)} - {DateTime.fromJSDate(event.end).setZone(timeZone).toLocaleString(DateTime.TIME_SIMPLE)}
							</span>
						</div>
						<div class="flex items-center">
							<svg xmlns="http://www.w3.org/2000/svg" class="mr-2 h-5 w-5 text-gray-500" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
								<path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"></path>
								<circle cx="12" cy="10" r="3"></circle>
							</svg>
							<span class="text-gray-700">{event.location}</span>
						</div>
					</div>
					<div>
						<h2 class="mb-2 text-lg font-semibold text-gray-800">Description</h2>
						<p class="text-gray-700">{event.description || 'No description provided.'}</p>
					</div>
				</div>

				{#if isFamilyEvent}
					<div class="border-t pt-6">
						<h3 class="mb-3 text-lg font-semibold text-gray-800">Your RSVP</h3>
						<div class="flex flex-wrap gap-2">
							<form action="?/rsvp" method="POST" use:enhance={handleRsvp} class="inline">
								<input type="text" value={event.id} class="hidden" name="eventId" />
								<input type="text" value="going" class="hidden" name="status" />
								<button
									type="submit"
									class="rounded-md px-4 py-2 text-sm font-medium transition-colors {rsvpStatus === 'going' ? 'bg-green-600 text-white' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'}"
								>
									Going
								</button>
							</form>
							<form action="?/rsvp" method="POST" use:enhance={handleRsvp} class="inline">
								<input type="text" value={event.id} class="hidden" name="eventId" />
								<input type="text" value="maybe" class="hidden" name="status" />
								<button
									type="submit"
									class="rounded-md px-4 py-2 text-sm font-medium transition-colors {rsvpStatus === 'maybe' ? 'bg-yellow-500 text-white' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'}"
								>
									Maybe
								</button>
							</form>
							<form action="?/rsvp" method="POST" use:enhance={handleRsvp} class="inline">
								<input type="text" value={event.id} class="hidden" name="eventId" />
								<input type="text" value="not_going" class="hidden" name="status" />
								<button
									type="submit"
									class="rounded-md px-4 py-2 text-sm font-medium transition-colors {rsvpStatus === 'not_going' ? 'bg-red-600 text-white' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'}"
								>
									Not Going
								</button>
							</form>
						</div>
					</div>
				{/if}

				<div class="mt-6 flex flex-wrap gap-3 border-t pt-6">
					<a
						href="/calendar/event/edit/{event.id}"
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
							on:click={() => showDeleteConfirm = true}
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
							<form action="?/deleteEvent" method="POST" use:enhance class="inline">
								<input type="text" value={event.id} class="hidden" name="eventId" />
								<button
									type="submit"
									class="rounded-md bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700"
								>
									Confirm
								</button>
							</form>
							<button
								type="button"
								on:click={() => showDeleteConfirm = false}
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
