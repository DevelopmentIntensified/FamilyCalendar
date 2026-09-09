<script lang="ts">
	import EmptyState from './EmptyState.svelte';
	import calendarNoteDate from '$lib/assets/svgs/calendar-note-date-svgrepo-com.svg';

	interface Props {
		onDismiss: () => void;
	}

	let { onDismiss }: Props = $props();
</script>

<div class="relative mx-auto mb-4 max-w-xl px-4 pt-4">
	<EmptyState
		illustration={calendarNoteDate}
		title="Blank calendar!"
		hint="Add your first thing — or start from ✨ Smart tasks."
	>
		<a
			href="/calendar/tasks"
			class="mt-4 rounded-lg bg-primary-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-primary-700"
		>
			Browse ✨ Smart tasks
		</a>
	</EmptyState>
	<button
		type="button"
		onclick={onDismiss}
		aria-label="Dismiss"
		class="absolute right-6 top-6 flex h-7 w-7 items-center justify-center rounded-full text-slate-400 hover:bg-white hover:text-slate-600"
	>
		<svg class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
			<path
				stroke-linecap="round"
				stroke-linejoin="round"
				stroke-width="2"
				d="M6 18L18 6M6 6l12 12"
			/>
		</svg>
	</button>
</div>
