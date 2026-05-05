<script lang="ts">
	import { enhance } from '$app/forms';
	import type { ActionData } from './$types';

	export let form: ActionData;

	let loading = false;
	let submitted = form?.success === true || false;
	let formEmail = form?.email ?? '';
</script>

<svelte:head>
	<title>Join the Waitlist - Family Master</title>
</svelte:head>

<div class="min-h-screen bg-slate-50 pt-20">
	<div class="mx-auto max-w-md px-6 py-12">
		{#if submitted}
			<div class="rounded-2xl border border-amber-200 bg-white p-8 shadow-lg">
				<div class="mb-6 text-center">
					<div class="mb-4 flex justify-center">
						<div class="rounded-full bg-amber-100 p-3">
							<svg class="h-8 w-8 text-amber-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
								<path d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
							</svg>
						</div>
					</div>
					<h1 class="mb-2 text-2xl font-bold text-slate-900">Check your email</h1>
					<p class="text-slate-600">We sent a verification link to your inbox.</p>
				</div>
				<div class="rounded-lg bg-amber-50 p-4">
					<p class="text-sm text-amber-800">
						Click the confirmation link in the email we just sent you. This completes your double opt-in and adds you to the waitlist.
					</p>
				</div>
				<div class="mt-6 text-center">
					<p class="text-sm text-slate-500">
						Didn't receive it? <a href="/waitlist" class="font-medium text-amber-600 hover:text-amber-700">Try again</a>
					</p>
				</div>
			</div>
		{:else}
			<div class="rounded-2xl border border-slate-200 bg-white p-8 shadow-lg">
				<div class="mb-6 text-center">
					<span class="mb-4 inline-block rounded-full bg-amber-100 px-4 py-1.5 text-sm font-medium text-amber-800">
						Early Access
					</span>
					<h1 class="mb-2 text-2xl font-bold text-slate-900">Join the Waitlist</h1>
					<p class="text-slate-600">Be among the first to experience Family Master.</p>
				</div>

				<form
					method="POST"
					action="?/join"
					use:enhance={() => {
						loading = true;
						return async ({ update }) => {
							loading = false;
							submitted = true;
							await update();
						};
					}}
					class="space-y-4"
				>
					<div class="space-y-2">
						<label for="name" class="block text-sm font-medium text-slate-700">Full Name</label>
						<input
							type="text"
							id="name"
							name="name"
							required
							class="w-full rounded-lg border border-slate-300 px-4 py-2.5 focus:border-amber-500 focus:ring-amber-500"
							placeholder="Jane Smith"
						/>
					</div>

					<div class="space-y-2">
						<label for="email" class="block text-sm font-medium text-slate-700">Email Address</label>
						<input
							type="email"
							id="email"
							name="email"
							required
							class="w-full rounded-lg border border-slate-300 px-4 py-2.5 focus:border-amber-500 focus:ring-amber-500"
							placeholder="jane@example.com"
						/>
					</div>

					{#if form?.error}
						<div class="rounded-lg bg-red-50 p-3 text-sm text-red-700">
							{form.error}
						</div>
					{/if}

					<button
						type="submit"
						disabled={loading}
						class="w-full rounded-full bg-amber-500 px-4 py-3 font-semibold text-white hover:bg-amber-600 disabled:opacity-50"
					>
						{loading ? 'Joining...' : 'Join the Waitlist'}
					</button>
				</form>

				<div class="mt-6 text-center text-sm text-slate-500">
					<p>By joining, you agree to our <a href="/privacy" class="font-medium text-amber-600 hover:text-amber-700">Privacy Policy</a></p>
				</div>
			</div>

			<div class="mt-8 rounded-2xl bg-slate-100 p-6">
				<h2 class="mb-4 text-lg font-semibold text-slate-900">Why join the waitlist?</h2>
				<ul class="space-y-3">
					<li class="flex items-start gap-3">
						<svg class="h-5 w-5 flex-shrink-0 text-amber-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
							<path d="M11.049 2.927c.3-.921 1.603-.921 1.902 0l1.519 4.674a1 1 0 00.95.69h4.915c.969 0 1.371 1.24.588 1.81l-3.976 2.888a1 1 0 00-.363 1.118l1.518 4.674c.3.922-.755 1.688-1.538 1.118l-3.976-2.888a1 1 0 00-1.176 0l-3.976 2.888c-.783.57-1.838-.197-1.538-1.118l1.518-4.674a1 1 0 00-.363-1.118l-3.976-2.888c-.784-.57-.38-1.81.588-1.81h4.914a1 1 0 00.951-.69l1.519-4.674z" />
						</svg>
						<span class="text-sm text-slate-700">Early access to Family Master</span>
					</li>
					<li class="flex items-start gap-3">
						<svg class="h-5 w-5 flex-shrink-0 text-amber-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
							<path d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
						</svg>
						<span class="text-sm text-slate-700">Exclusive launch pricing</span>
					</li>
					<li class="flex items-start gap-3">
						<svg class="h-5 w-5 flex-shrink-0 text-amber-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
							<path d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
						</svg>
						<span class="text-sm text-slate-700">Priority onboarding support</span>
					</li>
				</ul>
			</div>
		{/if}
	</div>
</div>