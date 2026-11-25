<script lang="ts">
	import { goto } from '$app/navigation';
	import CalendarEventDetailScreen from '$lib/domains/calendar/ui/CalendarEventDetailScreen.svelte';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();
</script>

<CalendarEventDetailScreen {data} onnavigate={goto} />
