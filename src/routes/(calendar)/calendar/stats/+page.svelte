<script lang="ts">
	import StatsScreen from '$lib/domains/tasks/ui/StatsScreen.svelte';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();
</script>

<StatsScreen {data} />
