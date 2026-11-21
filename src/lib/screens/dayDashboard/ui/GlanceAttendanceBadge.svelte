<!--
	The glance row's `going/invited` pill, in the screen's own chunk: calendar's
	shared badge sits behind `calendar/ui`, whose barrel carries the whole sheet
	(luxon, zod) onto the dashboard's first paint. Same markup and tooltip as
	`CalendarAttendanceBadge.svelte`'s row variant, so the row reads identically.
-->
<script lang="ts">
	import type { EventAttendanceSummary } from '$lib/domains/calendar';

	interface Props {
		attendance: EventAttendanceSummary;
	}

	let { attendance }: Props = $props();

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
		class="inline-flex shrink-0 items-center gap-1 rounded-full bg-emerald-50 px-1.5 py-0.5 text-[10px] font-semibold leading-none text-emerald-700 ring-1 ring-inset ring-emerald-200"
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
