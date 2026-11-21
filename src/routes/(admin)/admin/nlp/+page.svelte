<script lang="ts">
	import { createFeedbackApi } from '$lib/domains/feedback';
	import AdminPhraseRegister from '$lib/screens/admin/ui/AdminPhraseRegister.svelte';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();
</script>

<AdminPhraseRegister {data} api={createFeedbackApi()} />
