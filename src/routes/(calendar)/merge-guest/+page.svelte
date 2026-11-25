<script lang="ts">
	import { enhance } from '$app/forms';
	import MergeGuestScreen from '$lib/domains/access/ui/MergeGuestScreen.svelte';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();
</script>

<MergeGuestScreen {data} {enhance} />
