<!--
	"Your RSVP": three buttons whose active one paints immediately. Clicking the
	active answer again clears it to `undecided` ("tap again to clear"), and a
	refusal rolls back and toasts (#227: never revert silently). The counts are
	the loaded member rows, so they move with an optimistic answer.

	The answers come from the modal's state class — this component calls its
	methods and renders, it never fetches.

	Doc: ../../README.md#public-interface
-->
<script lang="ts">
	import type { CalendarEventModalState } from '../calendar.eventModal.state.svelte';

	interface Props {
		state: CalendarEventModalState;
	}

	let { state }: Props = $props();

	const counts = $derived({
		going: state.attendees.filter((row) => row.status === 'going').length,
		maybe: state.attendees.filter((row) => row.status === 'maybe').length,
		declined: state.attendees.filter(
			(row) => row.status === 'declined' || row.status === 'not_going'
		).length
	});

	const OPTIONS = [
		{ status: 'going', label: 'Going' },
		{ status: 'maybe', label: 'Maybe' },
		{ status: 'declined', label: "Can't go" }
	] as const;

	const ACTIVE: Record<string, string> = {
		going: 'bg-green-600 text-white shadow-md shadow-green-600/30',
		maybe: 'bg-yellow-500 text-white shadow-md shadow-yellow-500/30',
		declined: 'bg-red-600 text-white shadow-md shadow-red-600/30'
	};
	const IDLE: Record<string, string> = {
		going: 'text-green-700 hover:bg-green-100/70',
		maybe: 'text-yellow-700 hover:bg-yellow-100/70',
		declined: 'text-red-700 hover:bg-red-100/70'
	};
</script>

<div class="border-t border-slate-100 px-4 py-4 sm:px-6">
	<div class="mb-2 flex items-center justify-between">
		<h3 class="text-sm font-semibold text-slate-700">Your RSVP</h3>
		{#if state.userRsvpStatus !== 'undecided'}
			<span class="text-[11px] text-slate-400">tap again to clear</span>
		{/if}
	</div>
	<div
		role="group"
		aria-label="Your RSVP"
		class="flex overflow-hidden rounded-xl border border-slate-200 bg-slate-50 p-1"
	>
		{#each OPTIONS as option (option.status)}
			{@const active = state.userRsvpStatus === option.status}
			<button
				type="button"
				onclick={() => void state.rsvp(option.status)}
				disabled={state.rsvpPending}
				aria-pressed={active}
				data-testid="rsvp-{option.status}"
				class="flex flex-1 items-center justify-center gap-1.5 rounded-lg px-2 py-3 text-sm font-medium transition-all disabled:opacity-60 {active
					? ACTIVE[option.status]
					: IDLE[option.status]}"
			>
				{#if option.status === 'going'}
					<svg class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
						<path
							stroke-linecap="round"
							stroke-linejoin="round"
							stroke-width="2"
							d="M5 13l4 4L19 7"
						/>
					</svg>
				{:else if option.status === 'maybe'}
					<svg class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
						<path
							stroke-linecap="round"
							stroke-linejoin="round"
							stroke-width="2"
							d="M8.228 9c.549-1.165 2.03-2 3.772-2 2.21 0 4 1.343 4 3 0 1.4-1.278 2.575-3.006 2.907-.542.104-.994.54-.994 1.093m0 3h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
						/>
					</svg>
				{:else}
					<svg class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
						<path
							stroke-linecap="round"
							stroke-linejoin="round"
							stroke-width="2"
							d="M6 18L18 6M6 6l12 12"
						/>
					</svg>
				{/if}
				{option.label}
				{#if counts[option.status] > 0}
					<span
						class="rounded-full px-1.5 py-0.5 text-[10px] font-bold {active
							? 'bg-white/25'
							: 'bg-slate-200 text-slate-600'}"
					>
						{counts[option.status]}
					</span>
				{/if}
			</button>
		{/each}
	</div>
</div>
