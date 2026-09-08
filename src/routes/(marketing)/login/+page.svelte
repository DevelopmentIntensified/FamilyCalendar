<script lang="ts">
	import type { PageData } from './$types';
	import { goto } from '$app/navigation';
	import { page } from '$app/state';
	import { onMount } from 'svelte';
	import AuthCard from '$lib/components/auth/AuthCard.svelte';
	import AuthInput from '$lib/components/auth/AuthInput.svelte';
	import ModeToggle from '$lib/components/auth/ModeToggle.svelte';

	let { data }: { data: PageData } = $props();

	let mode: 'password' | 'magic-link' = $state('password');
	let email = $state('');
	let password = $state('');
	let error = $state('');
	let waiting = $state(false);
	let emailSent = $state(false);
	let code = $state('');
	let resent = $state(false);
	let resentTimer: ReturnType<typeof setTimeout> | undefined;

	onMount(() => {
		const urlError = page.url.searchParams.get('error');
		if (urlError) {
			error = urlError;
			const url = new URL(page.url);
			url.searchParams.delete('error');
			goto(url.pathname + url.search, { replaceState: true });
		}

		return () => clearTimeout(resentTimer);
	});

	async function handlePasswordLogin() {
		waiting = true;
		error = '';

		try {
			const res = await fetch('/login/password', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ email, password })
			});

			const json = await res.json();

			if (json.error) {
				error = json.error;
			} else {
				await goto('/calendar', { invalidateAll: true });
			}
		} catch {
			error = 'Failed to login';
		}

		waiting = false;
	}

	async function handleMagicLinkLogin() {
		waiting = true;
		error = '';

		try {
			const res = await fetch('/login/email', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ email })
			});

			const json = await res.json();

			if (json.error) {
				error = json.error;
			} else {
				emailSent = true;
			}
		} catch {
			error = 'Failed to send login link';
		}

		waiting = false;
	}

	async function handleCodeVerification() {
		waiting = true;
		error = '';

		try {
			const res = await fetch('/login/email/code', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ code })
			});

			if (res.ok) {
				await goto('/calendar', { invalidateAll: true });
			} else {
				const json = await res.json();
				error = json.error || 'Invalid code';
			}
		} catch {
			error = 'Verification failed';
		}

		waiting = false;
	}

	async function resendCode() {
		waiting = true;
		error = '';

		try {
			const res = await fetch('/login/email', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ email })
			});

			const json = await res.json();

			if (json.error) {
				error = json.error;
			} else {
				resent = true;
				clearTimeout(resentTimer);
				resentTimer = setTimeout(() => (resent = false), 3000);
			}
		} catch {
			error = 'Failed to send login link';
		}

		waiting = false;
	}

	const submitClasses =
		'flex min-h-[48px] w-full items-center justify-center rounded-full bg-primary-600 px-4 py-3 text-base font-semibold text-white transition-colors hover:bg-primary-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:bg-slate-200 disabled:text-slate-500';
</script>

<svelte:head>
	<title>Family Planz: Login</title>
</svelte:head>

