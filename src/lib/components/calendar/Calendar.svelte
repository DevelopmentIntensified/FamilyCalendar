<script lang="ts">
	import { writable, type Writable } from 'svelte/store';
	import MonthView from './MonthView.svelte';
	import ListView from './ListView.svelte';
	import DateSelector from './DateSelector.svelte';
	import type { DateTime } from 'luxon';

	export let currentDate: Writable<DateTime>;
	export let timeZone: string;
	export let events;
	export let preferedFirstDayOfWeek: string;

	let view: 'month' | 'list' = 'month';
</script>

<div class="mb-2 bg-white pt-4">
	<div class="mb-2 flex flex-col items-center justify-between space-y-4 sm:flex-row sm:space-y-0">
		<DateSelector {currentDate} />
		<div class="hidden space-x-2 sm:flex">
			<button
				class="rounded-md px-4 py-2 {view === 'month'
					? 'bg-blue-500 text-white'
					: 'bg-gray-200 text-gray-800 '}"
				on:click={() => (view = 'month')}
			>
				Month View
			</button>
			<button
				class="rounded-md px-4 py-2 {view === 'list'
					? 'bg-blue-500 text-white'
					: 'bg-gray-200 text-gray-800'}"
				on:click={() => (view = 'list')}
			>
				List View
			</button>
		</div>
	</div>
	{#if view === 'month'}
		<MonthView {currentDate} {events} {timeZone} {preferedFirstDayOfWeek}/>
	{:else}
		<ListView {currentDate} {events} {timeZone}/>
	{/if}
</div>
