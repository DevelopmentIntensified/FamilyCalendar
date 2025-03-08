<script lang="ts">
	import { goto } from '$app/navigation';
	import { DateTime } from 'luxon';

	export let data;
	const event = data.event;
	function goBack() {
		goto('/calendar');
	}
</script>

<div class="container mx-auto p-4">
	<button on:click={goBack} class="mb-4 flex items-center text-blue-500 hover:text-blue-600">
		<svg
			xmlns="http://www.w3.org/2000/svg"
			class="mr-1 h-5 w-5"
			viewBox="0 0 24 24"
			fill="none"
			stroke="currentColor"
			stroke-width="2"
			stroke-linecap="round"
			stroke-linejoin="round"><polyline points="15 18 9 12 15 6"></polyline></svg
		>
		Back to Calendar
	</button>
	<div class="rounded-lg bg-white p-6 shadow-lg">
		<h1 class="mb-4 text-3xl font-bold text-gray-800">{event.title}</h1>
		<div class="grid grid-cols-1 gap-4 md:grid-cols-2">
			<div>
				<p class="text-gray-600">
					<strong>Date:</strong>
					{DateTime.fromJSDate(event.date).toLocaleString(DateTime.DATE_MED_WITH_WEEKDAY)}
				</p>
				<p class="text-gray-600">
					<strong>Time:</strong>
					{DateTime.fromJSDate(event.start).toLocaleString(DateTime.TIME_SIMPLE)} - {DateTime.fromJSDate(
						event.end
					).toLocaleString(DateTime.TIME_SIMPLE)}
				</p>
				<p class="text-gray-600"><strong>Location:</strong> {event.location}</p>
			</div>
			<div>
				<h2 class="mb-2 text-xl font-semibold text-gray-800">Description</h2>
				<p class="mb-2 text-gray-700">{event.description}</p>
			</div>
			<a class="text-blue-400" href="/calendar/event/edit/{event.id}">Edit Event</a>
		</div>
	</div>
</div>
