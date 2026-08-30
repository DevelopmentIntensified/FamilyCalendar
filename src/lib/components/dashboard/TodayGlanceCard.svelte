<script lang="ts" context="module">
	import type { RSVPStatus } from '$lib/types';

	export type GlanceEvent = {
		id: string;
		masterId: string | null;
		title: string;
		description: string | null;
		start: Date | string;
		end: Date | string | null;
		date: Date | string;
		allDay: boolean;
		location: string | null;
		calendarId: string | null;
		color: string;
		source: 'own' | 'family';
		rsvpStatus?: RSVPStatus;
	};
</script>

<script lang="ts">
	import { rsvpVisual } from '$lib/utils/eventChip';

	export let dateLabel: string;
	export let events: GlanceEvent[];
	export let onEventClick: (event: GlanceEvent) => void = () => {};
	export let openToday: number;
	export let doneToday: number;
	export let weekStreak: number;
	export let isToday: boolean = true;

	$: allDayEvents = events.filter((e) => e.allDay);
	$: timedEvents = events
		.filter((e) => !e.allDay)
		.sort((a, b) => new Date(a.start).getTime() - new Date(b.start).getTime());

	function timeLabel(value: Date | string): string {
		const d = value instanceof Date ? value : new Date(value);
		if (isNaN(d.getTime())) return '';
		return d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
	}

	$: progress = openToday + doneToday > 0 ? doneToday / (doneToday + openToday) : 1;
</script>

<div class="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
	<div class="mb-3 flex items-baseline justify-between gap-2">
		<h2 class="text-sm font-semibold text-slate-900">{isToday ? 'Today at a Glance' : 'Day at a Glance'}</h2>
		<p class="text-xs text-slate-400">{dateLabel}</p>
	</div>

	{#if allDayEvents.length > 0}
		<div class="mb-3 space-y-1.5">
			{#each allDayEvents as e (e.id)}
				{@const rv = rsvpVisual(e.rsvpStatus)}
				<button
					type="button"
					onclick={() => onEventClick(e)}
					class="flex w-full items-center gap-2 rounded-lg border border-slate-100 bg-slate-50/60 px-3 py-1.5 text-left transition-colors hover:border-slate-200 hover:bg-slate-100 {rv?.containerClass ?? ''}">
					<span class="h-2 w-2 shrink-0 rounded-full" style:background={e.color}></span>
					<span class="min-w-0 flex-1 truncate text-sm text-slate-700">{e.title}</span>
					{#if rv}
						<span class="shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold {rv.badgeClass}">{rv.icon} {rv.label}</span>
					{/if}
					<span class="shrink-0 text-[11px] font-medium text-slate-400">All day</span>
				</button>
			{/each}
		</div>
	{/if}

	{#if timedEvents.length > 0}
		<div class="space-y-1.5">
			{#each timedEvents as e (e.id)}
				{@const rv = rsvpVisual(e.rsvpStatus)}
				<button
					type="button"
					onclick={() => onEventClick(e)}
					class="flex w-full items-center gap-3 rounded-lg px-1 py-1.5 text-left transition-colors hover:bg-slate-50 {rv?.containerClass ?? ''}"
				>
					<div class="w-14 shrink-0 text-right">
						<span class="text-xs font-semibold tabular-nums text-slate-700">{timeLabel(e.start)}</span>
						{#if e.end}
							<span class="block text-[10px] tabular-nums text-slate-400">{timeLabel(e.end)}</span>
						{/if}
					</div>
					<span class="h-2 w-2 shrink-0 rounded-full" style:background={e.color}></span>
					<span class="min-w-0 flex-1 truncate text-sm text-slate-700">{e.title}</span>
					{#if rv}
						<span class="shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold {rv.badgeClass}">{rv.icon} {rv.label}</span>
					{/if}
					{#if e.location}
						<span class="hidden shrink-0 truncate text-xs text-slate-400 sm:block">📍 {e.location}</span>
					{/if}
					{#if e.source === 'family'}
						<span class="shrink-0 rounded bg-cyan-50 px-1.5 py-0.5 text-[10px] font-semibold text-cyan-600">
							Family
						</span>
					{/if}
				</button>
			{/each}
		</div>
	{:else}
		<p class="rounded-lg border border-dashed border-slate-200 px-3 py-4 text-center text-sm text-slate-400">
			{isToday ? 'No events scheduled today' : 'No events scheduled on this day'}
		</p>
	{/if}

	{#if allDayEvents.length === 0 && timedEvents.length === 0}
		<div class="mb-3"></div>
	{/if}

	<div class="mt-4 border-t border-slate-100 pt-3">
		<div class="flex items-center justify-between gap-3">
			<div class="flex items-center gap-2">
				{#if doneToday > 0 || openToday > 0}
					<div class="h-2 w-28 overflow-hidden rounded-full bg-slate-100">
						<div
							class="h-full rounded-full bg-primary-500 transition-all"
							style:width="{progress * 100}%"
						></div>
					</div>
					<span class="text-xs text-slate-500">{doneToday} done · {openToday} open</span>
				{:else}
					<span class="text-xs text-slate-400">{isToday ? 'No tasks due today — clear day ✨' : 'No tasks due this day'}</span>
				{/if}
			</div>
			{#if weekStreak > 0}
				<span
					class="shrink-0 rounded-full bg-amber-50 px-2.5 py-1 text-xs font-semibold text-amber-700"
					title="Weekly completion streak"
				>
					🔥 {weekStreak} week{weekStreak === 1 ? '' : 's'}
				</span>
			{/if}
		</div>
	</div>
</div>