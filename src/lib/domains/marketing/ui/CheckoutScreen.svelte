<!--
	`/checkout` — the selected plan, its quote and the eligible discounts, then
	the stub's disabled "Coming Soon" button. Every number is billing's quote;
	this page only prints it (the legacy template's branch for a signed-out
	visitor is gone because the load redirects with `?redirect=/checkout`).
-->
<script lang="ts">
	import type { PlanType } from '$lib/domains/billing/index';
	import { pageTitle } from '../marketing.seo.rules';

	/** The quote as the load returns it (billing's `CheckoutQuoteView`). */
	type Quote = {
		readonly originalPrice: number;
		readonly discountAmount: number;
		readonly finalPrice: number;
		readonly appliedDiscounts: readonly {
			readonly name: string;
			readonly percentage: number;
			readonly amount: number;
		}[];
	};

	interface Props {
		selectedPlan: { readonly type: PlanType; readonly name: string; readonly price: number };
		checkoutResult: Quote;
		userDiscounts: readonly { readonly percentage: number; readonly description: string }[];
	}

	let { selectedPlan, checkoutResult, userDiscounts }: Props = $props();
</script>

<svelte:head>
	<title>{pageTitle('/checkout')}</title>
</svelte:head>

<div class="min-h-screen bg-slate-50 pt-20">
	<div class="mx-auto max-w-7xl px-6 py-12">
		<div class="mb-8">
			<a href="/pricing" class="font-medium text-amber-600 hover:text-amber-700">
				&larr; Back to Pricing
			</a>
		</div>

		<div class="mx-auto max-w-2xl">
			<h1 class="mb-8 text-3xl font-bold text-slate-900">Complete Your Purchase</h1>

			<div class="rounded-2xl border border-slate-200 bg-white p-8 shadow-sm">
				<div class="mb-6 border-b border-slate-200 pb-6">
					<h2 class="text-xl font-semibold text-slate-900">Selected Plan</h2>
					<div class="mt-4 flex items-center justify-between">
						<div>
							<p class="text-lg font-medium text-slate-900">
								{selectedPlan.name}
								{#if selectedPlan.type === 'annual'}
									<span class="text-sm font-normal text-slate-600"> (Annual)</span>
								{:else if selectedPlan.type === 'lifetime'}
									<span class="text-sm font-normal text-slate-600"> (Lifetime)</span>
								{:else}
									<span class="text-sm font-normal text-slate-600"> (Monthly)</span>
								{/if}
							</p>
						</div>
						<p class="text-2xl font-bold text-slate-900">
							${checkoutResult.finalPrice}
							<span class="text-sm font-normal text-slate-600">
								{#if selectedPlan.type === 'annual'}
									/year
								{:else if selectedPlan.type === 'lifetime'}
									one-time
								{:else}
									/month
								{/if}
							</span>
						</p>
					</div>
				</div>

				{#if checkoutResult.appliedDiscounts.length > 0}
					<div class="mb-6 rounded-lg border border-green-200 bg-green-50 p-4">
						<h3 class="mb-2 font-semibold text-green-800">Applied Discounts</h3>
						<ul class="space-y-1">
							{#each checkoutResult.appliedDiscounts as discount}
								<li class="text-sm text-green-700">
									{discount.name}: {discount.percentage}% off (${discount.amount.toFixed(2)})
								</li>
							{/each}
						</ul>
						<p class="mt-2 text-sm font-medium text-green-800">
							Total savings: ${checkoutResult.discountAmount.toFixed(2)}
						</p>
					</div>
				{/if}

				{#if userDiscounts.length > 0}
					<div class="mb-6 rounded-lg border border-amber-200 bg-amber-50 p-4">
						<h3 class="mb-2 font-semibold text-amber-800">Your Eligible Discounts</h3>
						<ul class="space-y-1">
							{#each userDiscounts as discount}
								<li class="text-sm text-amber-700">
									{discount.description}: {discount.percentage}% off
								</li>
							{/each}
						</ul>
					</div>
				{/if}

				<form method="POST" action="?/purchase">
					<input type="hidden" name="planType" value={selectedPlan.type} />
					<input type="hidden" name="finalPrice" value={checkoutResult.finalPrice} />

					<button
						type="submit"
						class="w-full rounded-full bg-amber-500 px-6 py-4 text-center font-semibold text-white shadow-lg shadow-amber-500/30 transition-all hover:bg-amber-600 hover:shadow-xl disabled:cursor-not-allowed disabled:opacity-50"
						disabled
					>
						Coming Soon
					</button>
					<p class="mt-4 text-center text-sm text-slate-600">
						Checkout is not yet available.
					</p>
				</form>
			</div>

			<div class="mt-6 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
				<h3 class="mb-4 font-semibold text-slate-900">Price Breakdown</h3>
				<div class="space-y-2 text-sm">
					<div class="flex justify-between">
						<span class="text-slate-600">Base Price</span>
						<span class="text-slate-900">${checkoutResult.originalPrice}</span>
					</div>
					{#if checkoutResult.discountAmount > 0}
						<div class="flex justify-between text-green-600">
							<span>Discount</span>
							<span>-${checkoutResult.discountAmount.toFixed(2)}</span>
						</div>
					{/if}
					<div class="flex justify-between border-t border-slate-200 pt-2 font-semibold">
						<span class="text-slate-900">Total</span>
						<span class="text-slate-900">${checkoutResult.finalPrice}</span>
					</div>
				</div>
			</div>
		</div>
	</div>
</div>
