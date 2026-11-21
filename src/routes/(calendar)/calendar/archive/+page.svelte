<script lang="ts">
	import { ArchiveScreen } from '$lib/domains/tasks/ui';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();
</script>

<ArchiveScreen {data} />
