<!--
	The six approved family colours, each named in plain words so colour is
	never the only cue. The selected swatch has a dark ring; the page's live
	preview and the hidden `color` input both read the same value.

	Doc: ../README.md#public-interface
-->
<script lang="ts">
	import { FAMILY_PALETTE } from '../family.palette.rules';
	import { familyPaletteName } from '../family.create.rules';

	interface Props {
		/** The chosen hex value. */
		color: string;
		onpick: (value: string) => void;
	}

	let { color, onpick }: Props = $props();

	const selectedName = $derived(familyPaletteName(color));
</script>

<div class="space-y-3">
	<span class="block text-sm font-medium text-slate-500">Colour</span>
	<div class="flex flex-wrap gap-2.5" role="group" aria-label="Family colour">
		{#each FAMILY_PALETTE as swatch (swatch.value)}
			<button
				type="button"
				aria-label={swatch.name}
				aria-pressed={color === swatch.value}
				onclick={() => onpick(swatch.value)}
				class="h-9 w-9 rounded-full ring-offset-2 transition-transform hover:scale-110 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-500 {color ===
				swatch.value
					? 'ring-2 ring-slate-900'
					: ''}"
				style="background-color: {swatch.value}"
			></button>
		{/each}
	</div>
	<span class="sr-only" aria-live="polite">{selectedName} selected</span>

	<input type="hidden" id="color" name="color" aria-label="Family colour value" value={color} />

	<p class="text-xs leading-relaxed text-slate-500">
		The colour tints the family calendar, the member avatars and the family chip. It is the one
		thing on this page that ends up visible everywhere else.
	</p>
</div>
