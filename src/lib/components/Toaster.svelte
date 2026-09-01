<script lang="ts">
	import { toasts, dismissToast, type Toast } from '$lib/client/toasts';

	function run(t: Toast) {
		t.onAction?.();
		dismissToast(t.id);
	}
</script>

{#if $toasts.length > 0}
	<div
		class="pointer-events-none fixed inset-x-0 bottom-20 z-[70] flex flex-col items-center gap-2 px-4 md:bottom-6 print:hidden"
		role="region"
		aria-label="Notifications"
	>
		{#each $toasts as toast (toast.id)}
			<div
				class="pointer-events-auto flex w-full max-w-sm items-center gap-3 rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-800 shadow-lg"
				role="status"
			>
				<span class="min-w-0 flex-1">{toast.message}</span>
				{#if toast.actionLabel}
					<button
						type="button"
						onclick={() => run(toast)}
						class="shrink-0 rounded-lg px-2.5 py-1 text-xs font-semibold text-primary-600 transition-colors hover:bg-primary-50"
					>
						{toast.actionLabel}
					</button>
				{/if}
				<button
					type="button"
					onclick={() => dismissToast(toast.id)}
					class="shrink-0 rounded-full p-1 text-slate-300 transition-colors hover:bg-slate-100 hover:text-slate-500"
					aria-label="Dismiss notification"
				>
					<svg class="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
						<path stroke-linecap="round" stroke-linejoin="round" d="M6 18L18 6M6 6l12 12" />
					</svg>
				</button>
			</div>
		{/each}
	</div>
{/if}