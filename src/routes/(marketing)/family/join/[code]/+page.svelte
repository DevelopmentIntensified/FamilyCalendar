<script lang="ts">
	import { goto } from '$app/navigation';
	import FamilyJoinScreen from '$lib/domains/family/ui/FamilyJoinScreen.svelte';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();

	const toFamily = () => goto('/family');
</script>

<FamilyJoinScreen {data} redirect={toFamily} />
