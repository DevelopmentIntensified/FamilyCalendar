<script lang="ts">
</script>

<svelte:head>
	<title>Features - Family Planz</title>
</svelte:head>

<div class="min-h-screen bg-[#F8F6F3]">
	<!-- Hero -->
	<section class="relative overflow-hidden bg-gradient-to-br from-[#BEDAE3]/30 via-white to-[#FED5CF]/30 py-20">
		<div class="absolute -right-32 -top-32 h-[500px] w-[500px] rounded-full bg-[#BEDAE3]/20 blur-3xl"></div>
		<div class="absolute -bottom-32 -left-32 h-[400px] w-[400px] rounded-full bg-[#FED5CF]/20 blur-3xl"></div>
		
		<div class="relative mx-auto max-w-7xl px-6 text-center">
			<h1 class="mb-6 text-4xl font-bold text-slate-900 md:text-5xl">
				Everything your <span class="text-[#c45e38]">family</span> needs
			</h1>
			<p class="mx-auto max-w-2xl text-lg text-slate-600 md:text-xl">
				Simple, powerful features designed for real family life.
			</p>
		</div>
	</section>

	<!-- Features Grid -->
	<section class="bg-white py-20">
		<div class="mx-auto max-w-7xl px-6">
			<div class="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
				<div class="rounded-2xl border border-slate-200 bg-white p-6 transition-shadow hover:shadow-lg">
					<div class="mb-4 flex h-12 w-12 items-center justify-center rounded-xl bg-[#FED5CF]">
						<svg class="h-6 w-6 text-[#c45e38]" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
							<rect x="3" y="4" width="18" height="18" rx="2" />
							<line x1="16" y1="2" x2="16" y2="6" />
							<line x1="8" y1="2" x2="8" y2="6" />
							<line x1="3" y1="10" x2="21" y2="10" />
						</svg>
					</div>
					<h3 class="mb-2 text-lg font-bold text-slate-900">Shared Family Calendar</h3>
					<p class="text-slate-600">Everyone's events in one place. No more "who's picking up the kids?" texts.</p>
				</div>

				<div class="rounded-2xl border border-slate-200 bg-white p-6 transition-shadow hover:shadow-lg">
					<div class="mb-4 flex h-12 w-12 items-center justify-center rounded-xl bg-[#FED5CF]">
						<svg class="h-6 w-6 text-[#c45e38]" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
							<path d="M13 10V3L4 14h7v7l9-11h-7z" />
						</svg>
					</div>
					<h3 class="mb-2 text-lg font-bold text-slate-900">Smart Event Import</h3>
					<p class="text-slate-600">Paste a text from your partner or email from school. Our smart algorithm creates the event.</p>
				</div>

				<div class="rounded-2xl border border-slate-200 bg-white p-6 transition-shadow hover:shadow-lg">
					<div class="mb-4 flex h-12 w-12 items-center justify-center rounded-xl bg-[#BEDAE3]">
						<svg class="h-6 w-6 text-[#366d7e]" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
							<path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
							<circle cx="9" cy="7" r="4" />
							<path d="M23 21v-2a4 4 0 0 0-3-3.87" />
							<path d="M16 3.13a4 4 0 0 1 0 7.75" />
						</svg>
					</div>
					<h3 class="mb-2 text-lg font-bold text-slate-900">Family Groups & Invites</h3>
					<p class="text-slate-600">Invite partner, kids, grandparents—anyone who needs to be in the loop.</p>
				</div>

				<div class="rounded-2xl border border-slate-200 bg-white p-6 transition-shadow hover:shadow-lg">
					<div class="mb-4 flex h-12 w-12 items-center justify-center rounded-xl bg-[#C4E9DA]">
						<svg class="h-6 w-6 text-[#2d5866]" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
							<path d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z" />
						</svg>
					</div>
					<h3 class="mb-2 text-lg font-bold text-slate-900">Print for the Fridge</h3>
					<p class="text-slate-600">Hang the weekly schedule on the fridge so everyone can see what's happening.</p>
				</div>

				<div class="rounded-2xl border border-slate-200 bg-white p-6 transition-shadow hover:shadow-lg">
					<div class="mb-4 flex h-12 w-12 items-center justify-center rounded-xl bg-[#D3C7E6]">
						<svg class="h-6 w-6 text-[#6b5b7b]" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
							<path d="M12 18h.01M8 21h8a2 2 0 002-2V5a2 2 0 00-2-2H8a2 2 0 00-2 2v14a2 2 0 002 2z" />
						</svg>
					</div>
					<h3 class="mb-2 text-lg font-bold text-slate-900">Works Everywhere</h3>
					<p class="text-slate-600">Check the calendar from your phone at practice, tablet on couch, or laptop at work.</p>
				</div>

				<div class="rounded-2xl border border-slate-200 bg-white p-6 transition-shadow hover:shadow-lg">
					<div class="mb-4 flex h-12 w-12 items-center justify-center rounded-xl bg-[#F1B598]">
						<svg class="h-6 w-6 text-[#84412e]" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
							<path d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" />
						</svg>
					</div>
					<h3 class="mb-2 text-lg font-bold text-slate-900">RSVP to Events</h3>
					<p class="text-slate-600">Know who's coming to game night or the school play. Going, maybe, or can't make it.</p>
				</div>
			</div>
		</div>
	</section>

	<!-- Family Life Moments -->
	<section class="bg-gradient-to-b from-white to-[#FED5CF]/10 py-20">
		<div class="mx-auto max-w-7xl px-6">
			<div class="mb-16 text-center">
				<h2 class="mb-4 text-3xl font-bold text-slate-900 md:text-4xl">For every moment that matters</h2>
				<p class="mx-auto max-w-2xl text-lg text-slate-600">
					From morning drop-offs to bedtime stories—keep your family's rhythm in one place.
				</p>
			</div>

			<div class="grid gap-6 md:grid-cols-3">
				<div class="group relative overflow-hidden rounded-3xl bg-gradient-to-br from-[#FED5CF] to-[#F1B598]/50 p-8 transition-all hover:shadow-lg">
					<div class="mb-6 flex h-16 w-16 items-center justify-center rounded-2xl bg-white/80 shadow-sm">
						<svg class="h-8 w-8 text-[#c45e38]" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.5">
							<circle cx="12" cy="12" r="10" />
							<path d="M12 6v6l4 2" />
						</svg>
					</div>
					<h3 class="mb-2 text-xl font-bold text-slate-900">Morning routines</h3>
					<p class="text-slate-600">Who's dropping off who? What time is the dentist? See it all at a glance before the day starts.</p>
					<div class="absolute -bottom-4 -right-4 h-24 w-24 rounded-full bg-[#F1B598]/30 blur-xl"></div>
				</div>

				<div class="group relative overflow-hidden rounded-3xl bg-gradient-to-br from-[#C4E9DA] to-[#BEDAE3]/50 p-8 transition-all hover:shadow-lg">
					<div class="mb-6 flex h-16 w-16 items-center justify-center rounded-2xl bg-white/80 shadow-sm">
						<svg class="h-8 w-8 text-[#366d7e]" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.5">
							<path d="M14.828 14.828a4 4 0 01-5.656 0M9 10h.01M15 10h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
						</svg>
					</div>
					<h3 class="mb-2 text-xl font-bold text-slate-900">Kids' activities</h3>
					<p class="text-slate-600">Soccer, piano, ballet, scouts—track every activity, every location, every pickup time in one place.</p>
					<div class="absolute -bottom-4 -right-4 h-24 w-24 rounded-full bg-[#C4E9DA]/30 blur-xl"></div>
				</div>

				<div class="group relative overflow-hidden rounded-3xl bg-gradient-to-br from-[#D3C7E6] to-[#BEDAE3]/50 p-8 transition-all hover:shadow-lg">
					<div class="mb-6 flex h-16 w-16 items-center justify-center rounded-2xl bg-white/80 shadow-sm">
						<svg class="h-8 w-8 text-[#6b5b7b]" fill="currentColor" viewBox="0 0 24 24">
							<path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z"/>
						</svg>
					</div>
					<h3 class="mb-2 text-xl font-bold text-slate-900">Family time</h3>
					<p class="text-slate-600">Date nights, game nights, grandma's visit—make sure the important moments never get double-booked.</p>
					<div class="absolute -bottom-4 -right-4 h-24 w-24 rounded-full bg-[#D3C7E6]/30 blur-xl"></div>
				</div>
			</div>
		</div>
	</section>

	<!-- Problem/Solution -->
	<section class="bg-white py-20">
		<div class="mx-auto max-w-7xl px-6">
			<div class="mb-12 text-center">
				<h2 class="mb-4 text-3xl font-bold text-slate-900 md:text-4xl">We know the struggle</h2>
				<p class="mx-auto max-w-2xl text-lg text-slate-600">Because we're parents too.</p>
			</div>
			
			<div class="grid gap-8 md:grid-cols-2">
				<div class="rounded-3xl bg-red-50 p-8 border border-red-100">
					<div class="mb-4 inline-flex h-12 w-12 items-center justify-center rounded-2xl bg-red-100">
						<svg class="h-6 w-6 text-red-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
							<path d="M12 9v2m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
						</svg>
					</div>
					<h3 class="mb-4 text-xl font-bold text-slate-900">Before Family Planz</h3>
					<ul class="space-y-3 text-slate-600">
						<li class="flex items-start gap-3">
							<span class="mt-0.5 text-red-400">✕</span>
							<span>"Who's picking up the kids?"—texting back and forth</span>
						</li>
						<li class="flex items-start gap-3">
							<span class="mt-0.5 text-red-400">✕</span>
							<span>Double-booked soccer practice and piano lessons</span>
						</li>
						<li class="flex items-start gap-3">
							<span class="mt-0.5 text-red-400">✕</span>
							<span>Grandma shows up on the wrong day for dinner</span>
						</li>
						<li class="flex items-start gap-3">
							<span class="mt-0.5 text-red-400">✕</span>
							<span>Events buried in emails, texts, and sticky notes</span>
						</li>
					</ul>
				</div>
				<div class="rounded-3xl bg-green-50 p-8 border border-green-100">
					<div class="mb-4 inline-flex h-12 w-12 items-center justify-center rounded-2xl bg-green-100">
						<svg class="h-6 w-6 text-green-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
							<path d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
						</svg>
					</div>
					<h3 class="mb-4 text-xl font-bold text-slate-900">With Family Planz</h3>
					<ul class="space-y-3 text-slate-700">
						<li class="flex items-start gap-3">
							<span class="mt-0.5 text-green-500">✓</span>
							<span>One shared calendar—everyone sees the same schedule</span>
						</li>
						<li class="flex items-start gap-3">
							<span class="mt-0.5 text-green-500">✓</span>
							<span>Color-coded by family member so you know who's where</span>
						</li>
						<li class="flex items-start gap-3">
							<span class="mt-0.5 text-green-500">✓</span>
							<span>Paste a text or email—our smart algorithm adds it to the calendar instantly</span>
						</li>
						<li class="flex items-start gap-3">
							<span class="mt-0.5 text-green-500">✓</span>
							<span>RSVP to family events so everyone knows who's coming</span>
						</li>
					</ul>
				</div>
			</div>
		</div>
	</section>

	<!-- Family Gallery -->
	<section class="bg-gradient-to-b from-[#FED5CF]/10 to-white py-20">
		<div class="mx-auto max-w-7xl px-6">
			<div class="mb-16 text-center">
				<h2 class="mb-4 text-3xl font-bold text-slate-900 md:text-4xl">Built for real family life</h2>
				<p class="mx-auto max-w-2xl text-lg text-slate-600">Whether you're a family of 2 or 12, we've got you covered.</p>
			</div>

			<div class="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
				<div class="group relative overflow-hidden rounded-3xl transition-all hover:shadow-xl">
					<img 
						src="https://images.pexels.com/photos/4624879/pexels-photo-4624879.jpeg?auto=compress&cs=tinysrgb&w=600" 
						alt="Mother and son sitting together in living room" 
						class="w-full h-64 object-cover transition-transform group-hover:scale-105"
					/>
					<div class="absolute inset-0 bg-gradient-to-t from-black/60 via-black/20 to-transparent"></div>
					<div class="absolute bottom-0 left-0 right-0 p-6">
						<h3 class="text-lg font-bold text-white">Growing families</h3>
						<p class="text-sm text-white/80">From two to three to four—your calendar grows with you</p>
					</div>
				</div>

				<div class="group relative overflow-hidden rounded-3xl transition-all hover:shadow-xl">
					<img 
						src="https://images.pexels.com/photos/5082644/pexels-photo-5082644.jpeg?auto=compress&cs=tinysrgb&w=600" 
						alt="Big family enjoying breakfast together in kitchen" 
						class="w-full h-64 object-cover transition-transform group-hover:scale-105"
					/>
					<div class="absolute inset-0 bg-gradient-to-t from-black/60 via-black/20 to-transparent"></div>
					<div class="absolute bottom-0 left-0 right-0 p-6">
						<h3 class="text-lg font-bold text-white">Busy households</h3>
						<p class="text-sm text-white/80">Multiple kids, multiple schedules, one simple calendar</p>
					</div>
				</div>

				<div class="group relative overflow-hidden rounded-3xl transition-all hover:shadow-xl md:col-span-2 lg:col-span-1">
					<img 
						src="https://images.pexels.com/photos/5637704/pexels-photo-5637704.jpeg?auto=compress&cs=tinysrgb&w=600" 
						alt="Happy multigenerational Asian family sitting together on bench" 
						class="w-full h-64 object-cover transition-transform group-hover:scale-105"
					/>
					<div class="absolute inset-0 bg-gradient-to-t from-black/60 via-black/20 to-transparent"></div>
					<div class="absolute bottom-0 left-0 right-0 p-6">
						<h3 class="text-lg font-bold text-white">Extended families</h3>
						<p class="text-sm text-white/80">Grandparents, aunts, uncles—invite everyone who cares</p>
					</div>
				</div>
			</div>
		</div>
	</section>

	<!-- Testimonials -->
	<section class="bg-white py-20">
		<div class="mx-auto max-w-7xl px-6">
			<div class="mb-16 text-center">
				<h2 class="mb-4 text-3xl font-bold text-slate-900 md:text-4xl">Families love Family Planz</h2>
				<p class="mx-auto max-w-2xl text-lg text-slate-600">Don't just take our word for it—hear from real families.</p>
			</div>
			
			<div class="grid gap-8 md:grid-cols-3">
				<div class="rounded-3xl bg-[#FED5CF]/20 p-8 border border-[#FED5CF]">
					<div class="flex items-center gap-1 mb-4">
						<svg class="h-5 w-5 text-[#F1B598]" fill="currentColor" viewBox="0 0 20 20"><path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z"/></svg>
						<svg class="h-5 w-5 text-[#F1B598]" fill="currentColor" viewBox="0 0 20 20"><path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z"/></svg>
						<svg class="h-5 w-5 text-[#F1B598]" fill="currentColor" viewBox="0 0 20 20"><path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z"/></svg>
						<svg class="h-5 w-5 text-[#F1B598]" fill="currentColor" viewBox="0 0 20 20"><path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z"/></svg>
						<svg class="h-5 w-5 text-[#F1B598]" fill="currentColor" viewBox="0 0 20 20"><path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z"/></svg>
					</div>
					<p class="text-slate-700 mb-6 italic">"We used to have three different calendars between us. Now everything is in one place. My husband and I finally stopped texting 'who's picking up the kids?'"</p>
					<div class="flex items-center gap-3">
						<div class="h-12 w-12 rounded-full bg-gradient-to-br from-[#FED5CF] to-[#F1B598] flex items-center justify-center text-lg font-bold text-white shadow-sm">S</div>
						<div>
							<div class="font-semibold text-slate-900">Sarah M.</div>
							<div class="text-sm text-slate-500">Mom of 3 · Austin, TX</div>
						</div>
					</div>
				</div>

				<div class="rounded-3xl bg-[#BEDAE3]/20 p-8 border border-[#BEDAE3]">
					<div class="flex items-center gap-1 mb-4">
						<svg class="h-5 w-5 text-[#366d7e]" fill="currentColor" viewBox="0 0 20 20"><path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z"/></svg>
						<svg class="h-5 w-5 text-[#366d7e]" fill="currentColor" viewBox="0 0 20 20"><path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z"/></svg>
						<svg class="h-5 w-5 text-[#366d7e]" fill="currentColor" viewBox="0 0 20 20"><path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z"/></svg>
						<svg class="h-5 w-5 text-[#366d7e]" fill="currentColor" viewBox="0 0 20 20"><path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z"/></svg>
						<svg class="h-5 w-5 text-[#366d7e]" fill="currentColor" viewBox="0 0 20 20"><path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z"/></svg>
					</div>
					<p class="text-slate-700 mb-6 italic">"The smart paste feature is a game changer. I just copy the email from my kid's teacher and boom—it's on our family calendar. Even my teenagers use it."</p>
					<div class="flex items-center gap-3">
						<div class="h-12 w-12 rounded-full bg-gradient-to-br from-[#BEDAE3] to-[#8fbecb] flex items-center justify-center text-lg font-bold text-white shadow-sm">M</div>
						<div>
							<div class="font-semibold text-slate-900">Mike T.</div>
							<div class="text-sm text-slate-500">Dad of 2 · Denver, CO</div>
						</div>
					</div>
				</div>

				<div class="rounded-3xl bg-[#C4E9DA]/20 p-8 border border-[#C4E9DA]">
					<div class="flex items-center gap-1 mb-4">
						<svg class="h-5 w-5 text-[#2d5866]" fill="currentColor" viewBox="0 0 20 20"><path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z"/></svg>
						<svg class="h-5 w-5 text-[#2d5866]" fill="currentColor" viewBox="0 0 20 20"><path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z"/></svg>
						<svg class="h-5 w-5 text-[#2d5866]" fill="currentColor" viewBox="0 0 20 20"><path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z"/></svg>
						<svg class="h-5 w-5 text-[#2d5866]" fill="currentColor" viewBox="0 0 20 20"><path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z"/></svg>
						<svg class="h-5 w-5 text-[#2d5866]" fill="currentColor" viewBox="0 0 20 20"><path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z"/></svg>
					</div>
					<p class="text-slate-700 mb-6 italic">"I invited my parents with one code and now they always know when the grandkids have events. No more 'when is the recital again?' phone calls!"</p>
					<div class="flex items-center gap-3">
						<div class="h-12 w-12 rounded-full bg-gradient-to-br from-[#C4E9DA] to-[#5fa0b1] flex items-center justify-center text-lg font-bold text-white shadow-sm">J</div>
						<div>
							<div class="font-semibold text-slate-900">Jessica L.</div>
							<div class="text-sm text-slate-500">Mom of 1 · Portland, OR</div>
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
