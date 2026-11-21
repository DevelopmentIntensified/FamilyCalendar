<!--
	The location field: 50 ms debounce, a 2-character minimum, five suggestions
	from `/api/location-search`, and the viewer's last five picks kept on the
	device. A newer keystroke's answer wins; an older one landing late is
	dropped (issue 263) — the api client has no abort signal, so a request token
	does the same job.

	Doc: ../../README.md#public-interface
-->
<script lang="ts">
	import { localPref } from '$lib/kernel/client/localPref';
	import type { CalendarApi } from '../calendar.api';

	interface Props {
		value: string;
		onvalue: (value: string) => void;
		api: CalendarApi;
		placeholder?: string;
	}

	let {
		value,
		onvalue,
		api,
		placeholder = 'Where? (address or any place)'
	}: Props = $props();

	const recents = localPref<string[]>({
		key: 'calendar:recentLocations',
		version: 1,
		fallback: [],
		parse: (raw) =>
			Array.isArray(raw) ? raw.filter((item): item is string => typeof item === 'string') : null
	});

	let showDropdown = $state(false);
	let suggestions = $state<string[]>([]);
	let recentLocations = $state<string[]>(recents.read());
	let loading = $state(false);
	let activeIndex = $state(-1);
	let requestToken = 0;
	const listboxId = $props.id();

	function remember(location: string) {
		if (!location.trim()) return;
		recentLocations = [location, ...recentLocations.filter((item) => item !== location)].slice(
			0,
			5
		);
		recents.write(recentLocations);
	}

	function select(location: string) {
		onvalue(location);
		showDropdown = false;
		suggestions = [];
		activeIndex = -1;
		remember(location);
	}

	async function search(query: string) {
		const token = ++requestToken;
		loading = true;
		try {
			const result = await api.searchLocations(query);
			if (token !== requestToken) return;
			suggestions = result.ok
				? (result.data.results ?? []).map((row) => row.label).slice(0, 5)
				: [];
			activeIndex = -1;
			showDropdown = suggestions.length > 0;
		} finally {
			if (token === requestToken) loading = false;
		}
	}

	let searchTimer: ReturnType<typeof setTimeout> | undefined;

	function input(next: string) {
		onvalue(next);
		clearTimeout(searchTimer);
		if (next.length < 2) {
			requestToken++;
			suggestions = [];
			showDropdown = false;
			activeIndex = -1;
			return;
		}
		searchTimer = setTimeout(() => void search(next), 50);
	}

	function keydown(event: KeyboardEvent) {
		if (event.key === 'Escape') {
			showDropdown = false;
			activeIndex = -1;
			return;
		}
		if (!showDropdown || suggestions.length === 0) return;
		if (event.key === 'ArrowDown') {
			event.preventDefault();
			activeIndex = activeIndex >= suggestions.length - 1 ? 0 : activeIndex + 1;
		} else if (event.key === 'ArrowUp') {
			event.preventDefault();
			activeIndex = activeIndex <= 0 ? suggestions.length - 1 : activeIndex - 1;
		} else if (event.key === 'Enter' && activeIndex >= 0 && activeIndex < suggestions.length) {
			event.preventDefault();
			select(suggestions[activeIndex]);
		}
	}
</script>

<div class="relative">
	<input
		type="text"
		{value}
		oninput={(event) => input(event.currentTarget.value)}
		onfocus={() => {
			if (recentLocations.length > 0 || suggestions.length > 0) showDropdown = true;
		}}
		onblur={() => {
			showDropdown = false;
			activeIndex = -1;
		}}
		onkeydown={keydown}
		{placeholder}
		class="w-full rounded-lg border border-slate-200 px-3 py-2.5 text-sm"
		role="combobox"
		aria-expanded={showDropdown}
		aria-controls={listboxId}
		autocomplete="off"
		data-testid="location-input"
	/>

	{#if showDropdown && (suggestions.length > 0 || recentLocations.length > 0)}
		<div
			id={listboxId}
			role="listbox"
			class="absolute z-10 mt-1 max-h-64 w-full overflow-y-auto rounded-lg border border-slate-200 bg-white shadow-lg"
		>
			{#if suggestions.length > 0}
				<div class="p-1">
					<div class="px-3 py-1 text-xs font-medium text-slate-500">
						{loading ? 'Searching...' : 'Address Suggestions'}
					</div>
					{#each suggestions as suggestion, index (suggestion)}
						<button
							type="button"
							role="option"
							aria-selected={index === activeIndex}
							onmousedown={(event) => {
								event.preventDefault();
								select(suggestion);
							}}
							class="flex w-full items-start gap-2 rounded-lg px-3 py-2 text-left text-sm hover:bg-slate-50 {index ===
							activeIndex
								? 'bg-slate-50'
								: ''}"
						>
							<svg
								class="mt-0.5 h-4 w-4 shrink-0 text-slate-400"
								fill="none"
								viewBox="0 0 24 24"
								stroke="currentColor"
							>
								<path
									stroke-linecap="round"
									stroke-linejoin="round"
									stroke-width="2"
									d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z"
								/>
								<path
									stroke-linecap="round"
									stroke-linejoin="round"
									stroke-width="2"
									d="M15 11a3 3 0 11-6 0 3 3 0 016 0z"
								/>
							</svg>
							<span class="line-clamp-2">{suggestion}</span>
						</button>
					{/each}
				</div>
			{/if}
			{#if recentLocations.length > 0}
				<div class="border-t border-slate-100 p-1">
					<div class="px-3 py-1 text-xs font-medium text-slate-500">Recent</div>
					{#each recentLocations as recent (recent)}
						<button
							type="button"
							role="option"
							aria-selected="false"
							onmousedown={(event) => {
								event.preventDefault();
								select(recent);
							}}
							class="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm hover:bg-slate-50"
						>
							<svg
								class="h-4 w-4 shrink-0 text-slate-400"
								fill="none"
								viewBox="0 0 24 24"
								stroke="currentColor"
							>
								<path
									stroke-linecap="round"
									stroke-linejoin="round"
									stroke-width="2"
									d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"
								/>
							</svg>
							<span class="truncate">{recent}</span>
						</button>
					{/each}
				</div>
			{/if}
		</div>
	{/if}
</div>
