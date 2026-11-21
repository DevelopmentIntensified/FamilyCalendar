<script lang="ts">
	import PricingScreen from '$lib/domains/marketing/ui/PricingScreen.svelte';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();
</script>

<PricingScreen memberLimit={data.memberLimit} />