<div class="flex min-h-screen flex-col items-center bg-slate-50 px-4 pb-16 pt-10 sm:pt-16">
	<a
		href="/"
		aria-label="Family Planz home"
		class="mb-8 flex items-center gap-2 rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500 focus-visible:ring-offset-2"
	>
		<svg
			viewBox="0 0 24 24"
			fill="none"
			stroke="currentColor"
			stroke-width="2"
			stroke-linecap="round"
			stroke-linejoin="round"
			class="h-5 w-5 text-primary-600"
			aria-hidden="true"
		>
			<path d="M8 2v4" /><path d="M16 2v4" /><rect width="18" height="18" x="3" y="4" rx="2" /><path
				d="M3 10h18"
			/>
		</svg>
		<span class="text-lg font-bold tracking-tight text-slate-800">Family Planz</span>
	</a>

	<AuthCard>
		<header class="mb-8 text-center">
			<h1 class="text-3xl font-bold tracking-tight text-slate-900">Welcome Back</h1>
			{#if data.isLoggedIn && !data.mergeMode}
				<p class="mt-2 text-sm text-pretty text-slate-600">You are already logged in.</p>
			{:else if !data.mergeMode}
				<p class="mt-2 text-sm text-pretty text-slate-600">
					Don't have an account?
					<a
						href="/signup"
						class="rounded font-medium text-primary-600 hover:text-primary-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500 focus-visible:ring-offset-2"
						>Sign up</a
					>
					or just start using it right away.
				</p>
			{/if}
		</header>

		{#if data.mergeMode}
			<div class="mb-6 flex items-start gap-3 rounded-xl bg-[#BEDAE3]/40 p-4">
				<svg
					viewBox="0 0 24 24"
					fill="none"
					stroke="currentColor"
					stroke-width="2"
					stroke-linecap="round"
					stroke-linejoin="round"
					class="h-5 w-5 shrink-0 text-slate-700"
					aria-hidden="true"
				>
					<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /><path
						d="M22 21v-2a4 4 0 0 0-3-3.87"
					/><path d="M16 3.13a4 4 0 0 1 0 7.75" />
				</svg>
				<p class="text-sm leading-relaxed text-slate-700">
					Log in with the account tied to this email, and we'll merge the calendar you've added on
					this device into it.
				</p>
			</div>
		{/if}

		{#if data.isLoggedIn && !data.mergeMode}
			<a href="/calendar" class={submitClasses}>Go to Calendar</a>
		{:else}
			{#if error}
				<div
					role="alert"
					class="mb-4 flex items-start gap-2.5 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700"
				>
					<svg
						viewBox="0 0 24 24"
						fill="none"
						stroke="currentColor"
						stroke-width="2"
						stroke-linecap="round"
						stroke-linejoin="round"
						class="mt-0.5 h-4 w-4 shrink-0"
						aria-hidden="true"
					>
						<circle cx="12" cy="12" r="10" /><line x1="12" x2="12" y1="8" y2="12" /><line
							x1="12"
							x2="12.01"
							y1="16"
							y2="16"
						/>
					</svg>
					<span>{error}</span>
				</div>
			{/if}

			{#if emailSent}
				<section class="text-center">
					<div
						class="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-[#BEDAE3]/50"
					>
						<svg
							viewBox="0 0 24 24"
							fill="none"
							stroke="currentColor"
							stroke-width="2"
							stroke-linecap="round"
							stroke-linejoin="round"
							class="h-7 w-7 text-slate-700"
							aria-hidden="true"
						>
							<rect width="20" height="16" x="2" y="4" rx="2" /><path
								d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7"
							/>
						</svg>
					</div>
					<h2 class="mb-2 text-xl font-semibold text-slate-900">Check Your Email</h2>
					<p class="mb-6 text-sm text-slate-600">
						We've sent a login code to
						<strong class="font-semibold text-slate-900">{email}</strong>
					</p>

					<form
						onsubmit={(e) => {
							e.preventDefault();
							handleCodeVerification();
						}}
						class="space-y-4"
					>
						<AuthInput
							id="code"
							label="Login code"
							placeholder="Enter login code"
							autocomplete="one-time-code"
							inputmode="numeric"
							center
							bind:value={code}
							required
						/>
						<button type="submit" disabled={waiting} aria-busy={waiting} class={submitClasses}>
							{waiting ? 'Logging in...' : 'Login'}
						</button>
					</form>

					<div class="mt-4 flex items-center justify-center gap-2">
						<button
							type="button"
							onclick={resendCode}
							class="min-h-[44px] rounded px-1 text-sm text-slate-600 transition-colors hover:text-primary-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500 focus-visible:ring-offset-2"
						>
							Didn't receive the code? Resend
						</button>
						{#if resent}
							<span
								class="rounded-full bg-[#C4E9DA]/60 px-2.5 py-1 text-xs font-medium text-slate-800"
								>Sent again ✓</span
							>
						{/if}
					</div>
				</section>
			{:else}
				<ModeToggle
					bind:value={mode}
					options={[
						{ value: 'password', label: 'Password' },
						{ value: 'magic-link', label: 'Email Link' }
					]}
				/>

				{#if mode === 'password'}
					<form
						onsubmit={(e) => {
							e.preventDefault();
							handlePasswordLogin();
						}}
						class="space-y-5"
					>
						<AuthInput
							id="email"
							type="email"
							autocomplete="email"
							label="Email"
							bind:value={email}
							required
						/>
						<AuthInput
							id="password"
							type="password"
							autocomplete="current-password"
							label="Password"
							bind:value={password}
							required
						>
							{#snippet labelRight()}
								<a
									href="/forgot-password"
									class="rounded text-xs font-medium text-primary-600 hover:text-primary-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500 focus-visible:ring-offset-2"
								>
									Forgot your password?
								</a>
							{/snippet}
						</AuthInput>
						<button type="submit" disabled={waiting} aria-busy={waiting} class={submitClasses}>
							{waiting ? 'Logging in...' : 'Login'}
						</button>
					</form>
				{:else}
					<form
						onsubmit={(e) => {
							e.preventDefault();
							handleMagicLinkLogin();
						}}
						class="space-y-4"
					>
						<AuthInput
							id="emailML"
							type="email"
							autocomplete="email"
							label="Email"
							bind:value={email}
							required
						/>
						<button type="submit" disabled={waiting} aria-busy={waiting} class={submitClasses}>
							{waiting ? 'Sending...' : 'Send Login Link'}
						</button>
					</form>
				{/if}
			{/if}
		{/if}

		{#if !data.isLoggedIn && !data.mergeMode}
			<div class="mt-6 border-t border-slate-100 pt-5">
				<a
					href="/calendar"
					class="flex min-h-[48px] w-full items-center justify-center rounded-full border border-slate-300 px-4 py-3 text-center text-sm font-medium text-slate-600 transition-colors hover:border-slate-400 hover:bg-slate-50 hover:text-slate-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-400 focus-visible:ring-offset-2"
				>
					Start planning — no account needed
				</a>
				<p class="mt-2 text-center text-xs text-slate-400">
					Creates a private calendar on this device. Add an email later to sync.
				</p>
			</div>
		{/if}
	</AuthCard>
</div>
