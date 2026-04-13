<svelte:head>
	<title>Family Planz: Pricing</title>
</svelte:head>

<div class="min-h-screen bg-slate-50 pt-20">
	<div class="mx-auto max-w-7xl px-6 py-12">
		<div class="mb-16 text-center">
			<h1 class="mb-4 text-4xl font-bold text-slate-900">Simple, transparent pricing</h1>
			<p class="mx-auto max-w-2xl text-lg text-slate-600">
				Start for free. Upgrade when you need more features. No hidden fees, cancel anytime.
			</p>
		</div>

		<div class="grid gap-8 md:grid-cols-3">
			<!-- Free Plan -->
			<div class="rounded-2xl border border-slate-200 bg-white p-8 shadow-sm transition-shadow hover:shadow-lg">
				<div class="mb-6">
					<h2 class="text-2xl font-bold text-slate-900">Free</h2>
					<p class="mt-2 text-slate-600">Perfect for getting started</p>
				</div>
				<div class="mb-6">
					<span class="text-4xl font-bold text-slate-900">$0</span>
					<span class="text-slate-600">/month</span>
				</div>
				<ul class="mb-8 space-y-4">
					<li class="flex items-start gap-3">
						<svg class="h-5 w-5 flex-shrink-0 text-green-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
							<path d="M5 13l4 4L19 7" />
						</svg>
						<span class="text-slate-700">Up to 2 families</span>
					</li>
					<li class="flex items-start gap-3">
						<svg class="h-5 w-5 flex-shrink-0 text-green-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
							<path d="M5 13l4 4L19 7" />
						</svg>
						<span class="text-slate-700">Unlimited events</span>
					</li>
					<li class="flex items-start gap-3">
						<svg class="h-5 w-5 flex-shrink-0 text-green-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
							<path d="M5 13l4 4L19 7" />
						</svg>
						<span class="text-slate-700">Smart event import</span>
					</li>
					<li class="flex items-start gap-3">
						<svg class="h-5 w-5 flex-shrink-0 text-green-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
							<path d="M5 13l4 4L19 7" />
						</svg>
						<span class="text-slate-700">Color-coded events</span>
					</li>
					<li class="flex items-start gap-3">
						<svg class="h-5 w-5 flex-shrink-0 text-green-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
							<path d="M5 13l4 4L19 7" />
						</svg>
						<span class="text-slate-700">Basic reminders</span>
					</li>
				</ul>
				<a href="/signup" class="block w-full rounded-full border-2 border-primary-600 bg-white px-6 py-3 text-center font-semibold text-primary-600 transition-colors hover:bg-primary-50">
					Get Started
				</a>
			</div>

			<!-- Pro Plan -->
			<div class="relative rounded-2xl border-2 border-primary-500 bg-white p-8 shadow-lg">
				<div class="absolute -top-4 left-1/2 -translate-x-1/2">
					<span class="rounded-full bg-primary-600 px-4 py-1 text-sm font-semibold text-white">
						Most Popular
					</span>
				</div>
				<div class="mb-6">
					<h2 class="text-2xl font-bold text-slate-900">Pro</h2>
					<p class="mt-2 text-slate-600">For families who want more</p>
				</div>
				<div class="mb-6">
					<span class="text-4xl font-bold text-slate-900">$9</span>
					<span class="text-slate-600">/month</span>
				</div>
				<ul class="mb-8 space-y-4">
					<li class="flex items-start gap-3">
						<svg class="h-5 w-5 flex-shrink-0 text-green-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
							<path d="M5 13l4 4L19 7" />
						</svg>
						<span class="text-slate-700">Everything in Free</span>
					</li>
					<li class="flex items-start gap-3">
						<svg class="h-5 w-5 flex-shrink-0 text-green-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
							<path d="M5 13l4 4L19 7" />
						</svg>
						<span class="text-slate-700">Unlimited families</span>
					</li>
					<li class="flex items-start gap-3">
						<svg class="h-5 w-5 flex-shrink-0 text-green-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
							<path d="M5 13l4 4L19 7" />
						</svg>
						<span class="text-slate-700">Calendar export (Google, Apple, Outlook)</span>
					</li>
					<li class="flex items-start gap-3">
						<svg class="h-5 w-5 flex-shrink-0 text-green-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
							<path d="M5 13l4 4L19 7" />
						</svg>
						<span class="text-slate-700">Advanced reminders</span>
					</li>
					<li class="flex items-start gap-3">
						<svg class="h-5 w-5 flex-shrink-0 text-green-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
							<path d="M5 13l4 4L19 7" />
						</svg>
						<span class="text-slate-700">Priority support</span>
					</li>
				</ul>
				<a href="/signup" class="block w-full rounded-full bg-primary-600 px-6 py-3 text-center font-semibold text-white shadow-lg shadow-primary-600/30 transition-all hover:bg-primary-700 hover:shadow-xl">
					Start Free Trial
				</a>
			</div>

			<!-- Family Plan -->
			<div class="rounded-2xl border border-slate-200 bg-white p-8 shadow-sm transition-shadow hover:shadow-lg">
				<div class="mb-6">
					<h2 class="text-2xl font-bold text-slate-900">Family</h2>
					<p class="mt-2 text-slate-600">For larger households</p>
				</div>
				<div class="mb-6">
					<span class="text-4xl font-bold text-slate-900">$19</span>
					<span class="text-slate-600">/month</span>
				</div>
				<ul class="mb-8 space-y-4">
					<li class="flex items-start gap-3">
						<svg class="h-5 w-5 flex-shrink-0 text-green-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
							<path d="M5 13l4 4L19 7" />
						</svg>
						<span class="text-slate-700">Everything in Pro</span>
					</li>
					<li class="flex items-start gap-3">
						<svg class="h-5 w-5 flex-shrink-0 text-green-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
							<path d="M5 13l4 4L19 7" />
						</svg>
						<span class="text-slate-700">Up to 10 family members</span>
					</li>
					<li class="flex items-start gap-3">
						<svg class="h-5 w-5 flex-shrink-0 text-green-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
							<path d="M5 13l4 4L19 7" />
						</svg>
						<span class="text-slate-700">SMS notifications</span>
					</li>
					<li class="flex items-start gap-3">
						<svg class="h-5 w-5 flex-shrink-0 text-green-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
							<path d="M5 13l4 4L19 7" />
						</svg>
						<span class="text-slate-700">Recurring events</span>
					</li>
					<li class="flex items-start gap-3">
						<svg class="h-5 w-5 flex-shrink-0 text-green-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
							<path d="M5 13l4 4L19 7" />
						</svg>
						<span class="text-slate-700">Dedicated support</span>
					</li>
				</ul>
				<a href="/signup" class="block w-full rounded-full border-2 border-primary-600 bg-white px-6 py-3 text-center font-semibold text-primary-600 transition-colors hover:bg-primary-50">
					Coming Soon
				</a>
			</div>
		</div>

		<div class="mt-16 rounded-2xl bg-slate-900 p-8 md:p-12">
			<div class="grid gap-8 md:grid-cols-2">
				<div>
					<h2 class="mb-4 text-2xl font-bold text-white">Frequently Asked Questions</h2>
					<p class="text-slate-400">Have questions about pricing? We're here to help.</p>
				</div>
				<div class="space-y-6">
					<div>
						<h3 class="mb-2 font-semibold text-white">Can I cancel anytime?</h3>
						<p class="text-slate-400">Yes! You can cancel your subscription at any time. You'll continue to have access until the end of your billing period.</p>
					</div>
					<div>
						<h3 class="mb-2 font-semibold text-white">Do you offer refunds?</h3>
						<p class="text-slate-400">We offer a 30-day money-back guarantee. If you're not satisfied, contact us for a full refund.</p>
					</div>
					<div>
						<h3 class="mb-2 font-semibold text-white">How does billing work?</h3>
						<p class="text-slate-400">We bill monthly or annually. Payments are processed securely through Stripe.</p>
					</div>
				</div>
			</div>
		</div>

		<div class="mt-16 text-center">
			<p class="text-slate-600">Questions? <a href="/contact" class="text-primary-600 hover:text-primary-700 font-medium">Contact us</a> for custom pricing for organizations.</p>
		</div>
	</div>
</div>
