<!--
	The shared auth card: every sign-in, sign-up and recovery page renders its
	body inside this `max-w-md` white sheet. Layout only — props in, no state.

	Doc: ../README.md#public-interface
-->
<script lang="ts">
	import type { Snippet } from 'svelte';

	let { children }: { children: Snippet } = $props();
</script>

<div class="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-8 shadow-sm">
	{@render children()}
</div>
