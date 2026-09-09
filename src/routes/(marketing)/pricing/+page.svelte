<script lang="ts">
	import PricingCard from '$lib/components/marketing/PricingCard.svelte';

	const tiers = [
		{
			name: 'Free',
			blurb: 'Perfect for small families getting started',
			price: '$0',
			per: '/month',
			features: [
				'1 family calendar',
				'Up to 5 family members',
				'Smart paste event import',
				'RSVP to family events',
				'10 smart algorithm event creations/month',
				'Print your family calendar'
			],
			ctaLabel: 'Start Free',
			accent: 'plain' as const
		},
		{
			name: 'Family',
			blurb: 'For families who want it all',
			price: '$9',
			per: '/month',
			features: [
				'Everything in Free',
				'Unlimited family members',
				'Unlimited calendars (kids, sports, work)',
				'Unlimited smart algorithm event creations',
				'Full event history & search',
				'Priority family support'
			],
			ctaLabel: 'Start Free Trial',
			badge: 'Most Popular',
			accent: 'primary' as const
		},
		{
			name: 'Lifetime',
			blurb: 'One payment, forever access',
			price: '$150',
			per: 'one-time',
			features: [
				'All Family features, forever',
				'Never pay monthly again',
				'Future features included',
				'Founding member badge'
			],
			ctaLabel: 'Get Lifetime Access',
			badge: 'Limited Offer',
			note: 'Less than $1/month over 10 years',
			accent: 'amber' as const
		}
	];

	const faqs = [
		{
			q: 'What counts as a "family member"?',
			a: "Anyone you invite to your family calendar—your spouse, kids, grandparents, babysitters, or caregivers. You control who's in."
		},
		{
			q: 'Can I try Family Planz before paying?',
			a: 'Absolutely! Our Free plan is free forever for small families. Upgrade anytime when you need more.'
		},
		{
			q: 'What happens if I cancel?',
			a: 'Your family keeps access until the end of your billing period. Your data is always yours to export.'
		},
		{
			q: "Is my family's data safe?",
			a: "Yes. We use encryption, secure sessions, and never share your family's data with third parties."
		}
	];
</script>

<svelte:head>
	<title>Pricing - Family Planz</title>
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
					{#each faqs as faq}
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
