<!--
	Compact "by <First>" creator marker for family-event chips and rows. Personal
	events never render it (they carry no `creatorName`). `chip` is the tiny
	inline wording, `row` the roomier pill.

	Doc: ../../README.md#public-interface
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
