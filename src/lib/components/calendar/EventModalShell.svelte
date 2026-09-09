<script lang="ts">
	import type { Snippet } from 'svelte';
	import { trapFocusAction } from '$lib/utils/focusTrap';

	interface Props {
		title: string;
		subtitle: string | null;
		dragOffset: number;
		dragTransition: boolean;
		onClose: () => void;
		onDragStart: (e: TouchEvent) => void;
		onDragMove: (e: TouchEvent) => void;
		onDragEnd: () => void;
		children?: Snippet;
	}

	let {
		title,
		subtitle,
		dragOffset,
		dragTransition,
		onClose,
		onDragStart,
		onDragMove,
		onDragEnd,
		children
	}: Props = $props();
</script>

<div
	class="fixed inset-0 z-[60] flex items-end justify-center bg-black/40 backdrop-blur-sm sm:items-center sm:p-4"
	on:click={onClose}
	role="presentation"
>
	<!-- svelte-ignore a11y-no-noninteractive-element-interactions -->
	<div
		class="flex max-h-[92dvh] w-full max-w-lg transform flex-col overflow-hidden rounded-t-2xl bg-white shadow-2xl sm:max-h-[90vh] sm:rounded-2xl"
		style="transform: translateY({dragOffset}px); transition: transform {dragTransition
			? '150ms ease-out'
			: '0ms'}; touch-action: pan-y;"
		on:click|stopPropagation
		on:keydown|stopPropagation
		role="dialog"
		aria-modal="true"
		aria-labelledby="modal-title"
		use:trapFocusAction
	>
		<!-- Grab handle (mobile): bottom-sheet affordance + swipe-down-to-close zone -->
		<div
			class="flex shrink-0 cursor-grab touch-none justify-center pb-1 pt-2 active:cursor-grabbing sm:hidden"
			data-drag-handle
			on:touchstart={onDragStart}
			on:touchmove={onDragMove}
			on:touchend={onDragEnd}
			aria-hidden="true"
		>
			<span class="h-1.5 w-10 rounded-full bg-slate-200"></span>
		</div>
		<div
			class="sticky top-0 z-10 shrink-0 bg-gradient-to-r from-primary-500 to-primary-600 px-6 py-4"
		>
			<div class="flex items-center justify-between">
				<div>
					<h2 id="modal-title" class="text-lg font-semibold text-white">{title}</h2>
					{#if subtitle}
						<p class="mt-0.5 text-xs text-primary-100">{subtitle}</p>
					{/if}
				</div>
				<button
					type="button"
					on:click={onClose}
					class="rounded-full p-1.5 text-white/80 transition-colors hover:bg-white/20 hover:text-white"
					aria-label="Close modal"
				>
					<svg
						class="h-4 w-4"
						fill="none"
						viewBox="0 0 24 24"
						stroke="currentColor"
						stroke-width="2"
					>
						<path stroke-linecap="round" stroke-linejoin="round" d="M6 18L18 6M6 6l12 12" />
					</svg>
				</button>
			</div>
		</div>
		{@render children?.()}
	</div>
</div>
