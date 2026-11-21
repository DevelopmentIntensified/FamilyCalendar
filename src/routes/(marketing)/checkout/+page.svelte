<script lang="ts">
	import { CheckoutScreen } from '$lib/domains/marketing/ui';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();
</script>

<CheckoutScreen
	selectedPlan={data.selectedPlan}
	checkoutResult={data.checkoutResult}
	userDiscounts={data.userDiscounts}
/>
