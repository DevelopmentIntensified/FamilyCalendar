<!--
	Modal / bottom-sheet shell. Folds the legacy EventModalShell and
	BottomSheetHandle (#039): one overlay, a scrollable body, Esc and backdrop
	close, a focus trap (trapFocus) that returns focus to the trigger, and — in
	the bottom variant — the grab handle that closes on a downward swipe past
	the legacy 100 px threshold (sheetSwipe).

	`title` is required: it names the dialog through aria-label. `subtitle` is
	EventModalShell's second header line. `swipeToClose={false}` ports the
	legacy `canStart` veto, so a sheet whose edit form is open cannot be
	dismissed by dragging.

	The parent owns `open`; this component only reports `onclose`, so a state
	class can keep the optimistic update in one place. Every close path (Esc,
	backdrop, header button, swipe) drops the drag offset, so a sheet dismissed
	mid-swipe reopens at rest.

	`testid` defaults to `sheet` and names the dialog, the close button
	(`${testid}-close`) and the backdrop (`${testid}-backdrop`) — two open sheets
	pass different ones and never share an id. Esc yields to a child that already
	handled the key (`defaultPrevented`), so a confirm inside a sheet cancels
	without closing the sheet too.

	Doc: src/lib/kernel/README.md
-->
<script lang="ts">
	import type { Snippet } from 'svelte';
	import { trapFocus } from './trapFocus';
	import {
		createSheetSwipe,
		endSheetSwipe,
		moveSheetSwipe,
		startSheetSwipe
	} from './sheetSwipe';

	interface Props {
		open: boolean;
		onclose: () => void;
		title: string;
		subtitle?: string;
		variant?: 'modal' | 'bottom';
		swipeToClose?: boolean;
		testid?: string;
		children: Snippet;
		footer?: Snippet;
	}

	let {
		open,
		onclose,
		title,
		subtitle,
		variant = 'modal',
		swipeToClose = true,
		testid = 'sheet',
		children,
		footer
	}: Props = $props();

	let swipe = $state(createSheetSwipe());

	// Every close path resets the drag, so a sheet dismissed mid-swipe reopens at
	// rest instead of still translated.
	function close() {
		swipe = createSheetSwipe();
		onclose();
	}

	function handleKeydown(event: KeyboardEvent) {
		if (!open || event.key !== 'Escape' || event.defaultPrevented) return;
		close();
	}

	function handleTouchStart(event: TouchEvent) {
		if (variant !== 'bottom' || !swipeToClose || event.touches.length !== 1) return;
		swipe = startSheetSwipe(event.touches[0].clientY);
	}

	function handleTouchMove(event: TouchEvent) {
		if (variant !== 'bottom' || !swipe.dragging) return;
		swipe = moveSheetSwipe(swipe, event.touches[0].clientY);
	}

	function handleTouchEnd() {
		if (variant !== 'bottom') return;
		const result = endSheetSwipe(swipe);
		swipe = result.state;
		if (result.closed) close();
	}
</script>

<svelte:window onkeydown={handleKeydown} />

{#if open}
	<div class="fixed inset-0 z-[60] flex items-end justify-center sm:items-center sm:p-4">
		<button
			type="button"
			class="absolute inset-0 bg-black/40 backdrop-blur-sm"
			aria-label="Close sheet"
			tabindex="-1"
			data-testid="{testid}-backdrop"
			onclick={close}
		></button>

		<div
			class="relative flex max-h-[92dvh] w-full max-w-lg transform flex-col overflow-hidden rounded-t-2xl bg-white shadow-2xl sm:max-h-[90vh] sm:rounded-2xl"
			style="transform: translateY({swipe.offset}px); transition: transform {swipe.transition
				? '150ms ease-out'
				: '0ms'}; touch-action: pan-y;"
			role="dialog"
			aria-modal="true"
			aria-label={title}
			data-testid={testid}
			use:trapFocus
		>
			{#if variant === 'bottom'}
				<!-- Grab handle: affordance plus the swipe-down-to-close zone. -->
				<div
					class="flex shrink-0 cursor-grab touch-none justify-center pb-1 pt-2 active:cursor-grabbing sm:hidden"
					data-drag-handle
					ontouchstart={handleTouchStart}
					ontouchmove={handleTouchMove}
					ontouchend={handleTouchEnd}
					aria-hidden="true"
				>
					<span class="h-1.5 w-10 rounded-full bg-slate-200"></span>
				</div>
			{/if}

			<div
				class="sticky top-0 z-10 flex shrink-0 items-center justify-between bg-gradient-to-r from-primary-500 to-primary-600 px-6 py-4"
			>
				<div>
					<h2 class="text-lg font-semibold text-white">{title}</h2>
					{#if subtitle}
						<p class="mt-0.5 text-xs text-primary-100">{subtitle}</p>
					{/if}
				</div>
				<button
					type="button"
					onclick={close}
					class="ml-auto rounded-full p-1.5 text-white/80 transition-colors hover:bg-white/20 hover:text-white"
					aria-label="Close modal"
					data-testid="{testid}-close"
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

			<div class="min-h-0 flex-1 overflow-y-auto overscroll-contain">
				{@render children()}
			</div>

			{@render footer?.()}
		</div>
	</div>
{/if}
