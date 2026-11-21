<script lang="ts">
	import CalendarImportScreen from '$lib/domains/calendar/ui/CalendarImportScreen.svelte';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();
</script>

<CalendarImportScreen {data} />
