<!--
	Animated placeholder rows, so a streaming or loading section keeps its
	height instead of blanking the card (UI convention: skeletons, not empty
	cards). Folds the hand-drawn rows in AccountNotificationsSection, and the
	ChecklistSection and EventModal blocks that each drew their own shapes:

	- `lines` (default): `lines` text bars — the plain card placeholder;
	- `toggle`: a switch and two text lines, AccountNotificationsSection's row;
	- `row`: a circle and a bar in `slate-100`, ChecklistSection's checklist row;
	- `chips`: a heading and two chip groups, EventModal's attendee block.

	Reduced motion is already handled globally in src/app.css, exactly as for
	those legacy copies. The block is a `role="status"` named by `label`, so a
	screen reader hears "Loading checklist" instead of nothing.

	Doc: src/lib/kernel/README.md
-->
<script lang="ts">
	type Shape = 'lines' | 'toggle' | 'row' | 'chips';

	interface Props {
		/** Which legacy placeholder this reproduces. */
		shape?: Shape;
		/** How many rows — `lines` and `row` only (defaults 3 and 2). */
		lines?: number;
		/** What is loading, announced through `role="status"` ("Loading checklist"). */
		label?: string;
		class?: string;
		/** Base test id, so a page can address each placeholder separately. */
		testid?: string;
	}

	let {
		shape = 'lines',
		lines,
		label = 'Loading',
		class: className = '',
		testid = 'skeleton'
	}: Props = $props();

	/**
	 * Per shape: how many rows the legacy block drew (three text lines, one
	 * toggle row, two checklist pairs; the chip block counts its own groups), and
	 * the spacing it brings — the chip block spaces itself, so no `space-y`.
	 */
	const SHAPES: Record<Shape, { rows: number; spacing: string }> = {
		lines: { rows: 3, spacing: 'space-y-2' },
		toggle: { rows: 1, spacing: 'space-y-2' },
		row: { rows: 2, spacing: 'space-y-2' },
		chips: { rows: 0, spacing: '' }
	};
	const count = $derived(lines ?? SHAPES[shape].rows);
</script>

<div class="{SHAPES[shape].spacing} {className}" role="status" data-testid={testid}>
	<span class="sr-only">{label}</span>
	{#if shape === 'toggle'}
		{#each Array.from({ length: count }, (_, index) => index) as index (index)}
			<div class="flex items-center gap-3 py-2.5">
				<span
					data-skeleton-line
					class="h-[1.375rem] w-10 shrink-0 animate-pulse rounded-full bg-slate-200"></span>
				<span class="min-w-0 flex-1">
					<span data-skeleton-line class="block h-3.5 w-32 animate-pulse rounded bg-slate-200"
					></span>
					<span
						data-skeleton-line
						class="mt-1.5 block h-2.5 w-20 animate-pulse rounded bg-slate-100"></span>
				</span>
			</div>
		{/each}
	{:else if shape === 'row'}
		{#each Array.from({ length: count }, (_, index) => index) as index (index)}
			<div class="flex items-center gap-2 rounded px-1 py-1">
				<div data-skeleton-line class="h-4 w-4 shrink-0 animate-pulse rounded-full bg-slate-100"
				></div>
				<div data-skeleton-line class="h-3.5 flex-1 animate-pulse rounded bg-slate-100"></div>
			</div>
		{/each}
	{:else if shape === 'chips'}
		<div data-skeleton-line class="mb-4 h-4 w-24 animate-pulse rounded bg-slate-100"></div>
		<div class="mb-3 flex flex-wrap gap-1.5">
			{#each Array.from({ length: 3 }, (_, index) => index) as index (index)}
				<div data-skeleton-line class="h-7 w-24 animate-pulse rounded-full bg-slate-100"></div>
			{/each}
		</div>
		<div class="flex flex-wrap gap-1.5">
			{#each Array.from({ length: 2 }, (_, index) => index) as index (index)}
				<div data-skeleton-line class="h-7 w-20 animate-pulse rounded-full bg-slate-100"></div>
			{/each}
		</div>
	{:else}
		{#each Array.from({ length: count }, (_, index) => index) as index (index)}
			<div data-skeleton-line class="h-3.5 w-full animate-pulse rounded bg-slate-200"></div>
		{/each}
	{/if}
</div>
