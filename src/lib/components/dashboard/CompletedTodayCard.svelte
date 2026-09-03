<script lang="ts">
	import { DateTime } from 'luxon';

	export let tasks: { id: string; title: string; completedAt: string | null }[] = [];
	export let isToday: boolean = true;

	function timeLabel(iso: string | null): string {
		if (!iso) return '';
		const dt = DateTime.fromISO(iso);
		return dt.isValid ? dt.toFormat('h:mm a') : '';
	}
</script>

<section class="rounded-2xl bg-white p-4 shadow-sm" aria-label={isToday ? 'Completed today' : 'Completed this day'}>
	<h2 class="text-sm font-semibold uppercase tracking-wide text-slate-500">
		{isToday ? 'Completed today' : 'Completed this day'}
	</h2>
	{#if tasks.length === 0}
		<p class="mt-2 text-sm text-slate-500">
			{isToday ? 'Nothing checked off yet — your wins will land here.' : 'Nothing was completed this day.'}
		</p>
	{:else}
		<p class="mt-1 text-2xl font-bold text-emerald-600">
			{tasks.length}
			<span class="text-sm font-medium text-slate-500">{tasks.length === 1 ? 'win' : 'wins'}</span>
		</p>
		<ul class="mt-2 divide-y divide-slate-100">
			{#each tasks as task (task.id)}
				<li class="flex items-center gap-2 py-1.5 text-sm text-slate-700">
					<span
						class="flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-emerald-500 text-white"
						aria-hidden="true"
					>
						<svg class="h-2.5 w-2.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="4">
							<path stroke-linecap="round" stroke-linejoin="round" d="M5 13l4 4L19 7" />
						</svg>
					</span>
					<span class="min-w-0 flex-1 truncate">{task.title}</span>
					{#if timeLabel(task.completedAt)}
						<span class="shrink-0 text-xs text-slate-400">{timeLabel(task.completedAt)}</span>
					{/if}
				</li>
			{/each}
		</ul>
	{/if}
</section>
