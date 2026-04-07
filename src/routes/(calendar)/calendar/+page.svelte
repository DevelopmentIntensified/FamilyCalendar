<script lang="ts">
	export let data: PageData;

	import { writable } from 'svelte/store';
	import Calendar from '$lib/components/calendar/Calendar.svelte';
	import type { CalendarEvent } from '$lib/server/db/schema.js';
	import { DateTime, Settings } from 'luxon';
	import type { PageData } from './$types';
	import { onMount } from 'svelte';

	let timeZone = data.userSettings.timeZone;
	const currentDate = writable(DateTime.now().setZone(timeZone as string));
	type ParsedEvent = CalendarEvent & { date: Date; color: string };
	let events: ParsedEvent[] = data.userEvents;

	onMount(async () => {
		if (!data.userSettings.timeZone) {
			timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone; // set the default timezone
			await fetch('/calendar/setUserDefaultTimeZone', {
				//set the default user timezone in the settings
				method: 'post',
				headers: {
					'Content-Type': 'application/json'
				},
				body: JSON.stringify({
					timeZone: timeZone
				})
			});
		}

		Settings.defaultZone = timeZone; // set the default timezone for luxon

		// if(data.userSettings.defaultCalendarId){
		// 	let userCalendarId = data.userEvents[0].id
		// 	let familyCalendarId = data.familyEvents[0].id
		// }
	});

	events = [
		...data.userEvents.map((e) => ({
			// we gotta convert the dates and times to luxon times because its easier to use
			...e,
			date: DateTime.fromJSDate(e.date),
			start: DateTime.fromJSDate(e.start),
			end: DateTime.fromJSDate(e.end),
			color: 'bg-[#fa8072]'
		})),
		...data.familyEvents.map((e) => ({
			// do it again for family events
			...e,
			date: DateTime.fromJSDate(e.date),
			start: DateTime.fromJSDate(e.start),
			end: DateTime.fromJSDate(e.end),
			color: 'bg-[#e0ffff]'
		}))
	] as ParsedEvent[];
</script>

<svelte:head>
	<title>Family Planz: Calendar Dashboard</title>
</svelte:head>

<div class="container mx-auto mt-3 pt-12">
	<div class="overflow-hidden bg-white">
		<Calendar {currentDate} {events} />
	</div>
</div>
