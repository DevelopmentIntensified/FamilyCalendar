<script lang="ts">
	import type { Snippet } from 'svelte';
	import { page } from '$app/state';
	import { AdminShell } from '$lib/screens/admin/ui';
	import type { LayoutData } from './$types';

	let { data, children }: { data: LayoutData; children: Snippet } = $props();
</script>

<AdminShell pathname={page.url.pathname} openBugs={data.openBugs} openPhrases={data.openPhrases}>
	{@render children()}
</AdminShell>
