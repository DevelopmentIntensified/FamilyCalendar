<script lang="ts">
	import { enhance } from '$app/forms';
	import type { PageData, ActionData } from './$types';
	import { onMount } from 'svelte';

	export let data: PageData;
	export let form: ActionData;

	let allDay = false;
	let startDate = '';
	let startTime = '';
	let endDate = '';
	let endTime = '';

	onMount(() => {
		const now = new Date();
		now.setMinutes(now.getMinutes() - now.getTimezoneOffset());
		const tomorrow = new Date(now);
		tomorrow.setDate(tomorrow.getDate() + 1);
		
		startDate = now.toISOString().split('T')[0];
		startTime = '09:00';
		endDate = tomorrow.toISOString().split('T')[0];
		endTime = '10:00';
	});

	function handleSubmit(e: Event) {
		const form = e.target as HTMLFormElement;
		
		if (allDay) {
			form.start.value = startDate + 'T00:00:00';
			const endD = new Date(endDate);
			endD.setDate(endD.getDate() + 1);
			form.end.value = endD.toISOString().split('T')[0] + 'T00:00:00';
		} else {
			form.start.value = startDate + 'T' + startTime + ':00';
			form.end.value = endDate + 'T' + endTime + ':00';
		}
	}
</script>

<svelte:head>
	<title>New Event - Family Planz</title>
</svelte:head>

<div class="min-h-screen bg-slate-50 px-4 py-8 pt-20">
	<div class="mx-auto max-w-2xl">
		<div class="mb-6">
			<a href="/calendar" class="text-primary-600 hover:text-primary-700 flex items-center gap-2 text-sm font-medium">
				<svg class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
					<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 19l-7-7 7-7" />
				</svg>
				Back to Calendar
			</a>
		</div>

		<div class="overflow-hidden rounded-xl bg-white shadow-lg">
			<div class="bg-gradient-to-r from-primary-500 to-primary-600 px-6 py-5">
				<h1 class="text-2xl font-bold text-white">Create New Event</h1>
				<p class="mt-1 text-primary-100">Add an event to your calendar</p>
			</div>
			
			<form action="?/createEvent" method="POST" use:enhance={handleSubmit} class="space-y-6 p-6">
				<input type="hidden" name="ownerId" value={data.user.id} />
				<input type="hidden" name="start" value="" />
				<input type="hidden" name="end" value="" />

				<div>
					<label for="title" class="block text-sm font-medium text-slate-700">Event Title *</label>
					<input
						type="text"
						id="title"
						name="title"
						required
						placeholder="e.g., Family Dinner, Doctor Appointment"
						class="mt-1 block w-full rounded-lg border border-slate-300 px-4 py-3 shadow-sm focus:border-primary-500 focus:outline-none focus:ring-2 focus:ring-primary-500"
					/>
				</div>

				<div class="flex items-center gap-3">
					<input
						type="checkbox"
						id="allDay"
						bind:checked={allDay}
						class="h-4 w-4 rounded border-slate-300 text-primary-600 focus:ring-primary-500"
					/>
					<label for="allDay" class="text-sm font-medium text-slate-700">All day event</label>
				</div>

				<div class="grid gap-4 sm:grid-cols-2">
					<div>
						<label for="startDate" class="block text-sm font-medium text-slate-700">Start {allDay ? 'Date' : 'Date & Time'}</label>
						<div class="mt-1 flex gap-2">
							<input
								type="date"
								id="startDate"
								bind:value={startDate}
								required
								class="flex-1 rounded-lg border border-slate-300 px-3 py-2 shadow-sm focus:border-primary-500 focus:outline-none focus:ring-2 focus:ring-primary-500"
							/>
							{#if !allDay}
								<input
									type="time"
									id="startTime"
									bind:value={startTime}
									required
									class="w-28 rounded-lg border border-slate-300 px-3 py-2 shadow-sm focus:border-primary-500 focus:outline-none focus:ring-2 focus:ring-primary-500"
								/>
							{/if}
						</div>
					</div>

					<div>
						<label for="endDate" class="block text-sm font-medium text-slate-700">End {allDay ? 'Date' : 'Date & Time'}</label>
						<div class="mt-1 flex gap-2">
							<input
								type="date"
								id="endDate"
								bind:value={endDate}
								required
								class="flex-1 rounded-lg border border-slate-300 px-3 py-2 shadow-sm focus:border-primary-500 focus:outline-none focus:ring-2 focus:ring-primary-500"
							/>
							{#if !allDay}
								<input
									type="time"
									id="endTime"
									bind:value={endTime}
									required
									class="w-28 rounded-lg border border-slate-300 px-3 py-2 shadow-sm focus:border-primary-500 focus:outline-none focus:ring-2 focus:ring-primary-500"
								/>
							{/if}
						</div>
					</div>
				</div>

				<div>
					<label for="location" class="block text-sm font-medium text-slate-700">Location</label>
					<input
						type="text"
						id="location"
						name="location"
						placeholder="e.g., Home, 123 Main St, or video call link"
						class="mt-1 block w-full rounded-lg border border-slate-300 px-4 py-3 shadow-sm focus:border-primary-500 focus:outline-none focus:ring-2 focus:ring-primary-500"
					/>
				</div>

				<div>
					<label for="description" class="block text-sm font-medium text-slate-700">Description</label>
					<textarea
						id="description"
						name="description"
						rows="3"
						placeholder="Add details about your event..."
						class="mt-1 block w-full rounded-lg border border-slate-300 px-4 py-3 shadow-sm focus:border-primary-500 focus:outline-none focus:ring-2 focus:ring-primary-500"
					></textarea>
				</div>

				<div>
					<label for="calendarId" class="block text-sm font-medium text-slate-700">Calendar</label>
					<select
						id="calendarId"
						name="calendarId"
						value={data.userSettings.defaultCalendarId || data.calendarIds[0]?.id}
						class="mt-1 block w-full rounded-lg border border-slate-300 px-4 py-3 shadow-sm focus:border-primary-500 focus:outline-none focus:ring-2 focus:ring-primary-500"
					>
						{#each data.calendarIds as calendar}
							<option value={calendar.id}>{calendar.name}</option>
						{/each}
					</select>
				</div>

				{#if form?.message}
					<div class="rounded-lg bg-red-50 p-4 text-sm text-red-600">
						{form.message}
					</div>
				{/if}

				<div class="flex gap-3 pt-2">
					<a
						href="/calendar"
						class="flex-1 rounded-lg border border-slate-300 bg-white px-4 py-3 text-center text-sm font-medium text-slate-700 hover:bg-slate-50"
					>
						Cancel
					</a>
					<button
						type="submit"
						class="flex-1 rounded-lg bg-primary-600 px-4 py-3 text-center text-sm font-medium text-white shadow-sm hover:bg-primary-700"
					>
						Create Event
					</button>
				</div>
			</form>
		</div>
	</div>
</div>
