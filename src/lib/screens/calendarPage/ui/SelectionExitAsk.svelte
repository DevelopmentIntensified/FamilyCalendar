<!--
	The inline ask a drag raises in Selection mode (legacy `ExitSelectionAsk`,
	which replaced `window.confirm`): dragging an Event means leaving selection,
	and leaving it throws the selection away, so the person is asked first.
-->
<script lang="ts">
	interface Props {
		open: boolean;
		onexit: () => void;
		onstay: () => void;
	}

	let { open, onexit, onstay }: Props = $props();
</script>

{#if open}
	<div
		class="fixed bottom-14 left-1/2 z-40 w-[calc(100%-1.5rem)] max-w-3xl -translate-x-1/2 rounded-xl border border-slate-200 bg-white p-3 shadow-xl"
		role="alertdialog"
		aria-label="Exit selection mode"
	>
		<div class="flex flex-wrap items-center gap-2">
			<span class="text-xs font-medium text-slate-700">Exit selection mode to move this event?</span>
			<button
				type="button"
				onclick={onexit}
				class="rounded-lg bg-primary-600 px-2.5 py-1.5 text-xs font-semibold text-white hover:bg-primary-700"
			>
				Exit selection
			</button>
			<button
				type="button"
				onclick={onstay}
				class="rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50"
			>
				Stay
			</button>
		</div>
	</div>
{/if}
