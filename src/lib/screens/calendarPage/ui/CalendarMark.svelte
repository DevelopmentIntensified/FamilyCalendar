<!--
	The leading mark of a chip (#068), in the screen's own chunk: calendar's
	shared `CalendarEventChipMark` sits behind `calendar/ui`, whose barrel carries
	the whole event form (zod, the form state, the sheet) onto the month grid's
	first paint. Same markup, from calendar's own treatment table
	(`chipTreatment`/`chipWord`/`chipA11y`), so the mark reads identically.
-->
<script lang="ts">
	import {
		chipA11y,
		chipTreatment,
		chipWord,
		type ChipDensity,
		type ChipKind
	} from '$lib/domains/calendar/index';

	interface Props {
		kind: ChipKind;
		density?: ChipDensity;
	}

	let { kind, density = 'glyph' }: Props = $props();

	/** calendar's `CHIP_GAP_PX` (not part of its public entry): the glyph-to-word gap. */
	const GAP_PX = 2;

	const treatment = $derived(chipTreatment(kind));
	const word = $derived(chipWord(kind, density));
	const a11y = $derived(chipA11y(kind, density));
</script>

<span class="inline-flex shrink-0 items-center" style="gap:{GAP_PX}px" data-chip-mark={kind}>
	<span
		class="inline-flex items-center justify-center {treatment.glyphClass}"
		style="width:{treatment.glyph.box}px;height:{treatment.glyph.box}px"
		aria-hidden="true"
	>
		{#if treatment.glyph.name === 'bag'}
			<svg
				fill="currentColor"
				viewBox="0 0 20 20"
				style="width:{treatment.glyph.width}px;height:{treatment.glyph.height}px"
			>
				<path
					d="M3 4a1 1 0 011-1h12a1 1 0 011 1v2a1 1 0 01-1 1H4a1 1 0 01-1-1V4zM3 10a1 1 0 011-1h6a1 1 0 011 1v6a1 1 0 01-1 1H4a1 1 0 01-1-1v-6zM14 9a1 1 0 00-1 1v6a1 1 0 001 1h2a1 1 0 001-1v-6a1 1 0 00-1-1h-2z"
				/>
			</svg>
		{:else}
			<span
				class="inline-block bg-current"
				style="width:{treatment.glyph.width}px;height:{treatment.glyph.height}px;border-radius:{treatment
					.glyph.radius};{treatment.glyph.stroke
					? `border:${treatment.glyph.stroke}px solid currentColor;background:none;`
					: ''}"
			></span>
		{/if}
	</span>
	{#if word}
		<span class={treatment.wordClass} data-chip-word={word}>{word}</span>
	{:else if a11y}
		<span class="sr-only" data-chip-a11y={a11y}>{a11y}</span>
	{/if}
</span>
