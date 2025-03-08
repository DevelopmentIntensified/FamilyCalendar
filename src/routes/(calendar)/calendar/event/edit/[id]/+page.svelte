<script lang="ts">
	import { enhance } from '$app/forms';
	import type { PageData } from './$types';

	let error = '';
	export let data: PageData;
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
				<form action="?/editEvent" method="POST" use:enhance class="space-y-6">
					<input type="text" value={data.user.id} class="hidden" name="ownerId" />
					<input type="text" value={data.eventId} class="hidden" name="eventId" />
					<div>
						<label for="title" class="block text-sm font-medium text-gray-700">Title</label>
						<input
							type="text"
							id="title"
							name="title"
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
							required
							class="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 shadow-sm focus:border-primary-500 focus:outline-none focus:ring-primary-500 sm:text-sm"
						/>
					</div>
					<div>
						<label for="description" class="block text-sm font-medium text-gray-700"
							>description</label
						>
						<input
							type="text"
							id="description"
							name="description"
							required
							class="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 shadow-sm focus:border-primary-500 focus:outline-none focus:ring-primary-500 sm:text-sm"
						/>
					</div>
					<div>
						<label for="calendarId" class="block text-sm font-medium text-gray-700">Calendar</label>
						<select
							id="calendarId"
							name="calendarId"
							value={data.userSettings.defaultCalendarId || data.calendarIds[0].id}
							class="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 shadow-sm focus:border-primary-500 focus:outline-none focus:ring-primary-500 sm:text-sm"
						>
							{#each data.calendarIds as calendar}
								<option value={calendar.id}>{calendar.name}</option>
							{/each}
						</select>
					</div>

					{#if error}
						<div class="text-sm text-red-500">{error}</div>
					{/if}
					<div>
						<button
							type="submit"
							class="flex w-full justify-center rounded-md border border-transparent bg-primary-600 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-primary-700 focus:outline-none focus:ring-2 focus:ring-primary-500 focus:ring-offset-2"
						>
							Save
						</button>
					</div>
				</form>
			</div>
		</div>
	</div>
</div>
