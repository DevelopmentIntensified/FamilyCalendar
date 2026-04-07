<script lang="ts">
	import type { PageData } from './$types';
	import { goto } from '$app/navigation';

	export let data: PageData;

	let email = '';
	let password = '';
	let confirmPassword = '';
	let firstName = '';
	let lastName = '';
	let error = '';
	let waiting = false;

	async function handleSignup() {
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
				await goto('/calendar');
				location.reload();
			}
		} catch (e) {
			error = 'Failed to create account';
		}

		waiting = false;
	}
</script>

<svelte:head>
	<title>Family Planz: Sign Up</title>
</svelte:head>

<div class="min-h-screen bg-gray-100">
	<div class="flex flex-col items-center px-4 pt-16">
		<div class="w-full max-w-md rounded-lg bg-white p-8 shadow-lg">
			<div class="mb-6 text-center">
				<h1 class="text-3xl font-bold text-gray-900">Create Account</h1>
				<p class="mt-2 text-gray-600">
					{#if data.isLoggedIn}
						You are already logged in
					{:else}
						Already have an account? <a href="/login" class="text-primary-600 hover:text-primary-500">Sign in</a>
					{/if}
				</p>
			</div>

			{#if data.isLoggedIn}
				<div class="text-center">
					<a href="/calendar" class="text-primary-600 hover:text-primary-500">Go to Calendar</a>
				</div>
			{:else}
				{#if error}
					<div class="mb-4 rounded-md bg-red-50 p-3 text-sm text-red-600">
						{error}
					</div>
				{/if}

				<form on:submit|preventDefault={handleSignup} class="space-y-4">
					<div class="grid grid-cols-2 gap-4">
						<div>
							<label for="firstName" class="block text-sm font-medium text-gray-700">First Name</label>
							<input
								id="firstName"
								type="text"
								bind:value={firstName}
								class="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500"
								required
							/>
						</div>
						<div>
							<label for="lastName" class="block text-sm font-medium text-gray-700">Last Name</label>
							<input
								id="lastName"
								type="text"
								bind:value={lastName}
								class="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500"
								required
							/>
						</div>
					</div>

					<div>
						<label for="email" class="block text-sm font-medium text-gray-700">Email</label>
						<input
							id="email"
							type="email"
							bind:value={email}
							class="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500"
							required
						/>
					</div>

					<div>
						<label for="password" class="block text-sm font-medium text-gray-700">Password</label>
						<input
							id="password"
							type="password"
							bind:value={password}
							class="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500"
							required
							minlength="8"
						/>
						<p class="mt-1 text-xs text-gray-500">At least 8 characters</p>
					</div>

					<div>
						<label for="confirmPassword" class="block text-sm font-medium text-gray-700">Confirm Password</label>
						<input
							id="confirmPassword"
							type="password"
							bind:value={confirmPassword}
							class="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500"
							required
						/>
					</div>

					<button
						type="submit"
						disabled={waiting}
						class="w-full rounded-md bg-primary-600 px-4 py-3 font-medium text-white hover:bg-primary-700 disabled:bg-gray-400"
					>
						{waiting ? 'Creating Account...' : 'Create Account'}
					</button>
				</form>
			{/if}
		</div>
	</div>
</div>
