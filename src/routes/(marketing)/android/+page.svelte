<script lang="ts">
	import AndroidScreen from '$lib/domains/marketing/ui/AndroidScreen.svelte';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();
</script>

<AndroidScreen release={data.release} />
