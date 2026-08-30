<script lang="ts">
	import type { EventAttendanceSummary } from '$lib/types';

	export let attendance: EventAttendanceSummary;
	/** 'chip' = tiny, blends into calendars; 'row' = richer pill for lists/cards. */
	export let variant: 'chip' | 'row' = 'chip';

	$: tooltip = [
		`${attendance.going} of ${attendance.invited} invited are going`,
		attendance.requiredPending > 0
			? `${attendance.requiredPending} required invite${attendance.requiredPending === 1 ? '' : 's'} still need${attendance.requiredPending === 1 ? 's' : ''} to accept`
			: null,
		attendance.goingNames.length ? `Going: ${attendance.goingNames.join(', ')}` : null
	]
		.filter((p): p is string => !!p)
		.join(' · ');
</script>

{#if attendance && attendance.invited > 1}
	<span
		class="inline-flex shrink-0 items-center gap-1 font-semibold {variant === 'row'
			? 'rounded-full bg-emerald-50 px-1.5 py-0.5 text-[10px] text-emerald-700 ring-1 ring-inset ring-emerald-200'
			: 'rounded px-0.5 text-[9px] text-emerald-600'} leading-none"
		title={tooltip}
	>
		<span class="h-1.5 w-1.5 shrink-0 rounded-full bg-emerald-400"></span>
		{attendance.going}/{attendance.invited}
		{#if attendance.requiredPending > 0}
			<span class="h-1.5 w-1.5 shrink-0 rounded-full bg-amber-400"></span>
		{/if}
	</span>
{/if}