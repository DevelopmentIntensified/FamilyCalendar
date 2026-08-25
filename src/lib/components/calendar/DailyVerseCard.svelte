<script lang="ts">
	export let reference: string;
	export let text: string;
	export let attribution: string | undefined = undefined;
	export let translation: string | undefined = undefined;
</script>

<div class="rounded-xl border border-amber-100 bg-amber-50 p-4">
	<p class="text-[10px] uppercase tracking-wide text-amber-700">Daily verse</p>
	<p class="mt-2 text-sm italic text-slate-700">{text}</p>
	<p class="mt-2 text-right text-xs text-slate-400">{reference}</p>
	{#if attribution && translation !== 'kjv'}
		<p class="mt-1 text-[10px] leading-snug text-slate-400">{attribution}</p>
	{/if}
</div>
