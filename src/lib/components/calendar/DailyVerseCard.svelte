<script lang="ts">
	export let reference: string;
	export let text: string;
	export let attribution: string | undefined = undefined;
</script>

<div class="flex flex-col gap-1 rounded-xl border border-amber-100 bg-amber-50/60 px-4 py-2.5 sm:flex-row sm:items-center sm:gap-3">
	<span class="shrink-0 text-[10px] font-semibold uppercase tracking-wide text-amber-700">Daily verse</span>
	<p class="min-w-0 flex-1 break-words text-sm italic leading-snug text-slate-700">{text}</p>
	<p class="shrink-0 text-left text-xs text-slate-400 sm:text-right">
		{reference}
		{#if attribution}
			<span class="hidden sm:inline"> · {attribution}</span>
		{/if}
	</p>
</div>