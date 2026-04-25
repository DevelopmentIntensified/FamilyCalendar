<script lang="ts">
	import { onMount } from 'svelte';

	export let value = '';
	export let placeholder = 'Where? (address or any place)';
	export let inputClass = 'w-full rounded-lg border border-slate-200 px-3 py-2.5';

	let showDropdown = false;
	let suggestions: string[] = [];
	let recentLocations: string[] = [];
	let searchTimer: ReturnType<typeof setTimeout>;
	let loading = false;

	function loadRecentLocations() {
		if (typeof localStorage !== 'undefined') {
			const stored = localStorage.getItem('recentLocations');
			if (stored) {
				recentLocations = JSON.parse(stored);
			}
		}
	}

	function saveLocation(location: string) {
		if (!location.trim()) return;
		recentLocations = [location, ...recentLocations.filter(l => l !== location)].slice(0, 5);
		if (typeof localStorage !== 'undefined') {
			localStorage.setItem('recentLocations', JSON.stringify(recentLocations));
		}
	}

	async function searchLocations(searchQuery: string) {
		if (!searchQuery.trim()) {
			suggestions = [];
			return;
		}
		loading = true;
		try {
			const res = await fetch(`https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(searchQuery)}&limit=5`);
			const data = await res.json();
			suggestions = data.map((item: any) => item.display_name);
		} catch {
			suggestions = [];
		} finally {
			loading = false;
		}
	}

	function handleInput() {
		clearTimeout(searchTimer);
		searchTimer = setTimeout(() => {
			searchLocations(value);
		}, 300);
	}

	function handleFocus() {
		if (recentLocations.length > 0) {
			showDropdown = true;
		}
	}

	function handleBlur() {
		setTimeout(() => {
			showDropdown = false;
		}, 150);
	}

	function selectLocation(location: string) {
		value = location;
		showDropdown = false;
		suggestions = [];
		saveLocation(location);
	}

	onMount(() => {
		loadRecentLocations();
	});
</script>

<div class="relative">
	<input 
		type="text" 
		bind:value
		oninput={handleInput}
		onfocus={handleFocus}
		onblur={handleBlur}
		{placeholder}
		class={inputClass}
	/>
	
	{#if showDropdown && (suggestions.length > 0 || recentLocations.length > 0)}
		<div class="absolute z-10 mt-1 w-full rounded-lg border border-slate-200 bg-white shadow-lg max-h-64 overflow-y-auto">
			{#if suggestions.length > 0}
				<div class="p-1">
					<div class="px-3 py-1 text-xs font-medium text-slate-500">
						{loading ? 'Searching...' : 'Address Suggestions'}
					</div>
					{#each suggestions as suggestion}
						<button 
							type="button"
							onclick={() => selectLocation(suggestion)}
							class="flex w-full items-start gap-2 rounded-lg px-3 py-2 text-left text-sm hover:bg-slate-50"
						>
							<svg class="h-4 w-4 mt-0.5 text-slate-400 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
								<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
								<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
							</svg>
							<span class="line-clamp-2">{suggestion}</span>
						</button>
					{/each}
				</div>
			{/if}
			{#if recentLocations.length > 0}
				<div class="border-t border-slate-100 p-1">
					<div class="px-3 py-1 text-xs font-medium text-slate-500">Recent</div>
					{#each recentLocations as recent}
						<button 
							type="button"
							onclick={() => selectLocation(recent)}
							class="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm hover:bg-slate-50"
						>
							<svg class="h-4 w-4 text-slate-400 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
								<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
							</svg>
							<span class="truncate">{recent}</span>
						</button>
					{/each}
				</div>
			{/if}
		</div>
	{/if}
</div>