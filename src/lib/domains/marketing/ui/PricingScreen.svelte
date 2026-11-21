<!--
	`/pricing` — the three cards and the FAQ block. The free card's member line
	is billing's limit (`memberLimit`, Q-018 answer B), the rest of the copy is
	the legacy page's; the paid figures are billing's `PLAN_PRICES` and a full
	quote is the checkout page's job.
-->
<script lang="ts">
	import { pageTitle } from '../marketing.seo.rules';
	import { PRICING_FAQS, pricingTiers } from '../marketing.pricing.rules';
	import PricingCard from './PricingCard.svelte';

	interface Props {
		/** The free plan's member limit, from billing's policy through the page load. */
		memberLimit: number;
	}

	let { memberLimit }: Props = $props();

	const tiers = $derived(pricingTiers(memberLimit));
</script>

<svelte:head>
	<title>{pageTitle('/pricing')}</title>
</svelte:head>

<div class="min-h-screen bg-slate-50 pt-20">
	<div class="mx-auto max-w-7xl px-6 py-12">
		<div class="mb-16 text-center">
			<span
				class="mb-4 inline-block rounded-full bg-primary-100 px-4 py-1.5 text-sm font-medium text-primary-700"
			>
				Built for Families
			</span>
			<h1 class="mb-4 text-4xl font-bold text-slate-900">Simple pricing for every family</h1>
			<p class="mx-auto max-w-2xl text-lg text-slate-600">
				Start free and upgrade when your family needs more. No surprises, no hidden fees.
			</p>
		</div>

		<div class="grid gap-8 md:grid-cols-3">
			{#each tiers as tier}
				<PricingCard {...tier} />
			{/each}
		</div>

		<!-- FAQ Section -->
		<div class="mt-16 rounded-2xl bg-white p-8 shadow-sm md:p-12">
			<div class="grid gap-8 md:grid-cols-2">
				<div>
					<h2 class="mb-4 text-2xl font-bold text-slate-900">Frequently Asked Questions</h2>
					<p class="text-slate-600">Have questions about Family Planz? We're here to help.</p>
				</div>
				<div class="space-y-6">
					{#each PRICING_FAQS as faq}
						<div>
							<h3 class="mb-2 font-semibold text-slate-900">{faq.q}</h3>
							<p class="text-slate-600">{faq.a}</p>
						</div>
					{/each}
				</div>
			</div>
		</div>

		<div class="mt-16 text-center">
			<p class="text-slate-600">
				Questions? <a href="/contact" class="font-medium text-primary-600 hover:text-primary-700"
					>Contact us</a
				> — we'd love to hear from your family.
			</p>
		</div>
	</div>
</div>
