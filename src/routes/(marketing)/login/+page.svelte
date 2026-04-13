<script lang="ts">
	import type { PageData } from './$types';
	import { goto } from '$app/navigation';

	export let data: PageData;

	let mode: 'password' | 'magic-link' = 'password';
	let email = '';
	let password = '';
	let error = '';
	let waiting = false;
	let emailSent = false;
	let code = '';

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
				await goto('/calendar');
				location.reload();
			}
		} catch (e) {
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
		} catch (e) {
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
				await goto('/calendar');
				location.reload();
			} else {
				const json = await res.json();
				error = json.error || 'Invalid code';
			}
		} catch (e) {
			error = 'Verification failed';
		}

		waiting = false;
	}

	async function resendCode() {
		await handleMagicLinkLogin();
	}
</script>

<svelte:head>
	<title>Family Planz: Login</title>
</svelte:head>

<div class="min-h-screen bg-slate-50">
	<div class="flex flex-col items-center px-4 pt-16">
		<div class="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-8 shadow-sm">
			<div class="mb-8 text-center">
				<h1 class="text-3xl font-bold text-slate-900">Welcome Back</h1>
				<p class="mt-2 text-slate-600">
					{#if data.isLoggedIn}
						You are already logged in
					{:else}
						Don't have an account? <a href="/signup" class="text-primary-600 hover:text-primary-700">Sign up</a>
					{/if}
				</p>
			</div>

			{#if data.isLoggedIn}
				<div class="text-center">
					<a href="/calendar" class="text-primary-600 hover:text-primary-500">Go to Calendar</a>
				</div>
			{:else}
				{#if error}
					<div class="mb-4 rounded-lg bg-red-50 p-3 text-sm text-red-600">
						{error}
					</div>
				{/if}

				{#if emailSent}
					<div class="text-center">
						<div class="mb-4 text-6xl">📧</div>
						<h2 class="mb-2 text-xl font-semibold text-slate-900">Check Your Email</h2>
						<p class="mb-6 text-slate-600">
							We've sent a login code to <strong>{email}</strong>
						</p>
						
						<form on:submit|preventDefault={handleCodeVerification} class="space-y-4">
							<input
								type="text"
								bind:value={code}
								placeholder="Enter login code"
								class="w-full rounded-lg border border-slate-300 px-4 py-3 text-center text-lg tracking-widest text-slate-900 placeholder-slate-400 focus:border-primary-500 focus:outline-none focus:ring-2 focus:ring-primary-500/20"
								required
							/>
							<button
								type="submit"
								disabled={waiting}
								class="w-full rounded-full bg-primary-600 px-4 py-3 font-medium text-white hover:bg-primary-700 disabled:bg-slate-400"
							>
								{waiting ? 'Logging in...' : 'Login'}
							</button>
						</form>

						<button
							on:click={resendCode}
							class="mt-4 text-sm text-slate-600 hover:text-primary-600"
						>
							Didn't receive the code? Resend
						</button>
					</div>
				{:else}
					<div class="mb-6 flex rounded-xl bg-slate-100 p-1">
						<button
							on:click={() => (mode = 'password')}
							class="flex-1 rounded-lg py-2.5 px-4 text-sm font-medium transition-all {mode === 'password'
								? 'bg-white text-slate-900 shadow-sm'
								: 'text-slate-500 hover:text-slate-700'}"
						>
							Password
						</button>
						<button
							on:click={() => (mode = 'magic-link')}
							class="flex-1 rounded-lg py-2.5 px-4 text-sm font-medium transition-all {mode === 'magic-link'
								? 'bg-white text-slate-900 shadow-sm'
								: 'text-slate-500 hover:text-slate-700'}"
						>
							Email Link
						</button>
					</div>

					{#if mode === 'password'}
						<form on:submit|preventDefault={handlePasswordLogin} class="space-y-5">
							<div>
								<label for="email" class="block text-sm font-medium text-slate-700">Email</label>
								<input
									id="email"
									type="email"
									bind:value={email}
									class="mt-1.5 block w-full rounded-lg border border-slate-300 px-4 py-2.5 focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500"
									required
								/>
							</div>

							<div>
								<label for="password" class="block text-sm font-medium text-slate-700">Password</label>
								<input
									id="password"
									type="password"
									bind:value={password}
									class="mt-1.5 block w-full rounded-lg border border-slate-300 px-4 py-2.5 focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500"
									required
								/>
							</div>

							<button
								type="submit"
								disabled={waiting}
								class="w-full rounded-lg bg-primary-600 px-4 py-3 font-semibold text-white hover:bg-primary-700 disabled:bg-slate-300"
							>
								{waiting ? 'Logging in...' : 'Login'}
							</button>
						</form>
					{:else}
						<form on:submit|preventDefault={handleMagicLinkLogin} class="space-y-4">
							<div>
								<label for="emailML" class="block text-sm font-medium text-slate-700">Email</label>
								<input
									id="emailML"
									type="email"
									bind:value={email}
									class="mt-1 block w-full rounded-lg border border-slate-300 px-3 py-2 text-slate-900 placeholder-slate-400 focus:border-primary-500 focus:outline-none focus:ring-2 focus:ring-primary-500/20"
									required
								/>
							</div>

							<button
								type="submit"
								disabled={waiting}
								class="w-full rounded-full bg-primary-600 px-4 py-3 font-medium text-white hover:bg-primary-700 disabled:bg-slate-400"
							>
								{waiting ? 'Sending...' : 'Send Login Link'}
							</button>
						</form>
					{/if}
				{/if}
			{/if}
		</div>
	</div>
</div>
