<script lang="ts">
	import { goto } from '$app/navigation';
	import SignupScreen from '$lib/domains/access/ui/SignupScreen.svelte';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();

	const redirect = (path: string) => goto(path, { invalidateAll: true });
</script>

<SignupScreen {data} {redirect} />
