<script lang="ts">
	import { goto } from '$app/navigation';
</script>

<svelte:head>
	<title>Family Planz - Keep Your Family Organized</title>
</svelte:head>

<div class="min-h-screen bg-slate-50">
	<!-- Navigation -->
	<nav class="fixed top-0 z-50 w-full border-b border-slate-200 bg-white/95 backdrop-blur-sm">
		<div class="mx-auto flex max-w-7xl items-center justify-between px-6 py-4">
			<div class="flex items-center gap-2">
				<svg class="h-8 w-8 text-primary-600" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
					<rect x="3" y="4" width="18" height="18" rx="2" />
					<line x1="16" y1="2" x2="16" y2="6" />
					<line x1="8" y1="2" x2="8" y2="6" />
					<line x1="3" y1="10" x2="21" y2="10" />
				</svg>
				<span class="text-xl font-bold text-slate-800">Family Planz</span>
			</div>
			<div class="flex items-center gap-4">
				<a href="/login" class="text-sm font-medium text-slate-600 hover:text-slate-900">Sign In</a>
				<a href="/signup" class="rounded-full bg-primary-600 px-5 py-2 text-sm font-semibold text-white transition-colors hover:bg-primary-700">Get Started</a>
			</div>
		</div>
	</nav>

	<!-- Hero Section -->
	<section class="relative overflow-hidden pt-32 pb-20 md:pt-40 md:pb-32">
		<div class="absolute inset-0 bg-gradient-to-br from-orange-50 via-white to-amber-50"></div>
		<div class="absolute -right-20 -top-20 h-96 w-96 rounded-full bg-primary-100/50 blur-3xl"></div>
		<div class="absolute -bottom-20 -left-20 h-72 w-72 rounded-full bg-amber-100/50 blur-3xl"></div>
		
		<div class="relative mx-auto max-w-7xl px-6">
			<div class="mx-auto max-w-3xl text-center">
				<h1 class="mb-6 text-4xl font-bold leading-tight text-slate-900 md:text-6xl">
					The easiest way to bring all your events together.
				</h1>
				<p class="mx-auto mb-10 max-w-2xl text-lg text-slate-600 md:text-xl">
					Copy a text. Paste it in. Done. Family Planz reads the event details and adds them to your calendar automatically—no manual entry needed.
				</p>
				<div class="flex flex-col items-center justify-center gap-4 sm:flex-row">
					<a href="/signup" class="w-full rounded-full bg-primary-600 px-8 py-4 text-center text-lg font-semibold text-white shadow-lg shadow-primary-600/30 transition-all hover:bg-primary-700 hover:shadow-xl sm:w-auto">
						Start Free Today
					</a>
					<a href="#features" class="w-full rounded-full border-2 border-slate-300 px-8 py-4 text-center text-lg font-semibold text-slate-700 transition-colors hover:border-slate-400 hover:bg-slate-50 sm:w-auto">
						See How It Works
					</a>
				</div>
			</div>
		</div>
	</section>

	<!-- AI Feature Highlight -->
	<section class="bg-white py-16">
		<div class="mx-auto max-w-6xl px-6">
			<div class="grid gap-12 lg:grid-cols-2 lg:items-center">
				<div>
					<div class="inline-flex items-center gap-2 rounded-full bg-primary-100 px-4 py-1.5 text-sm font-medium text-primary-700">
						<svg class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
							<path d="M13 10V3L4 14h7v7l9-11h-7z" />
						</svg>
						Smart Event Import
					</div>
					<h2 class="mt-4 text-3xl font-bold text-slate-900 md:text-4xl">
						Text to Calendar in seconds
					</h2>
					<p class="mt-4 text-lg text-slate-600">
						Got an event in a text, email, or anywhere else? Just paste it. Our AI reads the details—date, time, location—and creates the event for you.
					</p>
					<ul class="mt-6 space-y-3">
						<li class="flex items-center gap-3 text-slate-700">
							<svg class="h-5 w-5 text-primary-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
								<path d="M5 13l4 4L19 7" />
							</svg>
							<span>Works with any text—emails, texts, messages</span>
						</li>
						<li class="flex items-center gap-3 text-slate-700">
							<svg class="h-5 w-5 text-primary-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
								<path d="M5 13l4 4L19 7" />
							</svg>
							<span>Extracts date, time, and location automatically</span>
						</li>
						<li class="flex items-center gap-3 text-slate-700">
							<svg class="h-5 w-5 text-primary-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
								<path d="M5 13l4 4L19 7" />
							</svg>
							<span>One tap to confirm and add to your calendar</span>
						</li>
					</ul>
				</div>
				<div class="relative">
					<div class="rounded-2xl bg-slate-900 p-6 font-mono text-sm shadow-2xl">
						<div class="mb-4 flex items-center gap-2">
							<div class="h-3 w-3 rounded-full bg-red-500"></div>
							<div class="h-3 w-3 rounded-full bg-yellow-500"></div>
							<div class="h-3 w-3 rounded-full bg-green-500"></div>
						</div>
						<div class="rounded-lg bg-slate-800 p-4">
							<p class="mb-2 text-xs text-slate-400">// Paste this text anywhere in Family Planz:</p>
							<p class="text-green-400">"Dinner with the Smiths at</p>
							<p class="text-green-400">Olive Garden, next Friday at 7pm"</p>
						</div>
						<div class="mt-4 flex items-center justify-center text-slate-500">
							<svg class="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
								<path d="M19 14l-7 7m0 0l-7-7m7 7V3" />
							</svg>
						</div>
						<div class="mt-4 rounded-lg bg-primary-900/50 p-4">
							<div class="flex items-center gap-2 text-primary-400">
								<svg class="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
									<rect x="3" y="4" width="18" height="18" rx="2" />
									<line x1="16" y1="2" x2="16" y2="6" />
									<line x1="8" y1="2" x2="8" y2="6" />
									<line x1="3" y1="10" x2="21" y2="10" />
								</svg>
								<span class="font-semibold">Event Created!</span>
							</div>
							<p class="mt-2 text-sm text-slate-300">Friday, 7:00 PM — Olive Garden</p>
						</div>
					</div>
				</div>
			</div>
		</div>
	</section>

	<!-- Problem/Solution Section -->
	<section class="bg-slate-50 py-20">
		<div class="mx-auto max-w-7xl px-6">
			<div class="mb-12 text-center">
				<h2 class="mb-4 text-3xl font-bold text-slate-900 md:text-4xl">More than just a calendar</h2>
				<p class="mx-auto max-w-2xl text-lg text-slate-600">
					Family coordination made simple, without the chaos.
				</p>
			</div>
			
			<div class="grid gap-12 md:grid-cols-2">
				<div class="rounded-2xl bg-white p-8 shadow-sm">
					<div class="mb-4 inline-flex h-12 w-12 items-center justify-center rounded-xl bg-red-100">
						<svg class="h-6 w-6 text-red-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
							<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
						</svg>
					</div>
					<h3 class="mb-3 text-xl font-bold text-slate-900">Sound familiar?</h3>
					<ul class="space-y-3 text-slate-600">
						<li class="flex items-start gap-3">
							<span class="text-red-500">✕</span>
							<span>Three different calendars, none of them matching</span>
						</li>
						<li class="flex items-start gap-3">
							<span class="text-red-500">✕</span>
							<span>Events scattered across emails, texts, and notes</span>
						</li>
						<li class="flex items-start gap-3">
							<span class="text-red-500">✕</span>
							<span>Missing appointments because you forgot to add them</span>
						</li>
						<li class="flex items-start gap-3">
							<span class="text-red-500">✕</span>
							<span>Family members not knowing each other's schedules</span>
						</li>
					</ul>
				</div>
				<div class="rounded-2xl bg-primary-50 p-8">
					<div class="mb-4 inline-flex h-12 w-12 items-center justify-center rounded-xl bg-primary-100">
						<svg class="h-6 w-6 text-primary-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
							<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7" />
						</svg>
					</div>
					<h3 class="mb-3 text-xl font-bold text-slate-900">Family Planz fixes that</h3>
					<ul class="space-y-3 text-slate-700">
						<li class="flex items-start gap-3">
							<span class="text-primary-600">✓</span>
							<span>One shared calendar for the whole family</span>
						</li>
						<li class="flex items-start gap-3">
							<span class="text-primary-600">✓</span>
							<span>Smart import—copy text, add events instantly</span>
						</li>
						<li class="flex items-start gap-3">
							<span class="text-primary-600">✓</span>
							<span>Color-coded by family member</span>
						</li>
						<li class="flex items-start gap-3">
							<span class="text-primary-600">✓</span>
							<span>Real-time sync across all devices</span>
						</li>
					</ul>
				</div>
			</div>
		</div>
	</section>

	<!-- Features Section -->
	<section id="features" class="bg-white py-20">
		<div class="mx-auto max-w-7xl px-6">
			<div class="mb-16 text-center">
				<h2 class="mb-4 text-3xl font-bold text-slate-900 md:text-4xl">Everything your family needs</h2>
				<p class="mx-auto max-w-2xl text-lg text-slate-600">
					Simple, powerful features designed for real family life.
				</p>
			</div>
			
			<div class="grid gap-8 md:grid-cols-3">
				<div class="rounded-2xl border border-slate-200 bg-white p-8 transition-shadow hover:shadow-lg">
					<div class="mb-6 flex h-14 w-14 items-center justify-center rounded-xl bg-primary-100">
						<svg class="h-7 w-7 text-primary-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
							<rect x="3" y="4" width="18" height="18" rx="2" />
							<line x1="16" y1="2" x2="16" y2="6" />
							<line x1="8" y1="2" x2="8" y2="6" />
							<line x1="3" y1="10" x2="21" y2="10" />
						</svg>
					</div>
					<h3 class="mb-3 text-xl font-bold text-slate-900">Shared Family Calendar</h3>
					<p class="text-slate-600">
						Everyone's events in one place. See at a glance who's doing what and when—no more double-booking.
					</p>
				</div>

				<div class="rounded-2xl border border-slate-200 bg-white p-8 transition-shadow hover:shadow-lg">
					<div class="mb-6 flex h-14 w-14 items-center justify-center rounded-xl bg-primary-100">
						<svg class="h-7 w-7 text-primary-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
							<path d="M13 10V3L4 14h7v7l9-11h-7z" />
						</svg>
					</div>
					<h3 class="mb-3 text-xl font-bold text-slate-900">Smart Event Import</h3>
					<p class="text-slate-600">
						Copy text from anywhere. Our AI reads the details and creates the event automatically.
					</p>
				</div>

				<div class="rounded-2xl border border-slate-200 bg-white p-8 transition-shadow hover:shadow-lg">
					<div class="mb-6 flex h-14 w-14 items-center justify-center rounded-xl bg-primary-100">
						<svg class="h-7 w-7 text-primary-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
							<path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
							<circle cx="9" cy="7" r="4" />
							<path d="M23 21v-2a4 4 0 0 0-3-3.87" />
							<path d="M16 3.13a4 4 0 0 1 0 7.75" />
						</svg>
					</div>
					<h3 class="mb-3 text-xl font-bold text-slate-900">Family Groups</h3>
					<p class="text-slate-600">
						Organize by family, sports teams, or school events. Everyone stays in the loop.
					</p>
				</div>
			</div>
		</div>
	</section>

	<!-- Quote Section -->
	<section class="bg-slate-900 py-20">
		<div class="mx-auto max-w-4xl px-6 text-center">
			<svg class="mx-auto mb-6 h-12 w-12 text-primary-500" fill="currentColor" viewBox="0 0 24 24">
				<path d="M14.017 21v-7.391c0-5.704 3.731-9.57 8.983-10.609l.995 2.151c-2.432.917-3.995 3.638-3.995 5.849h4v10h-9.983zm-14.017 0v-7.391c0-5.704 3.748-9.57 9-10.609l.996 2.151c-2.433.917-3.996 3.638-3.996 5.849h3.983v10h-9.983z" />
			</svg>
			<blockquote class="mb-8 text-2xl font-medium italic text-white md:text-3xl">
				"A family that planz together, stays together."
			</blockquote>
			<p class="text-lg text-slate-400">~ Unknown</p>
		</div>
	</section>

	<!-- CTA Section -->
	<section class="bg-gradient-to-br from-primary-600 to-primary-700 py-20">
		<div class="mx-auto max-w-4xl px-6 text-center">
			<h2 class="mb-4 text-3xl font-bold text-white md:text-4xl">Ready to simplify your family's schedule?</h2>
			<p class="mx-auto mb-10 max-w-2xl text-xl text-primary-100">
				Start adding events the easy way today.
			</p>
			<a href="/signup" class="inline-block rounded-full bg-white px-10 py-4 text-lg font-bold text-primary-700 shadow-lg transition-transform hover:scale-105">
				Get Started for Free
			</a>
			<p class="mt-4 text-sm text-primary-200">No credit card required.</p>
		</div>
	</section>

	<!-- Footer -->
	<footer class="border-t border-slate-200 bg-white py-12">
		<div class="mx-auto max-w-7xl px-6">
			<div class="flex flex-col items-center justify-between gap-6 md:flex-row">
				<div class="flex items-center gap-2">
					<svg class="h-6 w-6 text-primary-600" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
						<rect x="3" y="4" width="18" height="18" rx="2" />
						<line x1="16" y1="2" x2="16" y2="6" />
						<line x1="8" y1="2" x2="8" y2="6" />
						<line x1="3" y1="10" x2="21" y2="10" />
					</svg>
					<span class="font-bold text-slate-800">Family Planz</span>
				</div>
				<p class="text-sm text-slate-500">
					© {new Date().getFullYear()} Family Planz. Keeping families organized.
				</p>
			</div>
		</div>
	</footer>
</div>
