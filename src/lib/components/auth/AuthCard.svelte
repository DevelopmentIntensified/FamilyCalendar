<script lang="ts">
	import type { Snippet } from 'svelte';

	let { children }: { children: Snippet } = $props();
</script>

<div class="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-8 shadow-sm">
	{@render children()}
</div>
