<script lang="ts">
	import { createFeedbackApi } from '$lib/domains/feedback';
	import { adminToasts, AdminPhraseRegister } from '$lib/screens/admin/ui';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();
</script>

<AdminPhraseRegister {data} api={createFeedbackApi()} toasts={adminToasts} />
