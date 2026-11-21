<script lang="ts">
	import { enhance } from '$app/forms';
	import ClaimScreen from '$lib/domains/access/ui/ClaimScreen.svelte';
	import type { ActionData } from './$types';

	let { form }: { form: ActionData } = $props();
</script>

<ClaimScreen {form} {enhance} />
