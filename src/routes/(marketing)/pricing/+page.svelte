<svelte:head>
	<title>Pricing - Family Planz</title>
</svelte:head>

<div class="min-h-screen bg-slate-50 pt-20">
	<div class="mx-auto max-w-7xl px-6 py-12">
		<div class="mb-16 text-center">
			<span class="mb-4 inline-block rounded-full bg-primary-100 px-4 py-1.5 text-sm font-medium text-primary-700">
				Built for Families
			</span>
			<h1 class="mb-4 text-4xl font-bold text-slate-900">Simple pricing for every family</h1>
			<p class="mx-auto max-w-2xl text-lg text-slate-600">
				Start free and upgrade when your family needs more. No surprises, no hidden fees.
			</p>
		</div>

		<div class="grid gap-8 md:grid-cols-3">
			<!-- Free Plan -->
			<div class="rounded-2xl border border-slate-200 bg-white p-8 shadow-sm transition-shadow hover:shadow-lg">
				<div class="mb-6">
					<h2 class="text-2xl font-bold text-slate-900">Free</h2>
					<p class="mt-2 text-slate-600">Perfect for small families getting started</p>
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
						<span class="text-slate-700">1 family calendar</span>
					</li>
					<li class="flex items-start gap-3">
						<svg class="h-5 w-5 flex-shrink-0 text-green-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
							<path d="M5 13l4 4L19 7" />
						</svg>
						<span class="text-slate-700">Up to 5 family members</span>
					</li>
					<li class="flex items-start gap-3">
						<svg class="h-5 w-5 flex-shrink-0 text-green-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
							<path d="M5 13l4 4L19 7" />
						</svg>
						<span class="text-slate-700">Smart paste event import</span>
					</li>
					<li class="flex items-start gap-3">
						<svg class="h-5 w-5 flex-shrink-0 text-green-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
							<path d="M5 13l4 4L19 7" />
						</svg>
						<span class="text-slate-700">RSVP to family events</span>
					</li>
					<li class="flex items-start gap-3">
						<svg class="h-5 w-5 flex-shrink-0 text-green-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
							<path d="M5 13l4 4L19 7" />
						</svg>
						<span class="text-slate-700">10 smart algorithm event creations/month</span>
					</li>
					<li class="flex items-start gap-3">
						<svg class="h-5 w-5 flex-shrink-0 text-green-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
							<path d="M5 13l4 4L19 7" />
						</svg>
						<span class="text-slate-700">Print your family calendar</span>
					</li>
				</ul>
				<a href="/signup" class="block w-full rounded-full border-2 border-primary-500 bg-white px-6 py-3 text-center font-semibold text-primary-600 transition-colors hover:bg-primary-50">
					Start Free
				</a>
			</div>

			<!-- Family Monthly -->
			<div class="relative rounded-2xl border-2 border-primary-500 bg-white p-8 shadow-lg">
				<div class="absolute -top-4 left-1/2 -translate-x-1/2">
					<span class="rounded-full bg-primary-500 px-4 py-1 text-sm font-semibold text-white">
						Most Popular
					</span>
				</div>
				<div class="mb-6 mt-2">
					<h2 class="text-2xl font-bold text-slate-900">Family</h2>
					<p class="mt-2 text-slate-600">For families who want it all</p>
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
						<span class="text-slate-700">Unlimited family members</span>
					</li>
					<li class="flex items-start gap-3">
						<svg class="h-5 w-5 flex-shrink-0 text-green-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
							<path d="M5 13l4 4L19 7" />
						</svg>
						<span class="text-slate-700">Unlimited calendars (kids, sports, work)</span>
					</li>
					<li class="flex items-start gap-3">
						<svg class="h-5 w-5 flex-shrink-0 text-green-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
							<path d="M5 13l4 4L19 7" />
						</svg>
						<span class="text-slate-700">Unlimited smart algorithm event creations</span>
					</li>
					<li class="flex items-start gap-3">
						<svg class="h-5 w-5 flex-shrink-0 text-green-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
							<path d="M5 13l4 4L19 7" />
						</svg>
						<span class="text-slate-700">Full event history & search</span>
					</li>
					<li class="flex items-start gap-3">
						<svg class="h-5 w-5 flex-shrink-0 text-green-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
							<path d="M5 13l4 4L19 7" />
						</svg>
						<span class="text-slate-700">Priority family support</span>
					</li>
				</ul>
				<a href="/signup" class="block w-full rounded-full bg-primary-500 px-6 py-3 text-center font-semibold text-white shadow-lg shadow-primary-500/30 transition-all hover:bg-primary-600 hover:shadow-xl">
					Start Free Trial
				</a>
			</div>

			<!-- Lifetime Plan -->
			<div class="rounded-2xl border-2 border-amber-500 bg-gradient-to-br from-amber-50 to-yellow-50 p-8">
				<div class="mb-6">
					<div class="inline-flex items-center gap-2 rounded-full bg-amber-200 px-3 py-1 text-xs font-semibold text-amber-800">
						Limited Offer
					</div>
					<h2 class="mt-3 text-2xl font-bold text-slate-900">Lifetime</h2>
					<p class="mt-2 text-slate-600">One payment, forever access</p>
				</div>
				<div class="mb-6">
					<span class="text-4xl font-bold text-slate-900">$150</span>
					<span class="text-slate-600"> one-time</span>
				</div>
				<div class="mb-6 rounded-lg bg-amber-100 p-3 text-sm text-amber-800">
					<strong>Less than $1/month</strong> over 10 years
				</div>
				<ul class="mb-8 space-y-4">
					<li class="flex items-start gap-3">
						<svg class="h-5 w-5 flex-shrink-0 text-green-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
							<path d="M5 13l4 4L19 7" />
						</svg>
						<span class="text-slate-700">All Family features, forever</span>
					</li>
					<li class="flex items-start gap-3">
						<svg class="h-5 w-5 flex-shrink-0 text-green-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
							<path d="M5 13l4 4L19 7" />
						</svg>
						<span class="text-slate-700">Never pay monthly again</span>
					</li>
					<li class="flex items-start gap-3">
						<svg class="h-5 w-5 flex-shrink-0 text-green-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
							<path d="M5 13l4 4L19 7" />
						</svg>
						<span class="text-slate-700">Future features included</span>
					</li>
					<li class="flex items-start gap-3">
						<svg class="h-5 w-5 flex-shrink-0 text-green-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
							<path d="M5 13l4 4L19 7" />
						</svg>
						<span class="text-slate-700">Founding member badge</span>
					</li>
				</ul>
				<a href="/signup" class="block w-full rounded-full bg-amber-500 px-6 py-3 text-center font-semibold text-white shadow-lg shadow-amber-500/30 transition-all hover:bg-amber-600 hover:shadow-xl">
					Get Lifetime Access
				</a>
			</div>
		</div>

		<!-- FAQ Section -->
		<div class="mt-16 rounded-2xl bg-white p-8 md:p-12 shadow-sm">
			<div class="grid gap-8 md:grid-cols-2">
				<div>
					<h2 class="mb-4 text-2xl font-bold text-slate-900">Frequently Asked Questions</h2>
					<p class="text-slate-600">Have questions about Family Planz? We're here to help.</p>
				</div>
				<div class="space-y-6">
					<div>
						<h3 class="mb-2 font-semibold text-slate-900">What counts as a "family member"?</h3>
						<p class="text-slate-600">Anyone you invite to your family calendar—your spouse, kids, grandparents, babysitters, or caregivers. You control who's in.</p>
					</div>
					<div>
						<h3 class="mb-2 font-semibold text-slate-900">Can I try Family Planz before paying?</h3>
						<p class="text-slate-600">Absolutely! Our Free plan is free forever for small families. Upgrade anytime when you need more.</p>
					</div>
					<div>
						<h3 class="mb-2 font-semibold text-slate-900">What happens if I cancel?</h3>
						<p class="text-slate-600">Your family keeps access until the end of your billing period. Your data is always yours to export.</p>
					</div>
					<div>
						<h3 class="mb-2 font-semibold text-slate-900">Is my family's data safe?</h3>
						<p class="text-slate-600">Yes. We use encryption, secure sessions, and never share your family's data with third parties.</p>
					</div>
				</div>
			</div>
		</div>

		<div class="mt-16 text-center">
			<p class="text-slate-600">Questions? <a href="/contact" class="text-primary-600 hover:text-primary-700 font-medium">Contact us</a> — we'd love to hear from your family.</p>
		</div>
	</div>
</div>
