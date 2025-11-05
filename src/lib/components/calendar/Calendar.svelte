<script lang="ts">
	import { writable, type Writable } from 'svelte/store';
	import MonthView from './MonthView.svelte';
	import ListView from './ListView.svelte';
	import DateSelector from './DateSelector.svelte';
	import type { DateTime } from 'luxon';

	export let currentDate: Writable<DateTime>;
	export let events;
	export let preferedFirstDayOfWeek: string;

	let view: 'month' | 'list' = 'month';
</script>

<div class="mb-2 bg-white pt-4">
	<div class="mb-2 flex flex-col items-center justify-between space-y-4">
		<DateSelector {currentDate} />
	</div>
	{#if view === 'month'}
		<MonthView {currentDate} {events} {preferedFirstDayOfWeek} />
	{:else}
		<ListView {currentDate} {events} />
	{/if}
</div>
