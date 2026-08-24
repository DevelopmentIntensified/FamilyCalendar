<script lang="ts">
	export let illustration = '';
	export let title: string;
	export let hint = '';
</script>

<div class="relative flex flex-col items-center rounded-2xl bg-primary-50/50 px-6 py-8 text-center">
	{#if illustration}
		<img src={illustration} alt="" class="mx-auto h-28 w-auto opacity-80" />
	{/if}
	<h2 class="mt-3 text-lg font-bold text-slate-800">{title}</h2>
	{#if hint}
		<p class="mt-1 max-w-sm text-sm text-slate-500">{hint}</p>
	{/if}
	<slot />
</div>
