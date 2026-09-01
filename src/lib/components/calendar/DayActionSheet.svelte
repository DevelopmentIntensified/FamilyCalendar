<script lang="ts">
	import { DateTime } from 'luxon';

	export let date: DateTime;
	export let open = false;
	export let onAdd: (date: DateTime) => void = () => {};
	export let onViewEvents: () => void = () => {};
	export let onOpenDay: () => void = () => {};
	export let onClose: () => void = () => {};

	// Mobile bottom-sheet swipe-dismiss, mirroring EventModal's sheet.
	let dragging = false;
	let dragStartY = 0;
	let dragOffset = 0;
	let dragTransition = false;

	function close() {
		open = false;
		dragOffset = 0;
		dragTransition = false;
		onClose();
	}

	function onDragStart(e: TouchEvent) {
		if (e.touches.length !== 1 || !open) return;
		dragStartY = e.touches[0].clientY;
		dragOffset = 0;
		dragTransition = false;
		dragging = true;
	}

	function onDragMove(e: TouchEvent) {
		if (!dragging) return;
		dragOffset = Math.max(0, e.touches[0].clientY - dragStartY);
	}

	function onDragEnd() {
		if (!dragging) return;
		dragging = false;
		dragTransition = true;
		const shouldClose = dragOffset > 100;
		dragOffset = 0;
		if (shouldClose) close();
	}

	function add() {
		close();
		onAdd(date);
	}

	function viewEvents() {
		close();
		onViewEvents();
	}

	function openDay() {
		close();
		onOpenDay();
	}
</script>

<svelte:window on:keydown={(e) => open && e.key === 'Escape' && close()} />

{#if open}
	<div class="fixed inset-0 z-50 flex items-end justify-center overflow-hidden sm:items-center sm:p-4">
		<div
			class="absolute inset-0 bg-black/40 backdrop-blur-sm"
			onclick={close}
			role="presentation"
		></div>

		<div
			class="relative flex max-h-[92dvh] w-full flex-col overflow-hidden rounded-t-2xl bg-white shadow-2xl sm:max-h-[90vh] sm:max-w-md sm:rounded-2xl"
			style="transform: translateY({dragOffset}px); transition: transform {dragTransition ? '150ms ease-out' : '0ms'}; touch-action: pan-y;"
			role="dialog"
			aria-modal="true"
			aria-label="Day actions"
		>
			<!-- Grab handle (mobile): bottom-sheet affordance + swipe-down-to-close zone -->
			<div
				class="flex shrink-0 touch-none cursor-grab justify-center pb-1 pt-2 active:cursor-grabbing sm:hidden"
				data-drag-handle
				ontouchstart={onDragStart}
				ontouchmove={onDragMove}
				ontouchend={onDragEnd}
				aria-hidden="true"
			>
				<span class="h-1.5 w-10 rounded-full bg-slate-200"></span>
			</div>

			<!-- Header -->
			<div class="flex shrink-0 items-center justify-between gap-2 border-b border-slate-100 px-4 py-3 sm:px-6">
				<h2 class="text-lg font-bold text-slate-900 sm:text-xl">{date.toFormat('EEEE, MMMM d')}</h2>
				<button
					type="button"
					onclick={close}
					class="flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-600"
					aria-label="Close"
				>
					<svg class="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
						<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
					</svg>
				</button>
			</div>

			<!-- Actions -->
			<div class="min-h-0 flex-1 space-y-2 overflow-y-auto overscroll-contain p-4 sm:p-6">
				<button
					type="button"
					onclick={add}
					class="flex w-full items-center gap-3 rounded-xl border border-slate-200 bg-white px-4 py-3.5 text-left text-sm font-medium text-slate-700 transition-colors hover:bg-slate-50"
				>
					<span class="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary-100 text-primary-700">
						<svg class="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
							<path stroke-linecap="round" stroke-linejoin="round" d="M12 4v16m8-8H4" />
						</svg>
					</span>
					Add event
				</button>

				<a
					href="/calendar/dashboard?date={date.toISODate()}"
					class="flex w-full items-center gap-3 rounded-xl border border-slate-200 bg-white px-4 py-3.5 text-left text-sm font-medium text-slate-700 transition-colors hover:bg-slate-50"
				>
					<span class="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-slate-100 text-slate-600">
						<svg class="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.5">
							<path stroke-linecap="round" stroke-linejoin="round" d="M4 4h7v7H4zM13 4h7v7h-7zM4 13h7v7H4zM13 13h7v7h-7z" />
						</svg>
					</span>
					Open Day Dashboard
				</a>

				<button
					type="button"
					onclick={viewEvents}
					class="flex w-full items-center gap-3 rounded-xl border border-slate-200 bg-white px-4 py-3.5 text-left text-sm font-medium text-slate-700 transition-colors hover:bg-slate-50"
				>
					<span class="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-slate-100 text-slate-600">
						<svg class="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.5">
							<path stroke-linecap="round" stroke-linejoin="round" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
						</svg>
					</span>
					View this day's events
				</button>

				<button
					type="button"
					onclick={openDay}
					class="flex w-full items-center gap-3 rounded-xl border border-slate-200 bg-white px-4 py-3.5 text-left text-sm font-medium text-slate-700 transition-colors hover:bg-slate-50"
				>
					<span class="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-slate-100 text-slate-600">
						<svg class="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.5">
							<path stroke-linecap="round" stroke-linejoin="round" d="M9 19V6l12-3v13M9 19c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zm12-3c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zM9 10l12-3" />
						</svg>
					</span>
					Open Day View
				</button>
			</div>
		</div>
	</div>
{/if}
