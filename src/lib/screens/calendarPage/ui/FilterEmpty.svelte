<!--
	The three filter empty states (legacy `Calendar.svelte:540-660`), one shape
	with three claims. Each replaces the grid on purpose — a blank grid reads as
	"nothing scheduled", which is a different (and wrong) thing to tell a family
	— and each makes the way back one tap.

	They are mutually exclusive and ordered by the page state: calendars, then
	search, then people, so a card only ever appears for its own claim.
-->
<script lang="ts">
	interface Props {
		kind: 'calendars' | 'search' | 'people';
		/** The switched-off calendars/people, by name (people: at most one names it). */
		labels: readonly string[];
		/** The query a search missed on. */
		query?: string;
		onexit: () => void;
	}

	let { kind, labels, query = '', onexit }: Props = $props();

	const copy = $derived.by(() => {
		if (kind === 'calendars') {
			const named =
				labels.length > 0
					? `${labels.join(', ')} ${labels.length === 1 ? 'is' : 'are'} hidden.`
					: 'Every calendar is hidden.';
			return {
				eyebrow: 'Filtered',
				title: 'Every calendar is hidden',
				body: `${named} Nothing is drawn until you turn one back on — your events and due tasks are all still here.`,
				action: 'Show all calendars'
			};
		}
		if (kind === 'search') {
			return {
				eyebrow: 'Searching',
				title: `Nothing matches “${query.trim()}”`,
				body: 'Nothing on this calendar matches those words. Everything is still here — only the view is narrowed.',
				action: 'Clear search'
			};
		}
		return {
			eyebrow: 'Filtered',
			title:
				labels.length === 1
					? `Nothing for ${labels[0]} in this view`
					: 'Nothing left in this view',
			body:
				labels.length === 1
					? `${labels[0]} is switched off, and another filter has taken what was left of their plans. Everything is still here — only the view is narrowed.`
					: 'Everyone is switched off, and another filter has taken the rest. Everything is still here — only the view is narrowed.',
			action: 'Show everyone'
		};
	});
</script>

<div
	class="flex flex-col items-center px-2 py-14 text-center sm:py-20"
	data-testid={kind === 'calendars'
		? 'calendar-filter-empty'
		: kind === 'search'
			? 'search-empty'
			: 'assignee-empty'}
>
	<svg
		class="mb-4 h-12 w-12 text-slate-300"
		fill="none"
		viewBox="0 0 24 24"
		stroke="currentColor"
		stroke-width="1.5"
		aria-hidden="true"
	>
		{#if kind === 'calendars'}
			<path stroke-linecap="round" stroke-linejoin="round" d="M3 5h18M6 12h12M10 19h4" />
		{:else if kind === 'search'}
			<path
				stroke-linecap="round"
				stroke-linejoin="round"
				d="M21 21l-4.35-4.35M17 11a6 6 0 11-12 0 6 6 0 0112 0z"
			/>
		{:else}
			<path
				stroke-linecap="round"
				stroke-linejoin="round"
				d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z"
			/>
		{/if}
	</svg>
	<p class="text-[11px] font-semibold uppercase tracking-wide text-slate-400">{copy.eyebrow}</p>
	<h2 class="mt-1 max-w-[16rem] text-lg font-medium text-slate-700 sm:max-w-none">{copy.title}</h2>
	<p class="mt-2 max-w-sm text-sm leading-relaxed text-slate-500">{copy.body}</p>
	<button
		type="button"
		data-testid={kind === 'calendars' ? 'calendar-filter-show-all' : undefined}
		onclick={onexit}
		class="mt-5 rounded-lg bg-primary-600 px-4 py-2.5 text-sm font-medium text-white transition-all hover:bg-primary-700 active:scale-[0.98]"
	>
		{copy.action}
	</button>
</div>
