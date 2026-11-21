<script lang="ts">
	import FamilyHomeScreen from '$lib/domains/family/ui/FamilyHomeScreen.svelte';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();
</script>

<FamilyHomeScreen {data} />
