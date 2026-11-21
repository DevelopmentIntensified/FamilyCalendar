<!--
	The route is wiring only: the screen owns the layout, the state classes and
	the lazy modal boundaries. `invalidateAll` and the consumed deep-link rewrite
	are the framework's, so they are passed in rather than imported by the UI.
-->
<script lang="ts">
	import { goto, invalidateAll } from '$app/navigation';
	import { CalendarPage } from '$lib/screens/calendarPage/ui';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();

	function stripQuery() {
		void goto('/calendar', { replaceState: true, keepFocus: true, noScroll: true });
	}
</script>

<CalendarPage model={data} oninvalidate={invalidateAll} onstripquery={stripQuery} />
