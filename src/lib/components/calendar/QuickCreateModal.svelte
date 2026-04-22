<script lang="ts">
	import { enhance } from '$app/forms';
	import { createEvent } from '$lib/components/calendar/QuickCreateModal.svelte';
	import { fly, fade } from 'svelte/transition';

	let { show = $bindable(false) }: { show?: boolean } = $props();

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
</script>

{#if show}
	<div class="fixed inset-0 z-50 flex items-center justify-center p-4" transition:fade={{ duration: 150 }}>
		<button class="absolute inset-0 bg-black/50" onclick={handleClose}></button>
		
		<div class="relative w-full max-w-md rounded-xl bg-white shadow-2xl" transition:fly={{ y: 20, duration: 200 }}>
			<div class="rounded-t-xl bg-gradient-to-r from-primary-500 to-primary-600 px-6 py-4">
				<h2 class="text-xl font-bold text-white">Quick Create Event</h2>
			</div>
			
			<form 
				method="POST" 
				action="/calendar/event/new?/createEvent" 
				use:enhance={() => {
					loading = true;
					return async ({ update }) => {
						await update();
						loading = false;
						handleClose();
						window.location.reload();
					};
				}}
				class="space-y-4 p-6"
			>
				<input type="hidden" name="ownerId" value="" />
				<input type="hidden" name="calendarId" value="" />
				
				<div>
					<input
						type="text"
						name="title"
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
						<label class="block text-xs font-medium text-slate-500">Start</label>
						<input type="date" name="startDate" bind:value={startDate} class="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm" />
					</div>
					{#if !allDay}
						<div>
							<label class="block text-xs font-medium text-slate-500">Time</label>
							<input type="time" name="startTime" bind:value={startTime} class="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm" />
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
