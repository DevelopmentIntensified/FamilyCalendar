<!--
	Animated placeholder rows, so a streaming or loading section keeps its
	height instead of blanking the card (UI convention: skeletons, not empty
	cards). Folds the hand-drawn rows in AccountNotificationsSection,
	ChecklistSection and EventModal. Reduced motion is already handled globally
	in src/app.css, exactly as for those legacy copies.

	Doc: src/lib/kernel/README.md
-->
<script lang="ts">
	interface Props {
		lines?: number;
		class?: string;
	}

	let { lines = 3, class: className = '' }: Props = $props();
</script>

<div class="space-y-2 {className}" aria-hidden="true" data-testid="skeleton">
	{#each Array.from({ length: lines }, (_, index) => index) as index (index)}
		<div data-skeleton-line class="h-3.5 w-full animate-pulse rounded bg-slate-200"></div>
	{/each}
</div>
