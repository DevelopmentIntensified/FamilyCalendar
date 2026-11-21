<script lang="ts">
	import { invalidateAll } from '$app/navigation';
	import { DayDashboardPage } from '$lib/screens/dayDashboard/ui';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();
</script>

<DayDashboardPage {data} refresh={invalidateAll} />
