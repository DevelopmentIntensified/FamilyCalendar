<script lang="ts">
	import { goto } from '$app/navigation';
</script>

<svelte:head>
	<title>Family Planz - The Family Calendar That Brings Everyone Together</title>
</svelte:head>

<div class="min-h-screen bg-[#F8F6F3]">
	<!-- Hero Section -->
	<section class="relative overflow-hidden pt-16 pb-16 md:pt-24 md:pb-28">
		<div class="absolute inset-0 bg-gradient-to-br from-[#BEDAE3]/30 via-white to-[#FED5CF]/30"></div>
		<div class="absolute -right-32 -top-32 h-[500px] w-[500px] rounded-full bg-[#BEDAE3]/20 blur-3xl"></div>
		<div class="absolute -bottom-32 -left-32 h-[400px] w-[400px] rounded-full bg-[#FED5CF]/20 blur-3xl"></div>
		
		<div class="relative mx-auto max-w-7xl px-6">
			<div class="grid gap-12 lg:grid-cols-2 lg:items-center">
				<div class="text-center lg:text-left">
					<div class="mb-6 inline-flex items-center gap-2 rounded-full bg-white/80 px-4 py-2 text-sm font-medium text-[#c45e38] shadow-sm backdrop-blur">
						<svg class="h-4 w-4" fill="currentColor" viewBox="0 0 24 24">
							<path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z"/>
						</svg>
						The calendar your family deserves
					</div>
					<h1 class="mb-6 text-4xl font-bold leading-tight text-slate-900 md:text-5xl lg:text-6xl">
						Where <span class="text-[#c45e38]">family</span> schedules come together
					</h1>
					<p class="mx-auto mb-8 max-w-xl text-lg text-slate-600 md:text-xl lg:mx-0">
						Soccer practice, parent-teacher conferences, date night—keep every family member's schedule in one warm, welcoming place.
					</p>
					<div class="flex flex-col items-center justify-center gap-4 sm:flex-row lg:justify-start">
						<a href="/signup" class="w-full rounded-full bg-[#c45e38] px-8 py-4 text-center text-lg font-semibold text-white shadow-lg shadow-[#c45e38]/30 transition-all hover:bg-[#a14d32] hover:shadow-xl sm:w-auto">
							Start Free Today
						</a>
						<a href="/features" class="w-full rounded-full border-2 border-slate-300 px-8 py-4 text-center text-lg font-semibold text-slate-700 transition-colors hover:border-slate-400 hover:bg-white/50 sm:w-auto">
							See Features
						</a>
					</div>
					<div class="mt-8 flex items-center justify-center gap-4 lg:justify-start">
						<div class="flex -space-x-2">
							<div class="h-8 w-8 rounded-full bg-[#FED5CF] border-2 border-white flex items-center justify-center text-xs font-bold text-[#c45e38]">S</div>
							<div class="h-8 w-8 rounded-full bg-[#BEDAE3] border-2 border-white flex items-center justify-center text-xs font-bold text-[#366d7e]">M</div>
							<div class="h-8 w-8 rounded-full bg-[#F1B598] border-2 border-white flex items-center justify-center text-xs font-bold text-[#84412e]">J</div>
							<div class="h-8 w-8 rounded-full bg-[#C4E9DA] border-2 border-white flex items-center justify-center text-xs font-bold text-[#2d5866]">T</div>
						</div>
					</div>
				</div>

				<!-- Family Photo -->
				<div class="relative">
					<div class="relative mx-auto max-w-md">
						<div class="relative rounded-3xl overflow-hidden shadow-2xl">
							<img 
								src="https://images.pexels.com/photos/4586688/pexels-photo-4586688.jpeg?auto=compress&cs=tinysrgb&w=800" 
								alt="Father and son smiling together outdoors" 
								class="w-full aspect-[4/3] object-cover"
							/>
							<div class="absolute inset-0 bg-gradient-to-t from-black/20 to-transparent"></div>
						</div>
						
						<div class="absolute -bottom-4 -left-4 rounded-2xl bg-white p-4 shadow-lg">
							<div class="flex items-center gap-3">
								<div class="h-10 w-10 rounded-xl bg-[#FED5CF] flex items-center justify-center">
									<svg class="h-5 w-5 text-[#c45e38]" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
										<rect x="3" y="4" width="18" height="18" rx="2" />
										<line x1="16" y1="2" x2="16" y2="6" />
										<line x1="8" y1="2" x2="8" y2="6" />
										<line x1="3" y1="10" x2="21" y2="10" />
									</svg>
								</div>
								<div>
									<div class="text-sm font-semibold text-slate-900">Family Calendar</div>
									<div class="text-xs text-slate-500">3 events today</div>
								</div>
							</div>
						</div>

						<div class="absolute -right-4 top-8 rounded-2xl bg-white p-3 shadow-lg">
							<div class="flex items-center gap-2">
								<div class="h-8 w-8 rounded-full bg-[#C4E9DA] flex items-center justify-center">
									<svg class="h-4 w-4 text-[#2d5866]" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
										<path d="M5 13l4 4L19 7" />
									</svg>
								</div>
								<div class="text-xs">
									<div class="font-medium text-slate-900">Emma added</div>
									<div class="text-slate-500">Soccer practice</div>
								</div>
							</div>
						</div>
					</div>
				</div>
			</div>
		</div>
	</section>

	<!-- Trust Strip -->
	<section class="bg-white py-4">
		<div class="mx-auto max-w-7xl px-6">
			<div class="flex items-center justify-center gap-8 overflow-hidden">
				<div class="flex items-center gap-2 text-slate-400">
					<svg class="h-5 w-5" fill="currentColor" viewBox="0 0 24 24"><path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z"/></svg>
					<span class="text-sm font-medium">Families First</span>
				</div>
				<div class="h-1 w-1 rounded-full bg-slate-300"></div>
				<div class="flex items-center gap-2 text-slate-400">
					<svg class="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z"/></svg>
					<span class="text-sm font-medium">Private & Secure</span>
				</div>
				<div class="h-1 w-1 rounded-full bg-slate-300"></div>
				<div class="flex items-center gap-2 text-slate-400">
					<svg class="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path d="M13 10V3L4 14h7v7l9-11h-7z"/></svg>
					<span class="text-sm font-medium">Algorithm-Powered</span>
				</div>
				<div class="h-1 w-1 rounded-full bg-slate-300"></div>
				<div class="flex items-center gap-2 text-slate-400">
					<svg class="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>
					<span class="text-sm font-medium">Free Forever Plan</span>
				</div>
			</div>
		</div>
	</section>

	<!-- Feature Highlights -->
	<section class="bg-white py-20">
		<div class="mx-auto max-w-7xl px-6">
			<div class="mb-14 text-center">
				<h2 class="text-3xl font-bold text-slate-900 md:text-4xl">Your family, finally organized</h2>
				<p class="mx-auto mt-3 max-w-xl text-lg text-slate-500">Three features that make Family Planz different from every other calendar.</p>
			</div>
			<div class="grid gap-6 md:grid-cols-3">
				<div class="rounded-2xl bg-gradient-to-br from-[#FED5CF]/30 to-white p-8 transition-all hover:shadow-lg hover:-translate-y-1">
					<div class="mb-5 flex h-14 w-14 items-center justify-center rounded-2xl bg-white shadow-sm ring-1 ring-slate-200">
						<svg class="h-7 w-7 text-[#c45e38]" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
							<path d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
						</svg>
					</div>
					<h3 class="mb-2 text-xl font-bold text-slate-900">Drag & drop rescheduling</h3>
					<p class="text-slate-600 leading-relaxed">Move events around, reassign to another parent, or extend the time—all with a quick drag. No form-filling needed.</p>
				</div>

				<div class="rounded-2xl bg-gradient-to-br from-[#C4E9DA]/30 to-white p-8 transition-all hover:shadow-lg hover:-translate-y-1">
					<div class="mb-5 flex h-14 w-14 items-center justify-center rounded-2xl bg-white shadow-sm ring-1 ring-slate-200">
						<svg class="h-7 w-7 text-[#2d5866]" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
							<path d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
						</svg>
					</div>
					<h3 class="mb-2 text-xl font-bold text-slate-900">Smart recurrence</h3>
					<p class="text-slate-600 leading-relaxed">Set soccer practice once. It repeats weekly, skips holidays, and adjusts when school's out. No more recreating every week.</p>
				</div>

				<div class="rounded-2xl bg-gradient-to-br from-[#BEDAE3]/30 to-white p-8 transition-all hover:shadow-lg hover:-translate-y-1">
					<div class="mb-5 flex h-14 w-14 items-center justify-center rounded-2xl bg-white shadow-sm ring-1 ring-slate-200">
						<svg class="h-7 w-7 text-[#366d7e]" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
							<path d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" />
						</svg>
					</div>
					<h3 class="mb-2 text-xl font-bold text-slate-900">Shared checklists</h3>
					<p class="text-slate-600 leading-relaxed">Who's bringing snacks? Who's picking up the gift? Add to-dos right on the event so nothing gets forgotten.</p>
				</div>
			</div>
			<div class="mt-12 text-center">
				<a href="/features" class="inline-flex items-center gap-2 rounded-full border-2 border-slate-300 px-6 py-3 text-sm font-semibold text-slate-700 transition-colors hover:border-slate-400 hover:bg-slate-50">
					See all features
					<svg class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path d="M17 8l4 4m0 0l-4 4m4-4H3" /></svg>
				</a>
			</div>
		</div>
	</section>

	<!-- How It Works -->
	<section class="py-20">
		<div class="mx-auto max-w-7xl px-6">
			<div class="grid gap-16 lg:grid-cols-2 lg:items-center">
				<div>
					<div class="inline-flex items-center gap-2 rounded-full bg-[#FED5CF] px-4 py-1.5 text-sm font-medium text-[#c45e38]">
						<svg class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
							<path d="M13 10V3L4 14h7v7l9-11h-7z" />
						</svg>
						As easy as 1-2-3
					</div>
					<h2 class="mt-4 text-3xl font-bold text-slate-900 md:text-4xl">
						From family chat to calendar in seconds
					</h2>
					<p class="mt-4 text-lg text-slate-600">
						No more manual entry. Just paste a text, email, or message—our smart algorithm does the rest.
					</p>
					
					<div class="mt-8 space-y-6">
						<div class="flex gap-4">
							<div class="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full bg-[#FED5CF] text-lg font-bold text-[#c45e38]">1</div>
							<div>
								<h4 class="font-semibold text-slate-900">Copy a message</h4>
								<p class="text-slate-600">From your partner, the school, or the family group chat</p>
							</div>
						</div>
						<div class="flex gap-4">
							<div class="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full bg-[#FED5CF] text-lg font-bold text-[#c45e38]">2</div>
							<div>
								<h4 class="font-semibold text-slate-900">Paste it in</h4>
								<p class="text-slate-600">Our smart algorithm reads the date, time, location, and who it's for</p>
							</div>
						</div>
						<div class="flex gap-4">
							<div class="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full bg-[#FED5CF] text-lg font-bold text-[#c45e38]">3</div>
							<div>
								<h4 class="font-semibold text-slate-900">Everyone sees it</h4>
								<p class="text-slate-600">The whole family's calendar updates instantly</p>
							</div>
						</div>
					</div>
				</div>

				<!-- Demo terminal -->
				<div class="relative">
					<div class="rounded-3xl bg-gradient-to-br from-slate-900 to-slate-800 p-6 shadow-2xl">
						<div class="mb-4 flex items-center gap-2">
							<div class="h-3 w-3 rounded-full bg-red-500"></div>
							<div class="h-3 w-3 rounded-full bg-yellow-500"></div>
							<div class="h-3 w-3 rounded-full bg-green-500"></div>
							<span class="ml-2 text-xs text-slate-400">Family Planz</span>
						</div>
						<div class="rounded-2xl bg-slate-800 p-4">
							<p class="mb-3 text-xs text-slate-400">// Text from your partner:</p>
							<div class="rounded-xl bg-slate-700/50 p-3">
								<div class="flex items-start gap-2">
									<div class="h-6 w-6 rounded-full bg-[#F1B598] flex items-center justify-center text-xs font-bold text-white">D</div>
									<div>
										<p class="text-sm text-slate-200">"Hey! Emma's soccer practice is</p>
										<p class="text-sm text-slate-200">Saturday 10am at Riverside Park 🏈"</p>
									</div>
								</div>
							</div>
						</div>
						<div class="mt-4 flex justify-center">
							<svg class="h-6 w-6 text-[#F1B598] animate-bounce" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
								<path d="M19 14l-7 7m0 0l-7-7m7 7V3" />
							</svg>
						</div>
						<div class="mt-4 rounded-2xl bg-[#F1B598]/20 p-4">
							<div class="flex items-center gap-2 text-[#F1B598]">
								<svg class="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
									<rect x="3" y="4" width="18" height="18" rx="2" />
									<line x1="16" y1="2" x2="16" y2="6" />
									<line x1="8" y1="2" x2="8" y2="6" />
									<line x1="3" y1="10" x2="21" y2="10" />
								</svg>
								<span class="font-semibold">Added to Family Calendar!</span>
							</div>
							<div class="mt-3 rounded-xl bg-slate-800/50 p-3">
								<div class="flex items-center justify-between">
									<div>
										<p class="font-medium text-[#F1B598]">Emma's Soccer Practice</p>
										<p class="text-sm text-slate-400">Saturday, 10:00 AM</p>
										<p class="text-sm text-slate-400">Riverside Park</p>
									</div>
									<div class="flex items-center gap-1 rounded-full bg-[#F1B598]/30 px-2 py-1">
										<div class="h-4 w-4 rounded-full bg-[#F1B598]"></div>
										<span class="text-xs text-[#F1B598]">Emma</span>
									</div>
								</div>
							</div>
						</div>
					</div>
				</div>
			</div>
		</div>
	</section>

	<!-- CTA -->
	<section class="bg-gradient-to-b from-white to-[#FED5CF]/10 py-20">
		<div class="mx-auto max-w-4xl px-6 text-center">
			<h2 class="mb-4 text-3xl font-bold text-slate-900 md:text-4xl">Ready to bring your family together?</h2>
			<p class="mx-auto mb-10 max-w-2xl text-xl text-slate-600">
				Join thousands of families who've simplified their lives with Family Planz.
			</p>
			<a href="/signup" class="inline-block rounded-full bg-[#c45e38] px-10 py-4 text-lg font-bold text-white shadow-lg shadow-[#c45e38]/30 transition-all hover:bg-[#a14d32] hover:shadow-xl hover:scale-105">
				Start Free for Your Family
			</a>
			<p class="mt-4 text-sm text-slate-500">No credit card required. Free forever for small families.</p>
		</div>
	</section>
</div>
