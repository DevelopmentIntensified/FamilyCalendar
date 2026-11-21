<!--
	Day at a Glance: one nowrap row per event — time, kind mark, truncating
	title, Family pill, RSVP badge, attendance — all-day rows first. The empty
	state links at the VIEWED day's day view, never today's.

	Data and callbacks in, events out: no fetch, no `$app/*`.
	Legacy reference: `components/dashboard/TodayGlanceCard.svelte` (#314/#067).
-->
<script lang="ts">
	import {
		CalendarAttendanceBadge,
		CalendarEventChipMark
	} from '$lib/domains/calendar/ui';
	import { describeEventChip } from '$lib/domains/calendar';
	import type { DashboardDayEventRow } from '../dayDashboard.contract';
	import { glanceRsvpVisual, orderGlanceEvents } from '../dayDashboard.cards.rules';

	interface Props {
		dateLabel: string;
		isToday: boolean;
		/** The viewed day, `YYYY-MM-DD`; the empty state's link targets it. */
		dayDate: string | null;
		events: readonly DashboardDayEventRow[];
		onEventClick: (event: DashboardDayEventRow) => void;
	}

	let { dateLabel, isToday, dayDate, events, onEventClick }: Props = $props();

	const dayViewHref = $derived(
		dayDate && /^\d{4}-\d{2}-\d{2}$/.test(dayDate)
			? `/calendar?date=${dayDate}&view=day`
			: '/calendar?view=day'
	);
	const rows = $derived(orderGlanceEvents(events));

	function timeLabel(value: string): string {
		const date = new Date(value);
		if (Number.isNaN(date.getTime())) return '';
		return date.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
	}
</script>

<div class="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
	<div class="mb-3 flex items-baseline justify-between gap-2">
		<h2 class="text-sm font-semibold text-slate-900">
			{isToday ? 'Today at a Glance' : 'Day at a Glance'}
		</h2>
		<p class="text-xs text-slate-400">{dateLabel}</p>
	</div>

	{#snippet eventRow(event: DashboardDayEventRow, shell: string)}
		{@const rsvp = glanceRsvpVisual(event.rsvpStatus)}
		{@const chip = describeEventChip({ density: 'word', event })}
		<button
			type="button"
			data-chip-kind={chip.kind}
			data-testid="glance-event-row"
			data-row-shape="single-line"
			onclick={() => onEventClick(event)}
			style={chip.style}
			title={event.location ? `${event.title} · ${event.location}` : event.title}
			class="flex w-full min-w-0 flex-nowrap items-center gap-2 overflow-hidden rounded-lg px-2 py-2 text-left whitespace-nowrap transition-colors {shell} {rsvp?.containerClass ??
				''}"
		>
			{#if !event.allDay}
				<span
					data-testid="glance-event-time"
					class="w-16 shrink-0 truncate text-right text-xs font-semibold tabular-nums text-slate-700 lg:w-32"
				>
					{timeLabel(event.start)}{#if event.end}<span class="hidden text-slate-400 lg:inline"
							> – {timeLabel(event.end)}</span
						>{/if}
				</span>
			{/if}
			<CalendarEventChipMark kind={chip.kind} density={chip.markDensity} />
			<span
				data-testid="glance-event-title"
				class="min-w-0 flex-1 truncate text-sm text-slate-700">{event.title}</span
			>
			{#if event.source === 'family'}
				<span class="shrink-0 rounded bg-cyan-50 px-1.5 py-0.5 text-[10px] font-semibold text-cyan-600">
					Family
				</span>
			{/if}
			{#if rsvp}
				<span class="shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold {rsvp.badgeClass}"
					>{rsvp.icon} {rsvp.label}</span
				>
			{/if}
			{#if event.attendance && event.attendance.invited > 1}
				<CalendarAttendanceBadge attendance={event.attendance} variant="row" />
			{/if}
		</button>
	{/snippet}

	{#if rows.length > 0}
		<div class="space-y-1.5">
			{#each rows as event (event.id)}
				{@render eventRow(
					event,
					event.allDay
						? 'border border-slate-100 bg-slate-50/60 hover:border-slate-200 hover:bg-slate-100'
						: 'hover:bg-slate-50'
				)}
			{/each}
		</div>
	{:else}
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
