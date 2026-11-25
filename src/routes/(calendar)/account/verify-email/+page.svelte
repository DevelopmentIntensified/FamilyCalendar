<script lang="ts">
	import { enhance } from '$app/forms';
	import { page } from '$app/state';
	import VerifyEmailScreen from '$lib/domains/access/ui/VerifyEmailScreen.svelte';
	import type { ActionData } from './$types';

	let { form }: { form: ActionData } = $props();
</script>

<VerifyEmailScreen {form} token={page.url.searchParams.get('token') ?? ''} {enhance} />
