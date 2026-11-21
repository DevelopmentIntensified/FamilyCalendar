<script lang="ts">
	import { FamilyAddMemberScreen } from '$lib/domains/family/ui';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();
</script>

<FamilyAddMemberScreen {data} />
