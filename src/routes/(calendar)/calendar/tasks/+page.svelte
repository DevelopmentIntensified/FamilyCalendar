<script lang="ts">
	import { invalidateAll } from '$app/navigation';
	import { TasksScreen } from '$lib/domains/tasks/ui';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();
</script>

<TasksScreen {data} refresh={invalidateAll} />
