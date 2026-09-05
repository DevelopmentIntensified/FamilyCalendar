<script lang="ts">
	import type { PageData } from './$types';
	export let data: PageData;
</script>

<svelte:head>
	<title>Checkout - Family Master</title>
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

			{#if !data.isLoggedIn}
				<div class="rounded-lg border border-amber-200 bg-amber-50 p-6">
					<p class="text-amber-800">
						Please <a href="/login" class="font-semibold underline">sign in</a> to complete your purchase.
					</p>
				</div>
			{:else}
				<div class="rounded-2xl border border-slate-200 bg-white p-8 shadow-sm">
					<div class="mb-6 border-b border-slate-200 pb-6">
						<h2 class="text-xl font-semibold text-slate-900">Selected Plan</h2>
						<div class="mt-4 flex items-center justify-between">
							<div>
								<p class="text-lg font-medium text-slate-900">
									{data.selectedPlan?.name ?? 'Family Master'}
									{#if data.selectedPlan?.type === 'annual'}
										<span class="text-sm font-normal text-slate-600"> (Annual)</span>
									{:else if data.selectedPlan?.type === 'lifetime'}
										<span class="text-sm font-normal text-slate-600"> (Lifetime)</span>
									{:else}
										<span class="text-sm font-normal text-slate-600"> (Monthly)</span>
									{/if}
								</p>
							</div>
							<p class="text-2xl font-bold text-slate-900">
								${data.checkoutResult?.finalPrice ?? 0}
								<span class="text-sm font-normal text-slate-600">
									{#if data.selectedPlan?.type === 'annual'}
										/year
									{:else if data.selectedPlan?.type === 'lifetime'}
										one-time
									{:else}
										/month
									{/if}
								</span>
							</p>
						</div>
					</div>

					{#if data.checkoutResult?.appliedDiscounts && data.checkoutResult.appliedDiscounts.length > 0}
						<div class="mb-6 rounded-lg border border-green-200 bg-green-50 p-4">
							<h3 class="mb-2 font-semibold text-green-800">Applied Discounts</h3>
							<ul class="space-y-1">
								{#each data.checkoutResult.appliedDiscounts as discount}
									<li class="text-sm text-green-700">
										{discount.name}: {discount.percentage}% off (${discount.amount.toFixed(2)})
									</li>
								{/each}
							</ul>
							<p class="mt-2 text-sm font-medium text-green-800">
								Total savings: ${data.checkoutResult.discountAmount.toFixed(2)}
							</p>
						</div>
					{/if}

					{#if data.userDiscounts && data.userDiscounts.length > 0}
						<div class="mb-6 rounded-lg border border-amber-200 bg-amber-50 p-4">
							<h3 class="mb-2 font-semibold text-amber-800">Your Eligible Discounts</h3>
							<ul class="space-y-1">
								{#each data.userDiscounts as discount}
									<li class="text-sm text-amber-700">
										{discount.description}: {discount.percentage}% off
									</li>
								{/each}
							</ul>
						</div>
					{/if}

					<form method="POST" action="?/purchase">
						<input type="hidden" name="planType" value={data.selectedPlan?.type ?? 'monthly'} />
						<input type="hidden" name="finalPrice" value={data.checkoutResult?.finalPrice ?? 0} />

						<button
							type="submit"
							class="w-full rounded-full bg-amber-500 px-6 py-4 text-center font-semibold text-white shadow-lg shadow-amber-500/30 transition-all hover:bg-amber-600 hover:shadow-xl disabled:cursor-not-allowed disabled:opacity-50"
							disabled
						>
							Coming Soon
						</button>
						<p class="mt-4 text-center text-sm text-slate-600">
							Checkout is not yet available. Join the waitlist to get early access.
						</p>
					</form>
				</div>

				<div class="mt-6 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
					<h3 class="mb-4 font-semibold text-slate-900">Price Breakdown</h3>
					<div class="space-y-2 text-sm">
						<div class="flex justify-between">
							<span class="text-slate-600">Base Price</span>
							<span class="text-slate-900">${data.checkoutResult?.originalPrice ?? 0}</span>
						</div>
						{#if data.checkoutResult && data.checkoutResult.discountAmount > 0}
							<div class="flex justify-between text-green-600">
								<span>Discount</span>
								<span>-${data.checkoutResult.discountAmount.toFixed(2)}</span>
							</div>
						{/if}
						<div class="flex justify-between border-t border-slate-200 pt-2 font-semibold">
							<span class="text-slate-900">Total</span>
							<span class="text-slate-900">${data.checkoutResult?.finalPrice ?? 0}</span>
						</div>
					</div>
				</div>
			{/if}
		</div>
	</div>
</div>
