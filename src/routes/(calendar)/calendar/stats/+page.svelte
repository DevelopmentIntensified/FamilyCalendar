<script lang="ts">
	import { StatsScreen } from '$lib/domains/tasks/ui';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();
</script>

<StatsScreen {data} />
