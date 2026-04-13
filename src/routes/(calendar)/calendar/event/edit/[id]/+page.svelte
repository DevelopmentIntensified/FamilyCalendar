<script lang="ts">
	import { enhance } from '$app/forms';
	import type { PageData, ActionData } from './$types';
	import { DateTime } from 'luxon';

	export let data: PageData;
	export let form: ActionData;

	function formatDateTimeForInput(dateStr: string | Date): string {
		const dt = typeof dateStr === 'string' ? DateTime.fromISO(dateStr) : DateTime.fromJSDate(dateStr);
		return dt.toFormat("yyyy-MM-dd'T'HH:mm");
	}

	let showDeleteConfirm = false;
</script>

<svelte:head>
	<title>Family Planz: Edit Event</title>
</svelte:head>

<div class="mb-16 min-h-screen bg-gray-100 px-4 py-12 pt-20 sm:px-6 lg:px-8">
	<div class="mx-auto max-w-3xl">
		<div class="overflow-hidden rounded-lg bg-white shadow-xl">
			<div class="bg-primary-600 px-4 py-6 sm:px-6">
				<h2 class="text-center text-3xl font-extrabold text-white">Edit Event</h2>
			</div>
			<div class="p-6 sm:p-8">
				<form action="?/default" method="POST" use:enhance class="space-y-6">
					<input type="text" value={data.user.id} class="hidden" name="ownerId" />
					<input type="text" value={data.event.id} class="hidden" name="eventId" />
					<div>
						<label for="title" class="block text-sm font-medium text-gray-700">Title</label>
						<input
							type="text"
							id="title"
							name="title"
							value={data.event.title}
							required
							class="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 shadow-sm focus:border-primary-500 focus:outline-none focus:ring-primary-500 sm:text-sm"
						/>
					</div>
					<div>
						<label for="start" class="block text-sm font-medium text-gray-700"
							>Start Date and Time</label
						>
						<input
							type="datetime-local"
							id="start"
							name="start"
							value={formatDateTimeForInput(data.event.start)}
							required
							class="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 shadow-sm focus:border-primary-500 focus:outline-none focus:ring-primary-500 sm:text-sm"
						/>
					</div>
					<div>
						<label for="end" class="block text-sm font-medium text-gray-700"
							>End Date and Time</label
						>
						<input
							type="datetime-local"
							id="end"
							name="end"
							value={formatDateTimeForInput(data.event.end)}
							required
							class="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 shadow-sm focus:border-primary-500 focus:outline-none focus:ring-primary-500 sm:text-sm"
						/>
					</div>
					<div>
						<label for="location" class="block text-sm font-medium text-gray-700">Location</label>
						<input
							type="text"
							id="location"
							name="location"
							value={data.event.location}
							required
							class="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 shadow-sm focus:border-primary-500 focus:outline-none focus:ring-primary-500 sm:text-sm"
						/>
					</div>
					<div>
						<label for="description" class="block text-sm font-medium text-gray-700"
							>Description</label
						>
						<input
							type="text"
							id="description"
							name="description"
							value={data.event.description || ''}
							required
							class="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 shadow-sm focus:border-primary-500 focus:outline-none focus:ring-primary-500 sm:text-sm"
						/>
					</div>
					<div>
						<label for="calendarId" class="block text-sm font-medium text-gray-700">Calendar</label>
						<select
							id="calendarId"
							name="calendarId"
							value={data.event.calendarId || data.calendarIds[0]?.id}
							class="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 shadow-sm focus:border-primary-500 focus:outline-none focus:ring-primary-500 sm:text-sm"
						>
							{#each data.calendarIds as calendar}
								<option value={calendar.id}>{calendar.name}</option>
							{/each}
						</select>
					</div>

					{#if form?.message}
						<div class="text-sm text-red-500">{form.message}</div>
					{/if}
					<div>
						<button
							type="submit"
							class="flex w-full justify-center rounded-md border border-transparent bg-primary-600 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-primary-700 focus:outline-none focus:ring-2 focus:ring-primary-500 focus:ring-offset-2"
						>
							Save Changes
						</button>
					</div>
				</form>

				<div class="mt-6 border-t pt-6">
					{#if !showDeleteConfirm}
						<button
							type="button"
							on:click={() => showDeleteConfirm = true}
							class="flex w-full justify-center rounded-md border border-red-300 bg-white px-4 py-2 text-sm font-medium text-red-600 shadow-sm hover:bg-red-50 focus:outline-none focus:ring-2 focus:ring-red-500 focus:ring-offset-2"
						>
							Delete Event
						</button>
					{:else}
						<div class="rounded-md bg-red-50 p-4">
							<p class="mb-3 text-sm text-red-800">Are you sure you want to delete this event? This action cannot be undone.</p>
							<div class="flex gap-3">
								<form action="?/deleteEvent" method="POST" use:enhance class="flex-1">
									<input type="text" value={data.event.id} class="hidden" name="eventId" />
									<button
										type="submit"
										class="flex w-full justify-center rounded-md border border-transparent bg-red-600 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-red-700 focus:outline-none focus:ring-2 focus:ring-red-500 focus:ring-offset-2"
									>
										Yes, Delete
									</button>
								</form>
								<button
									type="button"
									on:click={() => showDeleteConfirm = false}
									class="flex-1 rounded-md border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 shadow-sm hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-primary-500 focus:ring-offset-2"
								>
									Cancel
								</button>
							</div>
						</div>
					{/if}
				</div>
			</div>
		</div>
	</div>
</div>
