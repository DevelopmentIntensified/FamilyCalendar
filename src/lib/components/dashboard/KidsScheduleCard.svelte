<script lang="ts">
	import { DateTime } from 'luxon';

	export let events: {
		id: string;
		title: string;
		start: string;
		end: string | null;
		allDay: boolean;
		location: string | null;
		kids: string[];
	}[];

	function timeLabel(e: (typeof events)[number]): string {
		if (e.allDay) return 'All day';
		const start = DateTime.fromISO(e.start);
		if (!start.isValid) return '';
		const end = e.end ? DateTime.fromISO(e.end) : null;
		const endLabel = end && end.isValid ? ` – ${end.toFormat('h:mm a')}` : '';
		return `${start.toFormat('h:mm a')}${endLabel}`;
	}

	function sortByStart(a: (typeof events)[number], b: (typeof events)[number]): number {
		if (a.allDay !== b.allDay) return a.allDay ? -1 : 1;
		return DateTime.fromISO(a.start).toMillis() - DateTime.fromISO(b.start).toMillis();
	}
</script>

<div class="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
	<h2 class="mb-3 text-sm font-semibold text-slate-900">Kids' Schedule</h2>

	{#if events.length === 0}
		<p class="rounded-lg border border-dashed border-slate-200 px-3 py-4 text-center text-sm text-slate-400">
			No kids' events today
		</p>
	{:else}
		<ul class="space-y-1.5">
			{#each [...events].sort(sortByStart) as event (event.id)}
				<li class="rounded-xl border border-slate-100 bg-slate-50/50 px-3 py-2.5">
					<div class="flex items-baseline justify-between gap-3">
						<p class="min-w-0 flex-1 truncate text-sm font-medium text-slate-900">
							{event.title}
						</p>
						<span class="shrink-0 text-[11px] font-semibold uppercase tracking-wide text-slate-400">
							{timeLabel(event)}
						</span>
					</div>
					{#if event.location}
						<p class="mt-0.5 truncate text-xs text-slate-500">{event.location}</p>
					{/if}
					<div class="mt-1.5 flex flex-wrap gap-1">
						{#each event.kids as kid (kid)}
							<span class="rounded-full bg-purple-100 px-2 py-0.5 text-[11px] font-semibold text-purple-700">
								{kid}
							</span>
						{/each}
					</div>
				</li>
			{/each}
		</ul>
	{/if}
</div>