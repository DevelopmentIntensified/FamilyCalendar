<script lang="ts" context="module">
	import type { RSVPStatus, EventAttendanceSummary } from '$lib/types';

	export type GlanceEvent = {
		id: string;
		masterId: string | null;
		title: string;
		description: string | null;
		start: Date | string;
		end: Date | string | null;
		date: Date | string;
		allDay: boolean;
		/** #067: sponsored rows must name themselves here too. Optional so a
		 *  load that predates the flag still type-checks. */
		isAd?: boolean;
		location: string | null;
		calendarId: string | null;
		color: string;
		source: 'own' | 'family';
		rsvpStatus?: RSVPStatus;
		attendance?: EventAttendanceSummary;
	};
</script>

<script lang="ts">
	import { rsvpVisual } from '$lib/utils/eventChip';
	import { chipShell } from '$lib/utils/chipVocabulary';
	import AttendanceBadge from '../calendar/AttendanceBadge.svelte';
	import ChipKindMark from '../calendar/ChipKindMark.svelte';

	export let dateLabel: string;
	export let events: GlanceEvent[];
	export let onEventClick: (event: GlanceEvent) => void = () => {};
	export let isToday: boolean = true;
	/** The viewed day, `YYYY-MM-DD` (240). Absent = today, so the bare link is right. */
	export let dayDate: string | null = null;

	$: dayViewHref =
		dayDate && /^\d{4}-\d{2}-\d{2}$/.test(dayDate)
			? `/calendar?date=${dayDate}&view=day`
			: '/calendar?view=day';
	$: allDayEvents = events.filter((e) => e.allDay);
	$: timedEvents = events
		.filter((e) => !e.allDay)
		.sort((a, b) => new Date(a.start).getTime() - new Date(b.start).getTime());

	function timeLabel(value: Date | string): string {
		const d = value instanceof Date ? value : new Date(value);
		if (isNaN(d.getTime())) return '';
		return d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
	}
</script>

<div class="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
	<div class="mb-3 flex items-baseline justify-between gap-2">
		<h2 class="text-sm font-semibold text-slate-900">
			{isToday ? 'Today at a Glance' : 'Day at a Glance'}
		</h2>
		<p class="text-xs text-slate-400">{dateLabel}</p>
	</div>

	<!-- #314: every event is ONE line — time · kind mark · title · badges —
	     the shape a calendar chip reads, so a glance row can never grow into a
	     stacked block. The title is the only flexible cell (`min-w-0` +
	     `truncate`); time and badges are `shrink-0`, and the row itself
	     neither wraps nor overflows. The location rides in the button's
	     tooltip rather than as a fifth inline cell, which is what used to
	     squeeze the title out of its own row. -->
	{#snippet eventRow(e: GlanceEvent, shell: string)}
		{@const rv = rsvpVisual(e.rsvpStatus)}
		{@const chip = chipShell({ event: e, density: 'word' })}
		<button
			type="button"
			data-chip-kind={chip.kind}
			data-testid="glance-event-row"
			data-row-shape="single-line"
			onclick={() => onEventClick(e)}
			style={chip.style}
			title={e.location ? `${e.title} · ${e.location}` : e.title}
			class="flex w-full min-w-0 flex-nowrap items-center gap-2 overflow-hidden rounded-lg px-2 py-2 text-left whitespace-nowrap transition-colors {shell} {rv?.containerClass ??
				''}"
		>
			{#if !e.allDay}
				<!-- Start and end share the cell's one line: `w-16` holds a start
				     time at every narrow width, and `lg:w-32` is the room the
				     desktop grid's half-width column gives the "start – end" pair. -->
				<span
					data-testid="glance-event-time"
					class="w-16 shrink-0 truncate text-right text-xs font-semibold tabular-nums text-slate-700 lg:w-32"
				>
					{timeLabel(e.start)}{#if e.end}<span class="hidden text-slate-400 lg:inline"
							> – {timeLabel(e.end)}</span
						>{/if}
				</span>
			{/if}
			<!-- #067: a hand-rolled colour dot became the shared mark, so
				the day dashboard says what every other view says. -->
			<ChipKindMark kind={chip.kind} density={chip.markDensity} />
			<span
				data-testid="glance-event-title"
				class="min-w-0 flex-1 truncate text-sm text-slate-700">{e.title}</span
			>
			{#if e.source === 'family'}
				<span
					class="shrink-0 rounded bg-cyan-50 px-1.5 py-0.5 text-[10px] font-semibold text-cyan-600"
				>
					Family
				</span>
			{/if}
			{#if rv}
				<span class="shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold {rv.badgeClass}"
					>{rv.icon} {rv.label}</span
				>
			{/if}
			{#if e.attendance && e.attendance.invited > 1}
				<AttendanceBadge attendance={e.attendance} variant="row" />
			{/if}
		</button>
	{/snippet}

	{#if allDayEvents.length > 0}
		<div class="mb-3 space-y-1.5">
			{#each allDayEvents as e (e.id)}
				{@render eventRow(
					e,
					'border border-slate-100 bg-slate-50/60 hover:border-slate-200 hover:bg-slate-100'
				)}
			{/each}
		</div>
	{/if}

	{#if timedEvents.length > 0}
		<div class="space-y-1.5">
			{#each timedEvents as e (e.id)}
				{@render eventRow(e, 'hover:bg-slate-50')}
			{/each}
		</div>
	{:else if allDayEvents.length === 0}
		<div
			class="rounded-lg border border-dashed border-slate-200 px-3 py-4 text-center text-sm text-slate-400"
		>
			<p>{isToday ? 'No events scheduled today' : 'No events scheduled on this day'}</p>
			<a
				href={dayViewHref}
				class="mt-1 inline-block text-xs font-semibold text-primary-600 hover:text-primary-700 hover:underline"
			>
				Open day view →
			</a>
		</div>
	{/if}
</div>
