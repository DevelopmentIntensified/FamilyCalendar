<script lang="ts">
	import { createEventForm } from './EventFormModel.svelte';

	interface Props {
		form: ReturnType<typeof createEventForm>;
		showMore: boolean;
		onShowMore: () => void;
	}

	let { form, showMore, onShowMore }: Props = $props();
</script>

<div>
	<label for="event-title" class="mb-1 block text-sm font-medium text-slate-700">
		Event Title {#if form.isDetected('title')}<span class="ml-1 text-emerald-600">✓</span>{/if}*
	</label>
	<input
		id="event-title"
		type="text"
		bind:value={form.title}
		on:input={() => form.markTouched('title')}
		placeholder="e.g., Family Dinner, Doctor Appointment"
		required
		class="mt-1 block w-full rounded-lg border border-slate-300 px-3 py-2 text-sm shadow-sm transition-all focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500"
	/>
</div>

<div>
	<label for="event-desc" class="mb-1 block text-sm font-medium text-slate-700">Description</label>
	<textarea
		id="event-desc"
		bind:value={form.description}
		on:input={() => form.markTouched('description')}
		placeholder="Add details..."
		rows="2"
		class="mt-1 block w-full resize-none rounded-lg border border-slate-300 px-3 py-2 text-sm shadow-sm focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500"
	></textarea>
</div>

{#if !form.isEditMode && !showMore}
	<button
		type="button"
		on:click={onShowMore}
		class="flex w-full items-center justify-center gap-1 rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm font-medium text-slate-700 shadow-sm transition-colors hover:bg-slate-50"
	>
		Show More
		<svg
			class="h-3.5 w-3.5 transition-transform"
			fill="none"
			viewBox="0 0 24 24"
			stroke="currentColor"
			stroke-width="2"
		>
			<path stroke-linecap="round" stroke-linejoin="round" d="M19 9l-7 7-7-7" />
		</svg>
	</button>
{/if}
