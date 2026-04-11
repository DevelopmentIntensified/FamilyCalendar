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
			...e,
			date: DateTime.fromJSDate(e.date),
			start: DateTime.fromJSDate(e.start),
			end: DateTime.fromJSDate(e.end),
			color: `bg-[${data.userCalendarColor}]`
		})),
		...data.familyEvents.map((e) => ({
			...e,
			date: DateTime.fromJSDate(e.date),
			start: DateTime.fromJSDate(e.start),
			end: DateTime.fromJSDate(e.end),
			color: `bg-[${data.familyCalendarColor}]`
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
