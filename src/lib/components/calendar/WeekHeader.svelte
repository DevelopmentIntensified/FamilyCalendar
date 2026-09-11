<script lang="ts">
	import type { DateTime } from 'luxon';

	interface Props {
		weekDays: DateTime[];
		isToday: (day: DateTime) => boolean;
		openDay: (day: DateTime) => void;
	}

	let { weekDays, isToday, openDay }: Props = $props();
</script>

<!-- Week Header (#046 split: pure markup out of WeekView) -->
<div class="sticky top-0 z-10 grid grid-cols-8 border-b border-slate-200 bg-slate-50">
	<div class="w-14 shrink-0 border-r border-slate-200"></div>
	{#each weekDays as wd}
		<div class="flex-1 border-r border-slate-100 last:border-r-0">
			<button
				type="button"
				class="w-full py-2 text-center transition-colors hover:bg-slate-100 active:bg-slate-200"
				onclick={() => openDay(wd)}
				aria-label="Open {wd.toFormat('EEEE, MMMM d')}"
			>
				<div
					class="text-xs font-medium uppercase text-slate-500 {isToday(wd)
						? 'text-primary-600'
						: ''}"
				>
					{wd.toFormat('EEE')}
				</div>
				<div
					class="text-lg font-semibold {isToday(wd) ? 'text-primary-600' : 'text-slate-900'}"
				>
					{wd.day}
				</div>
			</button>
		</div>
	{/each}
</div>
