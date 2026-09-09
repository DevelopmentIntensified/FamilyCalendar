<script lang="ts">
	import type { Event } from '$lib/types';
	import { buildGoogleCalendarUrl } from '$lib/utils/ics';

	interface Props {
		event: Event;
	}

	let { event }: Props = $props();

	let open = $state(false);

	let icsUrl = $derived(`/api/events/${encodeURIComponent(event.id)}/ics`);
	let googleCalendarUrl = $derived(
		buildGoogleCalendarUrl({
			id: event.masterId || event.id,
			title: event.title,
			start: event.start,
			end: event.end,
			allDay: !!event.allDay,
			description: event.description,
			location: event.location,
			recurrence: event.recurrenceFrequency
				? {
						recurrenceFrequency: event.recurrenceFrequency,
						recurrenceInterval: event.recurrenceInterval ?? null,
						recurrenceByDay: event.recurrenceByDay ?? null,
						recurrenceCount: event.recurrenceCount ?? null,
						recurrenceUntil: event.recurrenceUntil ?? null
					}
				: null,
			timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone
		})
	);

	function closeOnOutside(e: MouseEvent) {
		const target = e.target instanceof Element ? e.target : null;
		if (!target?.closest('[data-testid="event-export-menu"]')) {
			open = false;
		}
	}
</script>

<svelte:window onclick={closeOnOutside} onkeydown={(e) => e.key === 'Escape' && (open = false)} />

<div class="relative shrink-0" data-testid="event-export-menu">
	<button
		type="button"
		onclick={() => (open = !open)}
		class="flex h-11 w-11 items-center justify-center rounded-full text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-600"
		aria-label="Export options"
		aria-haspopup="menu"
		aria-expanded={open}
	>
		<svg class="h-5 w-5" fill="currentColor" viewBox="0 0 20 20" aria-hidden="true">
			<path
				d="M10 3a1.5 1.5 0 110 3 1.5 1.5 0 010-3zM10 8.5a1.5 1.5 0 110 3 1.5 1.5 0 010-3zM10 14a1.5 1.5 0 110 3 1.5 1.5 0 010-3z"
			/>
		</svg>
	</button>
	{#if open}
		<div
			role="menu"
			class="absolute right-0 top-full z-10 mt-1 w-48 overflow-hidden rounded-xl border border-slate-200 bg-white py-1 shadow-lg"
		>
			<a
				role="menuitem"
				href={googleCalendarUrl}
				target="_blank"
				rel="noopener noreferrer"
				class="flex items-center gap-2 px-4 py-2.5 text-sm font-medium text-slate-700 transition-colors hover:bg-slate-50"
			>
				<svg class="h-4 w-4 text-slate-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
					<path
						stroke-linecap="round"
						stroke-linejoin="round"
						stroke-width="2"
						d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"
					/>
				</svg>
				Add to Google
			</a>
			<a
				role="menuitem"
				href={icsUrl}
				download
				class="flex items-center gap-2 px-4 py-2.5 text-sm font-medium text-slate-700 transition-colors hover:bg-slate-50"
			>
				<svg class="h-4 w-4 text-slate-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
					<path
						stroke-linecap="round"
						stroke-linejoin="round"
						stroke-width="2"
						d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"
					/>
				</svg>
				Add to .ics
			</a>
		</div>
	{/if}
</div>
