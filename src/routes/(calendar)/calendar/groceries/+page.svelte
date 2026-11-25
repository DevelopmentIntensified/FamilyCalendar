<script lang="ts">
	import { page } from '$app/state';
	import GroceriesScreen from '$lib/domains/groceries/ui/GroceriesScreen.svelte';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();
</script>

<GroceriesScreen {data} scopeParam={page.url.searchParams.get('scope')} />
