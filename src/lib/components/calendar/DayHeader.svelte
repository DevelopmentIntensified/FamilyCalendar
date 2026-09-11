<script lang="ts">
	import type { DateTime } from 'luxon';
	import { formatDate } from '$lib/utils/dateUtils';

	interface Props {
		selectedDate: DateTime;
		today: DateTime;
		onBack: () => void;
	}

	let { selectedDate, today, onBack }: Props = $props();
</script>

<!-- Day Header (#046 split: pure markup out of DayView) -->
<div class="mb-4 flex items-center gap-3 border-b border-slate-200 pb-3">
	<button
		type="button"
		onclick={() => dispatch('back')}
		class="flex h-11 w-11 items-center justify-center rounded-lg border border-slate-200 text-slate-600 transition-colors hover:bg-slate-50"
		aria-label="Back"
	>
		<svg class="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
			<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 19l-7-7 7-7" />
		</svg>
	</button>
	<h2 class="text-xl font-semibold text-slate-900 sm:text-2xl">
		{selectedDate.toFormat('EEEE, MMMM d')}
		{#if formatDate(selectedDate) === formatDate(today)}
			<span
				class="ml-2 rounded-full bg-primary-100 px-2 py-0.5 align-middle text-xs font-medium text-primary-700"
				>Today</span
			>
		{/if}
	</h2>
</div>

