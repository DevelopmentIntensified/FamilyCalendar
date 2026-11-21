<script lang="ts">
	import { invalidateAll } from '$app/navigation';
	import { FamilyInvitationsScreen } from '$lib/domains/family/ui';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();
</script>

<FamilyInvitationsScreen {data} refresh={invalidateAll} />
