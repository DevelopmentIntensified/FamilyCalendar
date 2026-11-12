<!--
	Renders the K-07 toast list. The shared `ToastItem` type arrives with
	kernel/client; this declares the same shape locally so kernel/ui keeps
	working without importing client code. White card and dismiss button are the
	legacy renderer's look ($lib/components/Toaster.svelte); `data-kind` is the
	hook a later visual pass can style without changing the interface.

	The live region stays mounted while empty: a live region inserted together
	with its first message is not announced, which would make every toast
	silent to screen readers.

	Doc: src/lib/kernel/README.md
-->
<script lang="ts">
	type ToastKind = 'success' | 'error' | 'info';

	type ToastItem = { id: number; kind: ToastKind; text: string };

	interface Props {
		items: ToastItem[];
		ondismiss: (id: number) => void;
	}

	let { items, ondismiss }: Props = $props();
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
			<button
				type="button"
				onclick={() => ondismiss(item.id)}
				class="shrink-0 rounded-full p-1 text-slate-300 transition-colors hover:bg-slate-100 hover:text-slate-500"
				aria-label="Dismiss notification"
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
