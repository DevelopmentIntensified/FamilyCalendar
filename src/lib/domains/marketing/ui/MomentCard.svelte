<!--
	One "moment" card on `/features`: a gradient tile, the icon on a white chip and
	the family-life blurb. The legacy `MomentCard.svelte` is the visual baseline;
	the gradient and the glow are the page's (each moment owns its own pair).
-->
<script lang="ts">
	import { featureIcon, type FeatureIconName } from '../marketing.icons.rules';

	interface Props {
		icon: FeatureIconName;
		gradient: string;
		glow: string;
		title: string;
		blurb: string;
	}

	let { icon, gradient, glow, title, blurb }: Props = $props();

	const def = $derived(featureIcon(icon));
</script>

<div
	class="group relative overflow-hidden rounded-3xl bg-gradient-to-br {gradient} p-8 transition-all hover:shadow-lg"
>
	<div class="mb-6 flex h-16 w-16 items-center justify-center rounded-2xl {def.bg} shadow-sm">
		{#if def.filled}
			<svg class="h-8 w-8 {def.fg}" fill="currentColor" viewBox="0 0 24 24">
				<!-- eslint-disable-next-line svelte/no-at-html-tags -- static in-file icon literals, never user input -->
				{@html def.body}
			</svg>
		{:else}
			<svg
				class="h-8 w-8 {def.fg}"
				fill="none"
				viewBox="0 0 24 24"
				stroke="currentColor"
				stroke-width={def.strokeWidth ?? '2'}
			>
				<!-- eslint-disable-next-line svelte/no-at-html-tags -- static in-file icon literals, never user input -->
				{@html def.body}
			</svg>
		{/if}
	</div>
	<h3 class="mb-2 text-xl font-bold text-slate-900">{title}</h3>
	<p class="text-slate-600">{blurb}</p>
	<div class="absolute -bottom-4 -right-4 h-24 w-24 rounded-full {glow} blur-xl"></div>
</div>
