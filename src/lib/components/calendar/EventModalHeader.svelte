<script lang="ts">
	import type { Event } from '$lib/types';
	import { freqNoun } from '$lib/utils/taskDisplay';
	import EventExportMenu from './EventExportMenu.svelte';

	interface Props {
		event: Event;
		onClose: () => void;
	}

	let { event, onClose }: Props = $props();

	function recurrenceLabel(): string {
		if (!event.recurrenceFrequency) return '';
		const unit = freqNoun(event.recurrenceFrequency) ?? '';
		if ((event.recurrenceInterval ?? 1) > 1) return `every ${event.recurrenceInterval} ${unit}s`;
		if (unit === 'day') return 'daily';
		return unit ? `${unit}ly` : '';
	}
</script>

<div
	class="flex shrink-0 items-center justify-between gap-2 border-b border-slate-100 px-4 py-3 sm:px-6 sm:py-4"
>
	<div class="flex min-w-0 flex-1 items-center gap-3">
		<div
			class="h-3 w-3 shrink-0 rounded-full"
			style="background-color: {event.color || '#94a3b8'}"
		></div>
		<div class="min-w-0">
			<h2 class="truncate text-lg font-bold text-slate-900 sm:text-xl" title={event.title}>
				{event.title}
			</h2>
			{#if event.recurrenceFrequency}
				<p class="text-xs font-medium text-purple-600">
					🔁 Repeats {recurrenceLabel()}
				</p>
			{/if}
		</div>
	</div>
	<div class="flex shrink-0 items-center">
		{#if !event.isAd}
			<EventExportMenu {event} />
		{/if}
		<button
			type="button"
			onclick={onClose}
			class="flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-600"
			aria-label="Close"
		>
			<svg class="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
				<path
					stroke-linecap="round"
					stroke-linejoin="round"
					stroke-width="2"
					d="M6 18L18 6M6 6l12 12"
				/>
			</svg>
		</button>
	</div>
</div>
