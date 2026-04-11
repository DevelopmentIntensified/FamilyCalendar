<script lang="ts">
	export let data: PageData;

	import { writable } from 'svelte/store';
	import Calendar from '$lib/components/calendar/Calendar.svelte';
	import type { CalendarEvent } from '$lib/server/db/schema.js';
	import { DateTime, Settings } from 'luxon';
	import type { PageData } from './$types';
	import { onMount } from 'svelte';

	const timeZone = data.userSettings?.timeZone || Intl.DateTimeFormat().resolvedOptions().timeZone;
	const currentDate = writable(DateTime.now().setZone(timeZone));
	type ParsedEvent = CalendarEvent & { date: Date; color: string };
	let events: ParsedEvent[] = data.userEvents;

	onMount(async () => {
		if (!data.userSettings?.timeZone) {
			const newTimeZone = Intl.DateTimeFormat().resolvedOptions().timeZone;
			await fetch('/calendar/setUserDefaultTimeZone', {
				method: 'post',
				headers: {
					'Content-Type': 'application/json'
				},
				body: JSON.stringify({
					timeZone: newTimeZone
				})
			});
		}

		Settings.defaultZone = timeZone as string;
	});

	events = [
		...data.userEvents.map((e: ParsedEvent) => ({
			...e,
			date: DateTime.fromJSDate(e.date).setZone(timeZone),
			start: DateTime.fromJSDate(e.start).setZone(timeZone),
			end: DateTime.fromJSDate(e.end).setZone(timeZone),
			color: `bg-[${data.userCalendarColor}]`
		})),
		...data.familyEvents.map((e: ParsedEvent) => ({
			...e,
			date: DateTime.fromJSDate(e.date).setZone(timeZone),
			start: DateTime.fromJSDate(e.start).setZone(timeZone),
			end: DateTime.fromJSDate(e.end).setZone(timeZone),
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
