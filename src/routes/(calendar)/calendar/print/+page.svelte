<script lang="ts">
	import { page } from '$app/state';
	import CalendarPrintScreen from '$lib/domains/calendar/ui/CalendarPrintScreen.svelte';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();
</script>

<CalendarPrintScreen {data} search={page.url.search} />
