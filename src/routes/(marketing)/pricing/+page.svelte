<script lang="ts">
	import { PricingScreen } from '$lib/domains/marketing/ui';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();
</script>

<PricingScreen memberLimit={data.memberLimit} />
