<!--
	The bell's push section: enable, enabled + turn off, or blocked. The four
	approved sentences are the legacy ones ("Enable push notifications",
	"Push notifications enabled.", "Push notifications on" + "Turn off",
	"Notifications blocked in browser settings."); failure copy comes from
	`pushFailureText`.

	Presentation only: the click calls the caller's `onenable`/`ondisable`, and
	the caller owns the permission flow (`subscribeToPush`).

	Doc: ../README.md#invariants
-->
<script lang="ts">
	import type { PushState } from '../alerts.push.api';
	import type { AlertPushFeedback } from '../alerts.bell.state.svelte.js';

	interface Props {
		/** null until the browser check answers; 'unsupported' hides the block. */
		state: PushState | null;
		/** The server published a VAPID key, so enabling can work. */
		serverReady: boolean;
		busy: boolean;
		feedback: AlertPushFeedback | null;
		onenable: () => void;
		ondisable: () => void;
	}

	let { state, serverReady, busy, feedback, onenable, ondisable }: Props = $props();

	const visible = $derived(
		state !== null && (state === 'denied' || (state !== 'unsupported' && serverReady))
	);
</script>

{#if visible}
	<div class="mt-2 border-t border-slate-100 pt-2 text-sm">
		{#if state === 'unsubscribed'}
			<button
				type="button"
				onclick={onenable}
				disabled={busy}
				class="w-full px-4 py-2 text-left text-sm font-medium text-primary-600 hover:bg-primary-50 disabled:opacity-50"
			>
				{busy ? 'Enabling…' : 'Enable push notifications'}
			</button>
			{#if feedback?.kind === 'success'}
				<p class="px-4 pb-1.5 pt-1 text-xs text-green-600">{feedback.text}</p>
			{:else if feedback?.kind === 'error'}
				<p class="px-4 pb-1.5 pt-1 text-xs text-red-500">{feedback.text}</p>
			{/if}
		{:else if state === 'subscribed'}
			<div class="flex items-center justify-between px-4 py-2">
				<span class="text-slate-500">
					<span class="text-green-600" aria-hidden="true">✓</span> Push notifications on
				</span>
				<button
					type="button"
					onclick={ondisable}
					disabled={busy}
					class="text-xs text-slate-400 hover:text-slate-600 disabled:opacity-50"
				>
					Turn off
				</button>
			</div>
		{:else if state === 'denied'}
			<p class="px-4 py-2 text-slate-400">Notifications blocked in browser settings.</p>
		{/if}
	</div>
{/if}
