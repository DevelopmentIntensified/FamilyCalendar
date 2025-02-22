<script lang="ts">
  import { writable, type Writable } from 'svelte/store';
  import MonthView from './MonthView.svelte';
  import ListView from './ListView.svelte';
  import DateSelector from './DateSelector.svelte';
  import type { CalendarEvent } from '$lib/server/db/schema';
  import type { DateTime } from 'luxon';

  export let currentDate: Writable<DateTime>;
  export let events: CalendarEvent[];

  let view: 'month' | 'list' = 'list';
</script>

<div class="mb-8 bg-white p-6">
  <div class="mb-6 flex flex-col items-center justify-between space-y-4 sm:flex-row sm:space-y-0">
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
    <MonthView {currentDate} {events} />
  {:else}
    <ListView {currentDate} {events} />
  {/if}
</div>
