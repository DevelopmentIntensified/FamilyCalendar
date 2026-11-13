<!--
	Renders the K-07 toast list. `ToastItem` is the type `createToasts` hands
	back (kernel/client/toasts.svelte.ts), imported rather than mirrored, so the
	list and the renderer cannot drift. White card and dismiss button are the
	legacy renderer's look ($lib/components/Toaster.svelte), and an `action` is
	that renderer's action button: it runs the callback, then dismisses.
	`data-kind` is the hook a later visual pass can style without changing the
	interface.

	The live region stays mounted while empty: a live region inserted together
	with its first message is not announced, which would make every toast
	silent to screen readers.

	Doc: src/lib/kernel/README.md
-->
<script lang="ts">
	import type { ToastItem } from '../client/toasts.svelte';

	interface Props {
		items: ToastItem[];
		ondismiss: (id: number) => void;
	}

	let { items, ondismiss }: Props = $props();

	function runAction(item: ToastItem) {
		item.action?.run();
		ondismiss(item.id);
	}
</script>

<div
	class="pointer-events-none fixed inset-x-0 bottom-20 z-[70] flex flex-col items-center gap-2 px-4 md:bottom-6 print:hidden"
	role="region"
	aria-label="Notifications"
	aria-live="polite"
>
	{#each items as item (item.id)}
		<div
			class="pointer-events-auto flex w-full max-w-sm items-center gap-3 rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-800 shadow-lg"
			data-kind={item.kind}
		>
			<span class="min-w-0 flex-1">{item.text}</span>
			{#if item.action}
				<button
					type="button"
					onclick={() => runAction(item)}
					class="shrink-0 rounded-lg px-2.5 py-1 text-xs font-semibold text-primary-600 transition-colors hover:bg-primary-50"
					data-testid="toast-action"
				>
					{item.action.label}
				</button>
			{/if}
			<button
				type="button"
				onclick={() => ondismiss(item.id)}
				class="shrink-0 rounded-full p-1 text-slate-300 transition-colors hover:bg-slate-100 hover:text-slate-500"
				aria-label="Dismiss notification"
				data-testid="toast-dismiss"
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
		</div>
	{/each}
</div>
