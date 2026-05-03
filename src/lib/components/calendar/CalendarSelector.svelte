<script lang="ts">
	import { createEventDispatcher } from 'svelte';

	export let calendarIds: { id: string; name: string; color?: string; type?: string }[] = [];
	export let value: string = '';
	let showDropdown = false;

	const dispatch = createEventDispatcher();

	$: selected = calendarIds.find(c => c.id === value);

	function select(calId: string) {
		value = calId;
		showDropdown = false;
	}
</script>

<div class="relative">
	<!-- Trigger Button -->
	<button
		type="button"
		on:click={() => showDropdown = !showDropdown}
		class="flex w-full items-center justify-between gap-2 rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm transition-all hover:border-primary-400 hover:bg-white focus:outline-none focus:ring-2 focus:ring-primary-500/20"
	>
		<div class="flex items-center gap-2 min-w-0">
			{#if selected}
				<div class="h-3 w-3 shrink-0 rounded-full" style="background-color: {selected.color || '#94a3b8'};"></div>
				<span class="truncate text-slate-700">{selected.name}</span>
			{:else}
				<span class="text-slate-400">Select calendar...</span>
			{/if}
		</div>
		<svg
			class="h-4 w-4 shrink-0 text-slate-400 transition-transform {showDropdown ? 'rotate-180' : ''}"
			fill="none"
			viewBox="0 0 24 24"
			stroke="currentColor"
			stroke-width="2"
		>
			<path stroke-linecap="round" stroke-linejoin="round" d="M19 9l-7 7-7-7" />
		</svg>
	</button>

	<!-- Dropdown -->
	{#if showDropdown}
		<div class="absolute z-10 mt-1 w-full rounded-xl border border-slate-200 bg-white shadow-lg max-h-48 overflow-y-auto">
			{#each calendarIds as cal}
				<button
					type="button"
					on:click={() => select(cal.id)}
					class="flex w-full items-center gap-3 px-4 py-3 text-left text-sm transition-colors hover:bg-slate-50 {
						value === cal.id ? 'bg-primary-50 text-primary-700' : 'text-slate-700'
					}"
				>
					<div class="h-3 w-3 shrink-0 rounded-full" style="background-color: {cal.color || '#94a3b8'};"></div>
					<div class="flex-1 min-w-0">
						<p class="truncate font-medium">{cal.name}</p>
						{#if cal.type}
							<p class="text-xs text-slate-500">{cal.type}</p>
						{/if}
					</div>
					{#if value === cal.id}
						<svg class="h-4 w-4 shrink-0 text-primary-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="3">
							<path stroke-linecap="round" stroke-linejoin="round" d="M5 13l4 4L19 7" />
						</svg>
					{/if}
				</button>
			{/each}
		</div>

		<!-- Click outside to close -->
		<button
			type="button"
			on:click={() => showDropdown = false}
			class="fixed inset-0 z-[-1]"
			aria-hidden="true"
		></button>
	{/if}
</div>
