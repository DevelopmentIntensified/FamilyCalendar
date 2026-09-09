<script lang="ts">
	import { FEATURE_ICONS, type FeatureIcon } from './featureIcons';

	interface Props {
		icon: FeatureIcon;
		gradient: string;
		glow: string;
		title: string;
		blurb: string;
	}

	let { icon, gradient, glow, title, blurb }: Props = $props();

	let def = $derived(FEATURE_ICONS[icon]);
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
