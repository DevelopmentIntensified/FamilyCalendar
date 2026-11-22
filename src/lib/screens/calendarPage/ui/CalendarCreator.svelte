<!--
	The compact "by <First>" creator marker, in the screen's own chunk (see
	`CalendarMark`: calendar's `CalendarCreatorBadge` sits behind the `calendar/ui`
	barrel). Same markup and classes as that badge.
-->
<script lang="ts">
	interface Props {
		name: string;
		variant?: 'chip' | 'row';
	}

	let { name, variant = 'chip' }: Props = $props();
</script>

<span
	class="inline-flex min-w-0 max-w-[5rem] shrink-0 items-center truncate {variant === 'row'
		? 'rounded-full bg-slate-100 px-1.5 py-0.5 text-[10px] font-medium text-slate-600'
		: 'text-[10px] font-normal text-slate-500'} leading-none"
	title="Created by {name}"
>
	by {name}
</span>
