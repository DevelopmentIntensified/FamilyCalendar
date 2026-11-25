<script lang="ts">
	import { goto } from '$app/navigation';
	import { page } from '$app/state';
	import ResetPasswordScreen from '$lib/domains/access/ui/ResetPasswordScreen.svelte';

	const redirect = (path: string) => goto(path);
</script>

<ResetPasswordScreen token={page.url.searchParams.get('token') ?? ''} {redirect} />
