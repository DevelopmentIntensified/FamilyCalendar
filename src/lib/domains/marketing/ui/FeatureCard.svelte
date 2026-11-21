<!--
	One feature card on `/features`: the tinted icon tile, the title and the blurb.
	The legacy `src/lib/components/marketing/FeatureCard.svelte` is the visual
	baseline; the icon data comes from the module's closed set.
-->
<script lang="ts">
	import { featureIcon, type FeatureIconName } from '../marketing.icons.rules';

	interface Props {
		icon: FeatureIconName;
		title: string;
		blurb: string;
	}

	let { icon, title, blurb }: Props = $props();

	const def = $derived(featureIcon(icon));
</script>

<div class="rounded-2xl border border-slate-200 bg-white p-6 transition-shadow hover:shadow-lg">
	<div class="mb-4 flex h-12 w-12 items-center justify-center rounded-xl {def.bg}">
		<svg
			class="h-6 w-6 {def.fg}"
			fill="none"
			viewBox="0 0 24 24"
			stroke="currentColor"
			stroke-width="2"
		>
			<!-- eslint-disable-next-line svelte/no-at-html-tags -- static in-file icon literals, never user input -->
			{@html def.body}
		</svg>
	</div>
	<h3 class="mb-2 text-lg font-bold text-slate-900">{title}</h3>
	<p class="text-slate-600">{blurb}</p>
</div>
