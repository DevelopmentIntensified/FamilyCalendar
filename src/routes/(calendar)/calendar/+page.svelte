<script lang="ts">
	import { enhance } from '$app/forms';
	import { fly, fade } from 'svelte/transition';
	import type { PageData } from './$types';

	export let data: PageData;

	let showModal = false;
	let title = '';
	let allDay = true;
	let startDate = new Date().toISOString().split('T')[0];
	let startTime = '09:00';
	let endDate = startDate;
	let endTime = '10:00';
	let loading = false;

	function openQuickAdd(date?: string, time?: string) {
		if (date) startDate = date;
		if (time) startTime = time;
		showModal = true;
	}

	function close() {
		showModal = false;
		title = '';
		allDay = true;
		startDate = new Date().toISOString().split('T')[0];
		startTime = '09:00';
	}

	function handleSubmit({ cancel }) {
		cancel();
		loading = true;
	}
</script>

<!-- Floating Quick Add Button -->
<button
	onclick={() => openQuickAdd()}
	class="fixed bottom-24 right-6 z-40 flex h-14 w-14 items-center justify-center rounded-full bg-primary-600 shadow-lg shadow-primary-300 hover:bg-primary-700 hover:scale-105 transition-all"
	title="Quick Add Event"
>
	<svg class="h-7 w-7 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
		<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M12 4v16m8-8H4" />
	</svg>
</button>

<!-- Quick Add Modal -->
{#if showModal}
	<div class="fixed inset-0 z-50 flex items-center justify-center p-4" transition:fade={{ duration: 100 }}>
		<button class="absolute inset-0 bg-black/40" onclick={close}></button>
		
		<div class="relative w-full max-w-lg rounded-2xl bg-white shadow-2xl" transition:fly={{ y: 10, duration: 150 }}>
			<form 
				method="POST" 
				action="/calendar/event/new?/createEvent" 
				use:enhance={() => {
					loading = true;
					return async ({ update }) => {
						await update();
						close();
					};
				}}
				class="p-6"
			>
				<div class="flex items-center justify-between mb-5">
					<h2 class="text-lg font-bold text-slate-900">New Event</h2>
					<button type="button" onclick={close} class="text-slate-400 hover:text-slate-600">
						<svg class="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
							<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
						</svg>
					</button>
				</div>

				<input type="hidden" name="start" value="" />
				<input type="hidden" name="end" value="" />
				<input type="hidden" name="ownerId" value={data.user.id} />
				<input type="hidden" name="calendarId" value={data.userSettings.defaultCalendarId || ''} />

				<input
					type="text"
					name="title"
					bind:value={title}
					placeholder="What's happening?"
					autofocus
					required
					class="mb-4 w-full rounded-xl border-2 border-slate-100 bg-slate-50 px-5 py-4 text-lg font-semibold placeholder:font-normal placeholder:text-slate-400 focus:border-primary-500 focus:bg-white focus:outline-none"
				/>

				<div class="mb-4 flex items-center gap-3">
					<label class="flex items-center gap-2 cursor-pointer">
						<input type="checkbox" bind:checked={allDay} class="h-4 w-4 rounded text-primary-600" />
						<span class="text-sm font-medium text-slate-700">All day</span>
					</label>
				</div>

				<div class="grid grid-cols-2 gap-3 mb-5">
					<div>
						<label class="block text-xs font-medium text-slate-500 mb-1">Date</label>
						<input type="date" bind:value={startDate} class="w-full rounded-lg border border-slate-200 px-3 py-2.5" />
					</div>
					{#if !allDay}
						<div>
							<label class="block text-xs font-medium text-slate-500 mb-1">Time</label>
							<div class="flex gap-2">
								<input type="time" bind:value={startTime} class="w-full rounded-lg border border-slate-200 px-3 py-2.5" />
							</div>
						</div>
					{/if}
				</div>

				<div class="flex gap-3">
					<button
						type="button"
						onclick={close}
						class="flex-1 rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 font-medium text-slate-700 hover:bg-slate-100"
					>
						Cancel
					</button>
					<button
						type="submit"
						disabled={loading || !title.trim()}
						class="flex-1 rounded-xl bg-primary-600 px-4 py-3 font-medium text-white hover:bg-primary-700 disabled:opacity-50"
					>
						{loading ? 'Creating...' : 'Create'}
					</button>
				</div>
			</form>
		</div>
	</div>
{/if}