<script lang="ts">
	import { AdminHome } from '$lib/screens/admin/ui';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();
</script>

<svelte:head>
	<title>Admin · Family Planz</title>
</svelte:head>

<AdminHome openBugs={data.openBugs} openPhrases={data.openPhrases} />
