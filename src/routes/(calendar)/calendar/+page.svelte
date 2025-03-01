<script lang="ts">
	export let data: PageData;
	console.warn('DEBUGPRINT[1]: +page.svelte:9: data=', data);

	import { writable } from 'svelte/store';
	import Calendar from '$lib/components/calendar/Calendar.svelte';
	import type { CalendarEvent } from '$lib/server/db/schema.js';
	import { DateTime } from 'luxon';
	import type { PageData } from './$types';
	import { onMount } from 'svelte';

	let timeZone = data.userSettings.timeZone;

	onMount(async () => {
		if (!data.userSettings.timeZone) {
			timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone;
			console.warn('DEBUGPRINT[22]: +page.svelte:14: timeZone=', timeZone);
			await fetch('/calendar/setUserDefaultTimeZone', {
				method: "post",
				headers: {
					'Content-Type': 'application/json'
				},
				body: JSON.stringify({
					timeZone: timeZone
				})
			});
		}
	});

	const currentDate = writable(DateTime.now().setZone(timeZone as string));
	let events: CalendarEvent[] = data.events;
	events = events.map((e) => ({
		...e,
		date: DateTime.fromJSDate(e.date),
		start: DateTime.fromJSDate(e.start),
		end: DateTime.fromJSDate(e.end)
	}));
	console.log(events);
</script>

<svelte:head>
	<title>Family Planz: Calendar Dashboard</title>
</svelte:head>

<div class="container mx-auto mt-3 px-4 py-12">
	<div class="overflow-hidden rounded-lg bg-white shadow-xl">
		<Calendar {currentDate} {events} {timeZone} />
	</div>
</div>
