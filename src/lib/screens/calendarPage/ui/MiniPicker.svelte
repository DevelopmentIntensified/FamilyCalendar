<!--
	The date pill's leading segment: the month label IS the control (#120 marks
	1.16/1.17). Tapping it opens the mini month/year picker — a year stepper and
	the twelve months, three to a row (legacy `CalendarToolbar.svelte:240-350`).
-->
<script lang="ts">
	import type { DateTime } from 'luxon';

	interface Props {
		open: boolean;
		month: DateTime;
		months: readonly string[];
		onselectmonth: (month: number) => void;
		onselectyear: (year: number) => void;
		onclose: () => void;
	}

	let { open, month, months, onselectmonth, onselectyear, onclose }: Props = $props();
</script>

{#if open}
	<div
		data-testid="mini-picker"
		class="absolute left-1/2 top-full z-30 mt-2 w-64 -translate-x-1/2 rounded-xl border border-slate-200 bg-white p-4 shadow-xl"
	>
		<div class="mb-4 flex items-center justify-between">
			<button
				type="button"
				onclick={() => onselectyear(month.year - 1)}
				class="flex h-10 w-10 items-center justify-center rounded-lg text-slate-600 hover:bg-slate-100"
				aria-label="Previous year"
			>
				<svg class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
					<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 19l-7-7 7-7" />
				</svg>
			</button>
			<span class="font-semibold text-slate-900">{month.year}</span>
			<button
				type="button"
				onclick={() => onselectyear(month.year + 1)}
				class="flex h-10 w-10 items-center justify-center rounded-lg text-slate-600 hover:bg-slate-100"
				aria-label="Next year"
			>
				<svg class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
					<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7" />
				</svg>
			</button>
		</div>
		<div class="grid grid-cols-3 gap-2">
			{#each months as name, index (name)}
				<button
					type="button"
					onclick={() => {
						onselectmonth(index + 1);
						onclose();
					}}
					class="rounded-lg py-2 text-sm font-medium transition-colors {month.month === index + 1
						? 'bg-primary-600 text-white'
						: 'text-slate-700 hover:bg-slate-100'}"
				>
					{name.slice(0, 3)}
				</button>
			{/each}
		</div>
	</div>
{/if}
