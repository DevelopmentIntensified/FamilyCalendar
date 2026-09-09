<script lang="ts">
	/** Mobile bottom-sheet grab handle: affordance + swipe-down-to-close zone. */
	interface Props {
		onDragStart: (e: TouchEvent) => void;
		onDragMove: (e: TouchEvent) => void;
		onDragEnd: () => void;
	}

	let { onDragStart, onDragMove, onDragEnd }: Props = $props();
</script>

<div
	class="flex shrink-0 cursor-grab touch-none justify-center pb-1 pt-2 active:cursor-grabbing sm:hidden"
	data-drag-handle
	ontouchstart={onDragStart}
	ontouchmove={onDragMove}
	ontouchend={onDragEnd}
	aria-hidden="true"
>
	<span class="h-1.5 w-10 rounded-full bg-slate-200"></span>
</div>
