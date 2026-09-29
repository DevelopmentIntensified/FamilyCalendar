<script lang="ts">
	import {
		CHIP_GAP_PX,
		chipA11y,
		chipTreatment,
		chipWord,
		type ChipDensity,
		type ChipKind
	} from '$lib/utils/chipVocabulary';

	interface Props {
		kind: ChipKind;
		/** `word` shows the kind's word where the view has room; `glyph` shows
		 *  the mark alone and keeps the kind in a screen-reader phrase. */
		density?: ChipDensity;
		class?: string;
	}

	let { kind, density = 'glyph', class: extra = '' }: Props = $props();

	const t = $derived(chipTreatment(kind));
	const word = $derived(chipWord(kind, density));
	const a11y = $derived(chipA11y(kind, density));
</script>

<!-- The leading mark for a chip (#068). One component so month, week, day and
	list cannot drift: same box, same gap, same shapes, per-view word only. -->
<span
	class="inline-flex shrink-0 items-center {extra}"
	style="gap:{CHIP_GAP_PX}px"
	data-chip-mark={kind}
>
	<span
		class="inline-flex items-center justify-center {t.glyphClass}"
		style="width:{t.glyph.box}px;height:{t.glyph.box}px"
		aria-hidden="true"
	>
		{#if t.glyph.name === 'bag'}
			<svg
				fill="currentColor"
				viewBox="0 0 20 20"
				style="width:{t.glyph.width}px;height:{t.glyph.height}px"
			>
				<path
					d="M3 4a1 1 0 011-1h12a1 1 0 011 1v2a1 1 0 01-1 1H4a1 1 0 01-1-1V4zM3 10a1 1 0 011-1h6a1 1 0 011 1v6a1 1 0 01-1 1H4a1 1 0 01-1-1v-6zM14 9a1 1 0 00-1 1v6a1 1 0 001 1h2a1 1 0 001-1v-6a1 1 0 00-1-1h-2z"
				/>
			</svg>
		{:else}
			<span
				class="inline-block bg-current"
				style="width:{t.glyph.width}px;height:{t.glyph.height}px;border-radius:{t.glyph.radius};{t
					.glyph.stroke
					? `border:${t.glyph.stroke}px solid currentColor;background:none;`
					: ''}"
			></span>
		{/if}
	</span>
	{#if word}
		<span class={t.wordClass} data-chip-word={word}>{word}</span>
	{:else if a11y}
		<span class="sr-only" data-chip-a11y={a11y}>{a11y}</span>
	{/if}
</span>
