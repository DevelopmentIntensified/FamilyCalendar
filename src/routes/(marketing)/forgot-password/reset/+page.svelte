<script lang="ts">
	import { goto } from '$app/navigation';
	import { page } from '$app/stores';
	import { onMount } from 'svelte';

	let password = '';
	let confirmPassword = '';
	let error = '';
	let waiting = false;
	let token = '';
	let success = false;

	onMount(() => {
		token = $page.url.searchParams.get('token') || '';
		if (!token) {
			error = 'Invalid or missing reset token. Please request a new password reset.';
		}
	});

	async function handleSubmit() {
		waiting = true;
		error = '';

		if (!token) {
			error = 'Invalid reset token';
			waiting = false;
			return;
		}

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
			const res = await fetch('/forgot-password/reset', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ token, password })
			});

			const json = await res.json();

			if (json.error) {
				error = json.error;
			} else {
				success = true;
				setTimeout(() => goto('/login'), 3000);
			}
		} catch (e) {
			error = 'Failed to reset password';
		}

		waiting = false;
	}
</script>

<svelte:head>
	<title>Family Planz: Set New Password</title>
</svelte:head>

<div class="min-h-screen bg-slate-50">
	<div class="flex flex-col items-center px-4 pt-16">
		<div class="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-8 shadow-sm">
			<div class="mb-8 text-center">
				<h1 class="text-3xl font-bold text-slate-900">Set New Password</h1>
			</div>

			{#if error}
				<div class="mb-4 rounded-lg bg-red-50 p-3 text-sm text-red-600">
					{error}
				</div>
			{/if}

			{#if success}
				<div class="text-center">
					<div class="mb-4 text-6xl">✅</div>
					<h2 class="mb-2 text-xl font-semibold text-slate-900">Password Reset!</h2>
					<p class="text-slate-600">Redirecting to login...</p>
				</div>
			{:else if token}
				<form on:submit|preventDefault={handleSubmit} class="space-y-5">
					<div>
						<label for="password" class="block text-sm font-medium text-slate-700">New Password</label>
						<input
							id="password"
							type="password"
							bind:value={password}
							class="mt-1.5 block w-full rounded-lg border border-slate-300 px-4 py-2.5 focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500"
							required
						/>
					</div>

					<div>
						<label for="confirm" class="block text-sm font-medium text-slate-700">Confirm Password</label>
						<input
							id="confirm"
							type="password"
							bind:value={confirmPassword}
							class="mt-1.5 block w-full rounded-lg border border-slate-300 px-4 py-2.5 focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500"
							required
						/>
					</div>

					<button
						type="submit"
						disabled={waiting}
						class="w-full rounded-lg bg-primary-600 px-4 py-3 font-semibold text-white hover:bg-primary-700 disabled:bg-slate-300"
					>
						{waiting ? 'Resetting...' : 'Reset Password'}
					</button>
				</form>
			{/if}
		</div>
	</div>
</div>
