<!--
	The offline banner: three facts from `ShellOfflineState` — offline, N changes
	waiting, or the 4 s "Synced N changes." receipt.

	The offline PARAGRAPH renders only while actually offline: a pending count on
	a working connection must not claim the app is offline (that was a real
	confusion in the legacy copy). `stacked` is the calendar frame's variant,
	which sits inside the measured banner stack; the family frame (and a bare
	mount) get the fixed variant.

	Doc: ../README.md#invariants
-->
<script lang="ts">
	import type { ShellOfflineState } from '../shell.offline.state.svelte.js';

	interface Props {
		state: ShellOfflineState;
		/** Inside the calendar frame's fixed banner stack (no own positioning). */
		stacked?: boolean;
	}

	let { state, stacked = false }: Props = $props();
</script>

{#if state.visible}
	<div
		class="{stacked
			? ''
			: 'fixed left-0 right-0 top-[calc(4rem+env(safe-area-inset-top))] z-30 '}border-b border-amber-300 bg-amber-100 px-4 py-2 text-sm text-amber-900"
		role="status"
		data-testid="shell-offline-banner"
	>
		{#if !state.online}
			<p class="mb-1 last:mb-0">
				You're offline — showing your recent events and tasks (this month, last month, next month).
				Months or tasks you haven't visited recently aren't available offline. Changes you make now
				will sync automatically when you're back online.
			</p>
		{/if}
		{#if state.pending > 0}
			<p class="font-medium">
				{state.pending}
				{state.pending === 1 ? 'change' : 'changes'} waiting to sync.
			</p>
		{:else if state.synced !== null}
			<p class="font-medium">
				Synced {state.synced}
				{state.synced === 1 ? 'change' : 'changes'}.
			</p>
		{/if}
	</div>
{/if}
