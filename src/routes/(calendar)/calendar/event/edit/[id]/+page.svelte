<script lang="ts">
	import { enhance } from '$app/forms';
	import type { PageData, ActionData } from './$types';
	import { DateTime } from 'luxon';

	export let data: PageData;
	export let form: ActionData;

	function formatDateForInput(dateStr: string | Date): string {
		const dt = typeof dateStr === 'string' ? DateTime.fromISO(dateStr) : DateTime.fromJSDate(dateStr);
		return dt.toFormat('yyyy-MM-dd');
	}

	function formatTimeForInput(dateStr: string | Date): string {
		const dt = typeof dateStr === 'string' ? DateTime.fromISO(dateStr) : DateTime.fromJSDate(dateStr);
		return dt.toFormat('HH:mm');
	}

	const event = data.event;
	const eventStart = typeof event.start === 'string' ? DateTime.fromISO(event.start) : DateTime.fromJSDate(event.start);
	const eventEnd = typeof event.end === 'string' ? DateTime.fromISO(event.end) : DateTime.fromJSDate(event.end);
	
	let allDay = event.allDay ?? false;
	let startDate = formatDateForInput(event.start);
	let startTime = formatTimeForInput(event.start);
	let endDate = formatDateForInput(event.end);
	let endTime = formatTimeForInput(event.end);

	let showDeleteConfirm = false;

	function handleSubmit() {
		const form = document.querySelector('form') as HTMLFormElement;
		
		if (allDay) {
			const startVal = startDate + 'T00:00:00';
			const endD = new Date(endDate);
			endD.setDate(endD.getDate() + 1);
			const endVal = endD.toISOString().split('T')[0] + 'T00:00:00';
			(form.querySelector('input[name="start"]') as HTMLInputElement).value = startVal;
			(form.querySelector('input[name="end"]') as HTMLInputElement).value = endVal;
		} else {
			const startVal = startDate + 'T' + startTime + ':00';
			const endVal = endDate + 'T' + endTime + ':00';
			(form.querySelector('input[name="start"]') as HTMLInputElement).value = startVal;
			(form.querySelector('input[name="end"]') as HTMLInputElement).value = endVal;
		}
	}
</script>

<svelte:head>
	<title>Edit Event - Family Planz</title>
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
				<h1 class="text-2xl font-bold text-white">Edit Event</h1>
				<p class="mt-1 text-primary-100">Update your event details</p>
			</div>
			
			<form action="?/default" method="POST" use:enhance={() => {
				return async ({ update }) => {
					handleSubmit();
					await update();
				};
			}} class="space-y-6 p-6">
				<input type="hidden" name="ownerId" value={data.user.id} />
				<input type="hidden" name="eventId" value={event.id} />
				<input type="hidden" name="start" value="" />
				<input type="hidden" name="end" value="" />

				<div>
					<label for="title" class="block text-sm font-medium text-slate-700">Event Title *</label>
					<input
						type="text"
						id="title"
						name="title"
						value={event.title}
						required
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
						value={event.location || ''}
						placeholder="e.g., Home, 123 Main St"
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
					>{event.description || ''}</textarea>
				</div>

				<div>
					<label for="calendarId" class="block text-sm font-medium text-slate-700">Calendar</label>
					<select
						id="calendarId"
						name="calendarId"
						value={event.calendarId || data.calendarIds[0]?.id}
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
						Save Changes
					</button>
				</div>
			</form>

			<div class="border-t border-slate-200 px-6 py-6">
				{#if !showDeleteConfirm}
					<button
						type="button"
						on:click={() => showDeleteConfirm = true}
						class="flex w-full items-center justify-center gap-2 rounded-lg border border-red-300 bg-white px-4 py-3 text-sm font-medium text-red-600 hover:bg-red-50"
					>
						<svg class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
							<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
						</svg>
						Delete Event
					</button>
				{:else}
					<div class="rounded-lg bg-red-50 p-4">
						<p class="mb-3 text-sm text-red-800">Are you sure you want to delete this event? This action cannot be undone.</p>
						<div class="flex gap-3">
							<form action="?/deleteEvent" method="POST" use:enhance={() => {
								return async ({ update }) => {
									await update();
								};
							}} class="flex-1">
								<input type="hidden" name="eventId" value={event.id} />
								<button
									type="submit"
									class="w-full rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700"
								>
									Yes, Delete
								</button>
							</form>
							<button
								type="button"
								on:click={() => showDeleteConfirm = false}
								class="flex-1 rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
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
