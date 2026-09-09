<script lang="ts">
	interface Props {
		name: string;
		blurb: string;
		price: string;
		per: string;
		features: string[];
		ctaLabel: string;
		badge?: string | null;
		note?: string | null;
		accent?: 'plain' | 'primary' | 'amber';
	}

	let {
		name,
		blurb,
		price,
		per,
		features,
		ctaLabel,
		badge = null,
		note = null,
		accent = 'plain'
	}: Props = $props();

	const cardCls =
		accent === 'primary'
			? 'relative rounded-2xl border-2 border-primary-500 bg-white p-8 shadow-lg'
			: accent === 'amber'
				? 'rounded-2xl border-2 border-amber-500 bg-gradient-to-br from-amber-50 to-yellow-50 p-8'
				: 'rounded-2xl border border-slate-200 bg-white p-8 shadow-sm transition-shadow hover:shadow-lg';

	const ctaCls =
		accent === 'primary'
			? 'block w-full rounded-full bg-primary-500 px-6 py-3 text-center font-semibold text-white shadow-lg shadow-primary-500/30 transition-all hover:bg-primary-600 hover:shadow-xl'
			: accent === 'amber'
				? 'block w-full rounded-full bg-amber-500 px-6 py-3 text-center font-semibold text-white shadow-lg shadow-amber-500/30 transition-all hover:bg-amber-600 hover:shadow-xl'
				: 'block w-full rounded-full border-2 border-primary-500 bg-white px-6 py-3 text-center font-semibold text-primary-600 transition-colors hover:bg-primary-50';
</script>

<div class={cardCls}>
	{#if badge}
		{#if accent === 'primary'}
			<div class="absolute -top-4 left-1/2 -translate-x-1/2">
				<span class="rounded-full bg-primary-500 px-4 py-1 text-sm font-semibold text-white">
					{badge}
				</span>
			</div>
		{:else}
			<div class="mb-6">
				<div
					class="inline-flex items-center gap-2 rounded-full bg-amber-200 px-3 py-1 text-xs font-semibold text-amber-800"
				>
					{badge}
				</div>
			</div>
		{/if}
	{/if}
	<div class="mb-6 {accent === 'primary' ? 'mt-2' : ''}">
		<h2 class="text-2xl font-bold text-slate-900{accent === 'amber' ? ' mt-3' : ''}">{name}</h2>
		<p class="mt-2 text-slate-600">{blurb}</p>
	</div>
	<div class="mb-6">
		<span class="text-4xl font-bold text-slate-900">{price}</span>
		<span class="text-slate-600"> {per}</span>
	</div>
	{#if note}
		<div class="mb-6 rounded-lg bg-amber-100 p-3 text-sm text-amber-800">
			{note}
		</div>
	{/if}
	<ul class="mb-8 space-y-4">
		{#each features as feature}
			<li class="flex items-start gap-3">
				<svg
					class="h-5 w-5 flex-shrink-0 text-green-500"
					fill="none"
					viewBox="0 0 24 24"
					stroke="currentColor"
					stroke-width="2"
				>
					<path d="M5 13l4 4L19 7" />
				</svg>
				<span class="text-slate-700">{feature}</span>
			</li>
		{/each}
	</ul>
	<a href="/signup" class={ctaCls}>
		{ctaLabel}
	</a>
</div>
