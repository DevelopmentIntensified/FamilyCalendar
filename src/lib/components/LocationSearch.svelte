<script lang="ts">
	import { onMount } from 'svelte';

	let {
		value = $bindable(''),
		placeholder = 'Where? (address or any place)',
		inputClass = 'w-full rounded-lg border border-slate-200 px-3 py-2.5',
		searchEndpoint = '',
		searchFunction = null
	} = $props();

	let showDropdown = $state(false);
	let suggestions = $state<string[]>([]);
	let recentLocations = $state<string[]>([]);
	let searchTimer: ReturnType<typeof setTimeout>;
	let loading = $state(false);
	let abortController: AbortController | null = null;
	let activeIndex = $state(-1);
	const listboxId = $props.id();

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
		
		// Use custom search function if provided
		if (searchFunction) {
			try {
				suggestions = await searchFunction(searchQuery);
				if (suggestions.length > 0) {
					showDropdown = true;
				} else {
					showDropdown = false;
				}
			} catch {
				suggestions = [];
			} finally {
				loading = false;
			}
			return;
		}
		
		// Cancel previous request
		if (abortController) {
			abortController.abort();
		}
		abortController = new AbortController();
		
		loading = true;
		try {
			const url = searchEndpoint 
				? `${searchEndpoint}${encodeURIComponent(searchQuery)}`
				: `/api/location-search?q=${encodeURIComponent(searchQuery)}`;
			
			const res = await fetch(url, { signal: abortController.signal });
			const data = await res.json();
			
			if (searchEndpoint) {
				suggestions = data.slice(0, 5);
			} else {
				const results: { label: string }[] = data.results ?? [];
				suggestions = results.map((r) => r.label).slice(0, 5);
			}
			activeIndex = -1;
			
			if (suggestions.length > 0) {
				showDropdown = true;
			} else {
				showDropdown = false;
			}
		} catch (e: any) {
			if (e.name !== 'AbortError') {
				suggestions = [];
			}
		} finally {
			loading = false;
			abortController = null;
		}
	}

	function handleInput() {
		clearTimeout(searchTimer);
		if (value.length < 2) {
			suggestions = [];
			showDropdown = false;
			activeIndex = -1;
			return;
		}
		searchTimer = setTimeout(() => {
			searchLocations(value);
		}, 50);
	}

	function handleFocus() {
		if (recentLocations.length > 0 || suggestions.length > 0) {
			showDropdown = true;
		}
	}

	function handleBlur() {
		showDropdown = false;
		activeIndex = -1;
	}

	function handleKeydown(event: KeyboardEvent) {
		if (event.key === 'Escape') {
			showDropdown = false;
			activeIndex = -1;
			return;
		}
		if (!showDropdown || suggestions.length === 0) return;

		switch (event.key) {
			case 'ArrowDown':
				event.preventDefault();
				activeIndex = activeIndex >= suggestions.length - 1 ? 0 : activeIndex + 1;
				break;
			case 'ArrowUp':
				event.preventDefault();
				activeIndex = activeIndex <= 0 ? suggestions.length - 1 : activeIndex - 1;
				break;
			case 'Enter':
				if (activeIndex >= 0 && activeIndex < suggestions.length) {
					event.preventDefault();
					selectLocation(suggestions[activeIndex]);
				}
				break;
		}
	}

	function selectLocation(location: string) {
		value = location;
		showDropdown = false;
		suggestions = [];
		activeIndex = -1;
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
		onkeydown={handleKeydown}
		{placeholder}
		class={inputClass}
		role="combobox"
		aria-expanded={showDropdown}
		aria-controls={listboxId}
		autocomplete="off"
	/>
	
	{#if showDropdown && (suggestions.length > 0 || recentLocations.length > 0)}
		<div id={listboxId} role="listbox" class="absolute z-10 mt-1 w-full rounded-lg border border-slate-200 bg-white shadow-lg max-h-64 overflow-y-auto">
			{#if suggestions.length > 0}
				<div class="p-1">
					<div class="px-3 py-1 text-xs font-medium text-slate-500">
						{loading ? 'Searching...' : 'Address Suggestions'}
					</div>
					{#each suggestions as suggestion, i}
						<button 
							type="button"
							role="option"
							aria-selected={i === activeIndex}
							onmousedown={(e) => {
								e.preventDefault();
								selectLocation(suggestion);
							}}
							class="flex w-full items-start gap-2 rounded-lg px-3 py-2 text-left text-sm hover:bg-slate-50 {i === activeIndex ? 'bg-slate-50' : ''}"
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
							role="option"
							aria-selected="false"
							onmousedown={(e) => {
								e.preventDefault();
								selectLocation(recent);
							}}
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