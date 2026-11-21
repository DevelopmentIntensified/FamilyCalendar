<script lang="ts">
	import { createFeedbackApi } from '$lib/domains/feedback';
	import AdminBugRegister from '$lib/screens/admin/ui/AdminBugRegister.svelte';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();
</script>

<AdminBugRegister {data} api={createFeedbackApi()} />
