<!--
	`going/invited` at a glance, in the screen's own chunk (see `CalendarMark`:
	calendar's `CalendarAttendanceBadge` sits behind the `calendar/ui` barrel).
	Same markup, classes and tooltip as that badge. Hidden unless more than one
	person was invited.
-->
<script lang="ts">
	import type { EventAttendanceSummary } from '$lib/domains/calendar/index';

	interface Props {
		attendance: EventAttendanceSummary;
		/** `chip` blends into calendars; `row` is the richer list pill. */
		variant?: 'chip' | 'row';
	}

	let { attendance, variant = 'chip' }: Props = $props();

	const tooltip = $derived(
		[
			`${attendance.going} of ${attendance.invited} invited are going`,
			attendance.requiredPending > 0
				? `${attendance.requiredPending} required invite${attendance.requiredPending === 1 ? '' : 's'} still need${attendance.requiredPending === 1 ? 's' : ''} to accept`
				: null,
			attendance.goingNames.length ? `Going: ${attendance.goingNames.join(', ')}` : null
		]
			.filter((part): part is string => !!part)
			.join(' · ')
	);
</script>

{#if attendance && attendance.invited > 1}
	<span
		class="inline-flex shrink-0 items-center gap-1 font-semibold {variant === 'row'
			? 'rounded-full bg-emerald-50 px-1.5 py-0.5 text-[10px] text-emerald-700 ring-1 ring-inset ring-emerald-200'
			: 'rounded px-0.5 text-[9px] text-emerald-600'} leading-none"
		title={tooltip}
		data-testid="attendance-badge"
	>
		<span class="h-1.5 w-1.5 shrink-0 rounded-full bg-emerald-400"></span>
		{attendance.going}/{attendance.invited}
		{#if attendance.requiredPending > 0}
			<span class="h-1.5 w-1.5 shrink-0 rounded-full bg-amber-400"></span>
		{/if}
	</span>
{/if}
