<script lang="ts">
	import { enhance } from '$app/forms';
	import { fade } from 'svelte/transition';

	let name = '';
	let email = '';
	let message = '';
	let isSubmitting = false;
	let submitted = false;
	let error = '';
</script>

<svelte:head>
	<title>Family Planz: Contact Us</title>
</svelte:head>

<div class="min-h-screen bg-slate-50 pt-20">
	<div class="mx-auto max-w-7xl px-6 py-12">
		<div class="mx-auto max-w-2xl">
			<div class="mb-10 text-center">
				<h1 class="mb-4 text-4xl font-bold text-slate-900">Contact Us</h1>
				<p class="text-lg text-slate-600">
					Have questions? We'd love to hear from you. Send us a message and we'll respond as soon as possible.
				</p>
			</div>

			{#if submitted}
				<div
					transition:fade
					class="rounded-xl border border-green-200 bg-green-50 p-8 text-center"
				>
					<div class="mb-4 flex justify-center">
						<div class="flex h-16 w-16 items-center justify-center rounded-full bg-green-100">
							<svg class="h-8 w-8 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
								<path d="M5 13l4 4L19 7" />
							</svg>
						</div>
					</div>
					<h2 class="mb-2 text-2xl font-bold text-green-800">Message Sent!</h2>
					<p class="text-green-700">Thank you for reaching out. We'll get back to you soon.</p>
					<button
						on:click={() => { submitted = false; name = ''; email = ''; message = ''; }}
						class="mt-6 text-primary-600 hover:text-primary-700 font-medium"
					>
						Send another message
					</button>
				</div>
			{:else}
				<div class="rounded-2xl border border-slate-200 bg-white p-8 shadow-sm">
				<form
					method="POST"
					use:enhance={() => {
							isSubmitting = true;
							return async ({ result, update }) => {
								isSubmitting = false;
								if (result.type === 'success') {
									submitted = true;
								} else if (result.type === 'failure') {
									const data = result.data as { error?: string } | undefined;
									error = data?.error || 'Something went wrong. Please try again.';
								}
								await update();
							};
						}}
						class="space-y-6"
					>
						{#if error}
							<div transition:fade class="rounded-lg bg-red-50 p-4 text-red-700">
								{error}
							</div>
						{/if}

						<!-- Honeypot field for spam protection -->
						<div class="hidden" aria-hidden="true">
							<label for="website">Website</label>
							<input type="text" name="website" id="website" tabindex="-1" autocomplete="off" aria-hidden="true" />
						</div>

						<div>
							<label for="name" class="mb-2 block text-sm font-medium text-slate-700">Name</label>
							<input
								type="text"
								id="name"
								name="name"
								bind:value={name}
								required
								class="w-full rounded-lg border border-slate-300 px-4 py-3 text-slate-900 placeholder-slate-400 transition-colors focus:border-primary-500 focus:outline-none focus:ring-2 focus:ring-primary-500/20"
								placeholder="Your name"
							/>
						</div>

						<div>
							<label for="email" class="mb-2 block text-sm font-medium text-slate-700">Email</label>
							<input
								type="email"
								id="email"
								name="email"
								bind:value={email}
								required
								class="w-full rounded-lg border border-slate-300 px-4 py-3 text-slate-900 placeholder-slate-400 transition-colors focus:border-primary-500 focus:outline-none focus:ring-2 focus:ring-primary-500/20"
								placeholder="you@example.com"
							/>
						</div>

						<div>
							<label for="message" class="mb-2 block text-sm font-medium text-slate-700">Message</label>
							<textarea
								id="message"
								name="message"
								bind:value={message}
								required
								rows="5"
								class="w-full resize-none rounded-lg border border-slate-300 px-4 py-3 text-slate-900 placeholder-slate-400 transition-colors focus:border-primary-500 focus:outline-none focus:ring-2 focus:ring-primary-500/20"
								placeholder="How can we help you?"
							></textarea>
						</div>

						<button
							type="submit"
							disabled={isSubmitting}
							class="w-full rounded-full bg-primary-600 px-6 py-3 text-lg font-semibold text-white shadow-lg shadow-primary-600/30 transition-all hover:bg-primary-700 hover:shadow-xl disabled:cursor-not-allowed disabled:opacity-70"
						>
							{#if isSubmitting}
								<span class="flex items-center justify-center gap-2">
									<svg class="h-5 w-5 animate-spin" fill="none" viewBox="0 0 24 24">
										<circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
										<path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"></path>
									</svg>
									Sending...
								</span>
							{:else}
								Send Message
							{/if}
						</button>
					</form>
				</div>

				<div class="mt-10 grid gap-6 md:grid-cols-3">
					<div class="text-center">
						<div class="mb-3 inline-flex h-12 w-12 items-center justify-center rounded-xl bg-primary-100">
							<svg class="h-6 w-6 text-primary-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
								<path d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
							</svg>
						</div>
						<h3 class="font-semibold text-slate-900">Email</h3>
						<p class="text-sm text-slate-600">hello@familyplanz.com</p>
					</div>
					<div class="text-center">
						<div class="mb-3 inline-flex h-12 w-12 items-center justify-center rounded-xl bg-primary-100">
							<svg class="h-6 w-6 text-primary-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
								<path d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
								<path d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
							</svg>
						</div>
						<h3 class="font-semibold text-slate-900">Location</h3>
						<p class="text-sm text-slate-600">United States</p>
					</div>
					<div class="text-center">
						<div class="mb-3 inline-flex h-12 w-12 items-center justify-center rounded-xl bg-primary-100">
							<svg class="h-6 w-6 text-primary-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
								<path d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
							</svg>
						</div>
						<h3 class="font-semibold text-slate-900">Hours</h3>
						<p class="text-sm text-slate-600">Mon-Fri, 9am-5pm EST</p>
					</div>
				</div>
			{/if}
		</div>
	</div>
</div>
