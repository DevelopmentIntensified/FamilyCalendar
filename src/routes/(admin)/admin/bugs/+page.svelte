<script lang="ts">
	import { createFeedbackApi } from '$lib/domains/feedback';
	import { AdminBugRegister, adminToasts } from '$lib/screens/admin/ui';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();
</script>

<AdminBugRegister {data} api={createFeedbackApi()} toasts={adminToasts} />
