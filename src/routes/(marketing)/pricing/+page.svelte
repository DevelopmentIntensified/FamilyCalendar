<svelte:head>
	<title>Pricing - Cal Master & Family Master</title>
</svelte:head>

<div class="min-h-screen bg-slate-50 pt-20">
	<div class="mx-auto max-w-7xl px-6 py-12">
		<div class="mb-16 text-center">
			<span class="mb-4 inline-block rounded-full bg-amber-100 px-4 py-1.5 text-sm font-medium text-amber-800">
				Now in Early Access
			</span>
			<h1 class="mb-4 text-4xl font-bold text-slate-900">Choose Your Plan</h1>
			<p class="mx-auto max-w-2xl text-lg text-slate-600">
				Whether you're managing your own schedule or coordinating for the whole family, we have a plan that fits.
			</p>
		</div>

		<!-- Plan Type Toggle Info -->
		<div class="mb-12 rounded-2xl bg-white p-6 shadow-sm border border-slate-200">
			<div class="grid gap-6 md:grid-cols-2">
				<div class="text-center p-4 rounded-xl bg-blue-50 border border-blue-100">
					<h3 class="text-lg font-semibold text-blue-900">Cal Master</h3>
					<p class="text-sm text-blue-700 mt-1">Individual calendar - track your personal schedule</p>
				</div>
				<div class="text-center p-4 rounded-xl bg-amber-50 border border-amber-100">
					<h3 class="text-lg font-semibold text-amber-900">Family Master</h3>
					<p class="text-sm text-amber-700 mt-1">Family calendar - coordinate with household members</p>
				</div>
			</div>
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
						<span class="text-slate-700">1 calendar</span>
					</li>
					<li class="flex items-start gap-3">
						<svg class="h-5 w-5 flex-shrink-0 text-green-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
							<path d="M5 13l4 4L19 7" />
						</svg>
						<span class="text-slate-700">1 month viewable retention</span>
					</li>
					<li class="flex items-start gap-3">
						<svg class="h-5 w-5 flex-shrink-0 text-green-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
							<path d="M5 13l4 4L19 7" />
						</svg>
						<span class="text-slate-700">3 months archived</span>
					</li>
					<li class="flex items-start gap-3">
						<svg class="h-5 w-5 flex-shrink-0 text-green-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
							<path d="M5 13l4 4L19 7" />
						</svg>
						<span class="text-slate-700">10MB attachments</span>
					</li>
					<li class="flex items-start gap-3">
						<svg class="h-5 w-5 flex-shrink-0 text-green-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
							<path d="M5 13l4 4L19 7" />
						</svg>
						<span class="text-slate-700">Export/Import (Google, Apple, Outlook)</span>
					</li>
					<li class="flex items-start gap-3">
						<svg class="h-5 w-5 flex-shrink-0 text-green-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
							<path d="M5 13l4 4L19 7" />
						</svg>
						<span class="text-slate-700">10 AI event creations/month</span>
					</li>
					<li class="flex items-start gap-3">
						<svg class="h-5 w-5 flex-shrink-0 text-green-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
							<path d="M5 13l4 4L19 7" />
						</svg>
						<span class="text-slate-700">Basic reminders</span>
					</li>
				</ul>
				<a href="/waitlist" class="block w-full rounded-full border-2 border-amber-500 bg-white px-6 py-3 text-center font-semibold text-amber-600 transition-colors hover:bg-amber-50">
					Join Waitlist
				</a>
			</div>

			<!-- Cal Master Monthly -->
			<div class="relative rounded-2xl border-2 border-blue-500 bg-white p-8 shadow-lg">
				<div class="absolute -top-4 left-1/2 -translate-x-1/2">
					<span class="rounded-full bg-blue-500 px-4 py-1 text-sm font-semibold text-white">
						Individual
					</span>
				</div>
				<div class="mb-6 mt-2">
					<h2 class="text-2xl font-bold text-slate-900">Cal Master</h2>
					<p class="mt-2 text-slate-600">Monthly</p>
				</div>
				<div class="mb-6">
					<span class="text-4xl font-bold text-slate-900">$5</span>
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
						<span class="text-slate-700">Unlimited calendars</span>
					</li>
					<li class="flex items-start gap-3">
						<svg class="h-5 w-5 flex-shrink-0 text-green-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
							<path d="M5 13l4 4L19 7" />
						</svg>
						<span class="text-slate-700">Unlimited retention</span>
					</li>
					<li class="flex items-start gap-3">
						<svg class="h-5 w-5 flex-shrink-0 text-green-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
							<path d="M5 13l4 4L19 7" />
						</svg>
						<span class="text-slate-700">1GB attachments</span>
					</li>
					<li class="flex items-start gap-3">
						<svg class="h-5 w-5 flex-shrink-0 text-green-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
							<path d="M5 13l4 4L19 7" />
						</svg>
						<span class="text-slate-700">Unlimited AI event creations</span>
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
				<a href="/waitlist" class="block w-full rounded-full bg-blue-500 px-6 py-3 text-center font-semibold text-white shadow-lg shadow-blue-500/30 transition-all hover:bg-blue-600 hover:shadow-xl">
					Join Waitlist
				</a>
			</div>

			<!-- Family Master Monthly -->
			<div class="relative rounded-2xl border-2 border-amber-500 bg-white p-8 shadow-lg">
				<div class="absolute -top-4 left-1/2 -translate-x-1/2">
					<span class="rounded-full bg-amber-500 px-4 py-1 text-sm font-semibold text-white">
						Family
					</span>
				</div>
				<div class="mb-6 mt-2">
					<h2 class="text-2xl font-bold text-slate-900">Family Master</h2>
					<p class="mt-2 text-slate-600">Monthly</p>
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
						<span class="text-slate-700">Everything in Cal Master</span>
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
						<span class="text-slate-700">Family sharing & permissions</span>
					</li>
					<li class="flex items-start gap-3">
						<svg class="h-5 w-5 flex-shrink-0 text-green-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
							<path d="M5 13l4 4L19 7" />
						</svg>
						<span class="text-slate-700">Family event coordination</span>
					</li>
				</ul>
				<a href="/waitlist" class="block w-full rounded-full bg-amber-500 px-6 py-3 text-center font-semibold text-white shadow-lg shadow-amber-500/30 transition-all hover:bg-amber-600 hover:shadow-xl">
					Join Waitlist
				</a>
			</div>
		</div>

		<!-- Annual Plans -->
		<div class="mt-12 grid gap-8 md:grid-cols-2">
			<!-- Cal Master Annual -->
			<div class="rounded-2xl border border-slate-200 bg-white p-8 shadow-sm">
				<div class="mb-6">
					<h2 class="text-2xl font-bold text-slate-900">Cal Master</h2>
					<p class="mt-2 text-slate-600">Annual - Save 20%</p>
				</div>
				<div class="mb-6">
					<span class="text-4xl font-bold text-slate-900">$48</span>
					<span class="text-slate-600">/year</span>
				</div>
				<div class="mb-4 rounded-lg bg-blue-50 p-3 text-sm text-blue-800">
					<strong>$4/month</strong> billed annually
				</div>
				<ul class="mb-8 space-y-4">
					<li class="flex items-start gap-3">
						<svg class="h-5 w-5 flex-shrink-0 text-green-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
							<path d="M5 13l4 4L19 7" />
						</svg>
						<span class="text-slate-700">Everything in Cal Master Monthly</span>
					</li>
				</ul>
				<a href="/waitlist" class="block w-full rounded-full border-2 border-blue-500 bg-white px-6 py-3 text-center font-semibold text-blue-600 transition-colors hover:bg-blue-50">
					Join Waitlist
				</a>
			</div>

			<!-- Family Master Annual -->
			<div class="rounded-2xl border border-slate-200 bg-white p-8 shadow-sm">
				<div class="mb-6">
					<h2 class="text-2xl font-bold text-slate-900">Family Master</h2>
					<p class="mt-2 text-slate-600">Annual - Save 17%</p>
				</div>
				<div class="mb-6">
					<span class="text-4xl font-bold text-slate-900">$90</span>
					<span class="text-slate-600">/year</span>
				</div>
				<div class="mb-4 rounded-lg bg-amber-50 p-3 text-sm text-amber-800">
					<strong>$7.50/month</strong> billed annually
				</div>
				<ul class="mb-8 space-y-4">
					<li class="flex items-start gap-3">
						<svg class="h-5 w-5 flex-shrink-0 text-green-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
							<path d="M5 13l4 4L19 7" />
						</svg>
						<span class="text-slate-700">Everything in Family Master Monthly</span>
					</li>
				</ul>
				<a href="/waitlist" class="block w-full rounded-full border-2 border-amber-500 bg-white px-6 py-3 text-center font-semibold text-amber-600 transition-colors hover:bg-amber-50">
					Join Waitlist
				</a>
			</div>
		</div>

		<!-- Lifetime Plan -->
		<div class="mt-12 rounded-2xl border-2 border-amber-500 bg-gradient-to-r from-amber-50 to-yellow-50 p-8 md:p-12">
			<div class="grid gap-8 md:grid-cols-2">
				<div>
					<h2 class="mb-4 text-2xl font-bold text-slate-900">Lifetime Access</h2>
					<p class="text-lg text-slate-600">One payment, forever access. Lock in your plan today.</p>
					<div class="mt-4">
						<span class="text-4xl font-bold text-slate-900">$150</span>
						<span class="text-slate-600"> one-time</span>
					</div>
					<p class="mt-2 text-sm text-amber-700">Choose Cal Master or Family Master</p>
				</div>
				<ul class="space-y-4">
					<li class="flex items-start gap-3">
						<svg class="h-5 w-5 flex-shrink-0 text-green-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
							<path d="M5 13l4 4L19 7" />
						</svg>
						<span class="text-slate-700">All premium features, forever</span>
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
						<span class="text-slate-700">Guaranteed future features</span>
					</li>
				</ul>
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
						<h3 class="mb-2 font-semibold text-white">What's the difference between Cal Master and Family Master?</h3>
						<p class="text-slate-400">Cal Master is for individuals managing personal calendars. Family Master includes all Cal Master features plus family coordination tools for multiple household members.</p>
					</div>
					<div>
						<h3 class="mb-2 font-semibold text-white">Why the waitlist?</h3>
						<p class="text-slate-400">We're launching gradually to ensure the best experience. Join the waitlist to get early access.</p>
					</div>
					<div>
						<h3 class="mb-2 font-semibold text-white">Can I cancel anytime?</h3>
						<p class="text-slate-400">Yes! Cancel anytime. You'll continue to have access until the end of your billing period.</p>
					</div>
				</div>
			</div>
		</div>

		<div class="mt-16 text-center">
			<p class="text-slate-600">Questions? <a href="/contact" class="text-amber-600 hover:text-amber-700 font-medium">Contact us</a> for custom pricing for organizations.</p>
		</div>
	</div>
</div>