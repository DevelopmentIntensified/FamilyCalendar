<script lang="ts">
	let { nlInput = $bindable(''), onInput = () => {}, parsing = false, parseError = '', ...rest }: {
		nlInput?: string;
		onInput?: () => void;
		parsing?: boolean;
		parseError?: string;
	} = $props();
</script>

<div class="relative">
	<input
		type="text"
		bind:value={nlInput}
		oninput={onInput}
		placeholder="Try: Lunch Friday at noon with John in Conference A"
		autofocus
		class="w-full rounded-xl border-2 border-slate-200 bg-slate-50 px-4 py-3 text-base placeholder:text-slate-400 focus:border-primary-500 focus:bg-white focus:outline-none"
		{...rest}
	/>
	{#if parsing}
		<p class="mt-1 text-xs text-primary-600">Parsing...</p>
	{/if}
	{#if parseError}
		<p class="mt-1 text-xs text-red-500">{parseError}</p>
	{/if}
</div>
