<script lang="ts">
	import { enhance } from '$app/forms';
	import { fly, fade } from 'svelte/transition';

	let {
		show = $bindable(false),
		ownerId = '',
		calendarId = '',
		onCreated = () => {}
	}: {
		show?: boolean;
		ownerId?: string;
		calendarId?: string;
		onCreated?: () => void;
	} = $props();

	let title = '';
	let allDay = true;
	let startDate = new Date().toISOString().split('T')[0];
	let startTime = '09:00';
	let endDate = startDate;
	let endTime = '10:00';
	let location = '';
	let description = '';
	let loading = false;

	function reset() {
		title = '';
		allDay = true;
		startDate = new Date().toISOString().split('T')[0];
		startTime = '09:00';
		endDate = startDate;
		endTime = '10:00';
		location = '';
		description = '';
	}

	function handleClose() {
		show = false;
		reset();
	}

	async function handleSubmit(e: Event) {
		e.preventDefault();
		if (!title.trim() || !ownerId) return;

		loading = true;
		try {
			const endDateTime = allDay ? startDate : `${endDate}T${endTime}`;
			const startDateTime = `${startDate}T${startTime}`;

			const res = await fetch('/api/events', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					title: title.trim(),
					start: startDateTime,
					end: endDateTime,
					location: location || null,
					description: description || null,
					allDay,
					calendarId: calendarId || undefined
				})
			});

			if (res.ok) {
				onCreated();
				handleClose();
			}
		} catch (err) {
			console.error('Quick create failed:', err);
		} finally {
			loading = false;
		}
	}
</script>

{#if show}
	<div class="fixed inset-0 z-50 flex items-center justify-center p-4" transition:fade={{ duration: 150 }}>
		<button class="absolute inset-0 bg-black/50" onclick={handleClose} aria-label="Close quick create"></button>
		
		<div class="relative w-full max-w-md rounded-xl bg-white shadow-2xl" transition:fly={{ y: 20, duration: 200 }}>
			<div class="rounded-t-xl bg-gradient-to-r from-primary-500 to-primary-600 px-6 py-4">
				<h2 class="text-xl font-bold text-white">Quick Create Event</h2>
			</div>
			
			<form on:submit={handleSubmit} class="space-y-4 p-6">
				<div>
					<input
						type="text"
						bind:value={title}
						placeholder="What's the event?"
						required
						autofocus
						class="w-full rounded-lg border-2 border-slate-200 px-4 py-3 text-lg font-medium placeholder:text-slate-400 focus:border-primary-500 focus:outline-none"
					/>
				</div>

				<div class="flex items-center gap-2">
					<input type="checkbox" id="quickAllDay" bind:checked={allDay} class="h-4 w-4 rounded text-primary-600" />
					<label for="quickAllDay" class="text-sm font-medium text-slate-700">All day</label>
				</div>

				<div class="grid grid-cols-2 gap-3">
					<div>
						<label for="quickStartDate" class="block text-xs font-medium text-slate-500">Start</label>
						<input type="date" id="quickStartDate" bind:value={startDate} class="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm" />
					</div>
					{#if !allDay}
						<div>
							<label for="quickStartTime" class="block text-xs font-medium text-slate-500">Time</label>
							<input type="time" id="quickStartTime" bind:value={startTime} class="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm" />
						</div>
					{/if}
				</div>

				<div class="flex gap-3 pt-2">
					<button
						type="button"
						onclick={handleClose}
						class="flex-1 rounded-lg border border-slate-200 bg-white px-4 py-2.5 text-sm font-medium text-slate-700 hover:bg-slate-50"
					>
						Cancel
					</button>
					<button
						type="submit"
						disabled={loading || !title.trim()}
						class="flex-1 rounded-lg bg-primary-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-primary-700 disabled:opacity-50"
					>
						{loading ? 'Creating...' : 'Create Event'}
					</button>
				</div>
			</form>
		</div>
	</div>
{/if}
