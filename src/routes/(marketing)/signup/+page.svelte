<script lang="ts">
	import type { PageData } from './$types';
	import { goto } from '$app/navigation';
	import { onMount } from 'svelte';
	import AuthCard from '$lib/components/auth/AuthCard.svelte';
	import AuthInput from '$lib/components/auth/AuthInput.svelte';
	import ModeToggle from '$lib/components/auth/ModeToggle.svelte';

	let { data }: { data: PageData } = $props();

	let mode: 'password' | 'magic-link' = $state('password');
	let email = $state('');
	let password = $state('');
	let confirmPassword = $state('');
	let firstName = $state('');
	let lastName = $state('');
	let error = $state('');
	let waiting = $state(false);
	let emailSent = $state(false);
	let code = $state('');
	let resent = $state(false);
	let resentTimer: ReturnType<typeof setTimeout> | undefined;

	onMount(() => {
		return () => clearTimeout(resentTimer);
	});

	async function handlePasswordSignup() {
		waiting = true;
		error = '';

		if (password !== confirmPassword) {
			error = 'Passwords do not match';
			waiting = false;
			return;
		}

		if (password.length < 8) {
			error = 'Password must be at least 8 characters';
			waiting = false;
			return;
		}

		try {
			const res = await fetch('/signup/password', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ email, password, firstName, lastName })
			});

			const json = await res.json();

			if (json.error) {
				error = json.error;
			} else {
				await goto('/calendar', { invalidateAll: true });
			}
		} catch {
			error = 'Failed to create account';
		}

		waiting = false;
	}

	async function handleMagicLinkSignup() {
		waiting = true;
		error = '';

		try {
			const res = await fetch('/signup/email', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ email, firstName, lastName })
			});

			const json = await res.json();

			if (json.error) {
				error = json.error;
			} else {
				emailSent = true;
			}
		} catch {
			error = 'Failed to send verification email';
		}

		waiting = false;
	}

	async function handleCodeVerification() {
		waiting = true;
		error = '';

		try {
			const res = await fetch('/signup/email/code', {
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
			const res = await fetch('/signup/email', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ email, firstName, lastName })
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
			error = 'Failed to send verification email';
		}

		waiting = false;
	}

	const submitClasses =
		'flex min-h-[48px] w-full items-center justify-center rounded-full bg-primary-600 px-4 py-3 text-base font-semibold text-white transition-colors hover:bg-primary-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:bg-slate-200 disabled:text-slate-500';
</script>

<svelte:head>
	<title>Family Planz: Sign Up</title>
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
			<h1 class="text-3xl font-bold tracking-tight text-slate-900">Create Account</h1>
			{#if data.isLoggedIn}
				<p class="mt-2 text-pretty text-sm text-slate-600">You are already logged in.</p>
			{:else}
				<p class="mt-2 text-pretty text-sm text-slate-600">
					Already have an account?
					<a
						href="/login"
						class="rounded font-medium text-primary-600 hover:text-primary-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500 focus-visible:ring-offset-2"
						>Sign in</a
					>
				</p>
			{/if}
		</header>

		{#if data.isLoggedIn}
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
						We've sent a verification code to
						<strong class="font-semibold text-slate-900">{email}</strong>
					</p>

					<form
						onsubmit={(e) => {
							e.preventDefault();
							handleCodeVerification();
						}}
						class="space-y-4"
					>
						<input
							id="code"
							type="text"
							bind:value={code}
							placeholder="Enter verification code"
							autocomplete="one-time-code"
							inputmode="numeric"
							required
							class="block w-full rounded-[10px] border border-slate-300 bg-white px-4 py-3 text-center text-lg tracking-[0.3em] text-slate-900 placeholder-slate-400 transition-colors focus:border-primary-500 focus:outline-none focus:ring-2 focus:ring-primary-500/20"
						/>
						<button type="submit" disabled={waiting} aria-busy={waiting} class={submitClasses}>
							{waiting ? 'Verifying...' : 'Verify Code'}
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
					groupLabel="Signup method"
					options={[
						{ value: 'password', label: 'Password' },
						{ value: 'magic-link', label: 'Email Link' }
					]}
				/>

				{#if mode === 'password'}
					<form
						onsubmit={(e) => {
							e.preventDefault();
							handlePasswordSignup();
						}}
						class="space-y-5"
					>
						<div class="grid grid-cols-2 gap-4">
							<AuthInput
								id="firstName"
								label="First Name"
								autocomplete="given-name"
								bind:value={firstName}
								required
							/>
							<AuthInput
								id="lastName"
								label="Last Name"
								autocomplete="family-name"
								bind:value={lastName}
								required
							/>
						</div>

						<AuthInput
							id="email"
							type="email"
							autocomplete="email"
							label="Email"
							bind:value={email}
							required
						/>

						<div>
							<AuthInput
								id="password"
								type="password"
								autocomplete="new-password"
								label="Password"
								bind:value={password}
								required
							/>
							<p class="mt-1 text-xs text-slate-500">At least 8 characters</p>
						</div>

						<AuthInput
							id="confirmPassword"
							type="password"
							autocomplete="new-password"
							label="Confirm Password"
							bind:value={confirmPassword}
							required
						/>

						<button type="submit" disabled={waiting} aria-busy={waiting} class={submitClasses}>
							{waiting ? 'Creating Account...' : 'Create Account'}
						</button>
					</form>
				{:else}
					<form
						onsubmit={(e) => {
							e.preventDefault();
							handleMagicLinkSignup();
						}}
						class="space-y-5"
					>
						<div class="grid grid-cols-2 gap-4">
							<AuthInput
								id="firstNameML"
								label="First Name"
								autocomplete="given-name"
								bind:value={firstName}
								required
							/>
							<AuthInput
								id="lastNameML"
								label="Last Name"
								autocomplete="family-name"
								bind:value={lastName}
								required
							/>
						</div>

						<AuthInput
							id="emailML"
							type="email"
							autocomplete="email"
							label="Email"
							bind:value={email}
							required
						/>

						<button type="submit" disabled={waiting} aria-busy={waiting} class={submitClasses}>
							{waiting ? 'Sending...' : 'Send Verification Link'}
						</button>
					</form>
				{/if}
			{/if}
		{/if}

		{#if !data.isLoggedIn}
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
