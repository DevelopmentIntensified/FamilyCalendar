<!--
	The board's tag filter: a search field with a clear button and the
	"Filtering by #tag" note. Rebuilt here because `tasks` exports no filter
	input; the copy and look are the legacy `components/tasks/TaskTagFilter.svelte`.
-->
<script lang="ts">
	interface Props {
		value: string;
		onchange: (value: string) => void;
	}

	let { value, onchange }: Props = $props();
</script>

<div class="mb-4">
	<div class="relative">
		<svg
			class="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400"
			fill="none"
			viewBox="0 0 24 24"
			stroke="currentColor"
			stroke-width="2"
			aria-hidden="true"
		>
			<path
				stroke-linecap="round"
				stroke-linejoin="round"
				d="M21 21l-4.35-4.35M17 10.5a6.5 6.5 0 11-13 0 6.5 6.5 0 0113 0z"
			/>
		</svg>
		<input
			type="text"
			{value}
			oninput={(event: Event & { currentTarget: EventTarget & HTMLInputElement }) =>
				onchange(event.currentTarget.value)}
			placeholder="Filter by #tag..."
			aria-label="Filter tasks by tag"
			class="w-full rounded-lg border border-slate-300 bg-white py-2 pl-9 pr-9 text-sm text-slate-700 placeholder:text-slate-400 focus:border-primary-500 focus:outline-none"
		/>
		{#if value.trim()}
			<button
				type="button"
				onclick={() => onchange('')}
				aria-label="Clear tag filter"
				class="absolute right-2 top-1/2 flex h-5 w-5 -translate-y-1/2 items-center justify-center rounded-full text-slate-400 hover:bg-slate-100 hover:text-slate-600"
			>
				<svg
					class="h-3.5 w-3.5"
					fill="none"
					viewBox="0 0 24 24"
					stroke="currentColor"
					stroke-width="2"
				>
					<path stroke-linecap="round" stroke-linejoin="round" d="M6 18L18 6M6 6l12 12" />
				</svg>
			</button>
		{/if}
	</div>
	{#if value.trim()}
		<p class="mt-1.5 text-xs text-sky-600">
			Filtering by <span class="font-medium">#{value.trim().toLowerCase()}</span>
		</p>
	{/if}
</div>
