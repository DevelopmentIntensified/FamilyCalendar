<script lang="ts">
	import { onMount } from 'svelte';
	import type { PageData } from './$types';
	import { goto } from '$app/navigation';
	// import FluentColorMail16 from 'virtual:icons/fluent-color/mail-16';
	// import FluentColorNumberSymbolSquare20 from '~icons/fluent-color/number-symbol-square-20';

	export let data: PageData;
	console.warn('DEBUGPRINT[16]: +page.svelte:8: data=', data);

	let showEmail = false;
	let emailSent = false;
	let email = '',
		firstName = '',
		lastName = '';
	let error = '';
	let code = '';
	let waiting = false;

	async function handleCodeCheck() {
		waiting = true;
		const res = await fetch('/signup/email/code', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ code })
		});

		if (res.status === 500) {
			const json = await res.json();
			error = json.error;
		} else {
			await goto('/calendar');
			location.reload();
		}
		waiting = false;
	}

	const onEmailRegister = async () => {
		waiting = true;
		const res = await fetch('/signup/email', {
			method: 'POST',
			headers: {
				'Content-Type': 'application/json'
			},
			body: JSON.stringify({
				email,
				firstName,
				lastName
			})
		});
		const json = await res.json();
		if (json.error) {
			error = json.error;
			emailSent = false;
		} else {
			showEmail = false;
			emailSent = true;
		}
		waiting = false;
	};

	onMount(() => {
		let params = new URLSearchParams(window.location.search);
		let hasError = params.has('error');

		if (hasError) {
			error = params.get('error') as string;
		}
	});
</script>

<div>
	<div class="flex flex-col items-center px-4 pt-32">
		<div class="space-y-2 text-center">
			{#if data.isLoggedIn}
				<h1 class="text-3xl font-bold">You are already logged in</h1>
			{:else}
				<h1 class="mb-3 text-3xl font-bold">
					{emailSent ? 'Check Your Email' : 'Sign Up'}
				</h1>
				<p class="text-md m-auto max-w-80 font-medium text-gray-500 dark:text-gray-400">
					{#if emailSent}
						We've sent a code to your email. Please enter it below. If you don't see it, check your
						spam folder and mark it as not spam.
					{:else}
						Already have an account?
						<a class="underline" href="/login"> Login </a>
					{/if}
				</p>
			{/if}
		</div>
		{#if !data.isLoggedIn}
			<div class="w-full max-w-sm">
				<div class="h-6 w-full text-center text-red-400">
					{#if error !== ''}
						{error}
					{/if}
				</div>
				<form on:submit|preventDefault={emailSent ? handleCodeCheck : onEmailRegister}>
					{#if !emailSent}
						<div class="mb-2 flex flex-col space-y-4">
							<input
								class="inline-flex h-10 w-full items-center justify-center whitespace-nowrap rounded-md border px-4 py-2 text-sm font-medium"
								type="firstname"
								placeholder="Firstname"
								required
								minlength="3"
								bind:value={firstName}
							/>
							<input
								class="inline-flex h-10 w-full items-center justify-center whitespace-nowrap rounded-md border px-4 py-2 text-sm font-medium"
								type="lastname"
								placeholder="Lastname"
								required
								minlength="3"
								bind:value={lastName}
							/>
							<input
								class="inline-flex h-10 w-full items-center justify-center whitespace-nowrap rounded-md border px-4 py-2 text-sm font-medium"
								type="email"
								placeholder="Email"
								required
								bind:value={email}
							/>
						</div>
						<button
							type="submit"
							class="inline-flex h-10 w-full items-center justify-center whitespace-nowrap rounded-md border bg-secondary px-4 py-2 text-sm font-medium"
						>
							Sign Up
						</button>
					{:else}
						<div>
							<!-- <label for="code" class="block text-sm font-medium text-gray-700" -->
							<!-- 	>Verification Code</label -->
							<!-- > -->
							<div class="relative mb-3 rounded-md shadow-sm">
								<input
									id="code"
									name="code"
									type="text"
									required
									class="inline-flex h-10 w-full items-center justify-center whitespace-nowrap rounded-md border px-4 py-2 text-sm font-medium"
									placeholder="Enter verification code"
									bind:value={code}
								/>
							</div>
						</div>
						<div>
							<button
								type="submit"
								disabled={waiting}
								class="inline-flex h-10 w-full items-center justify-center whitespace-nowrap rounded-md border bg-secondary px-4 py-2 text-sm font-medium"
							>
								<span class="absolute inset-y-0 left-0 flex items-center pl-3"> </span>
								Verify Code
							</button>
						</div>
						<div class="text-center">
							<button
								type="button"
								disabled={waiting}
								on:click={onEmailRegister}
								class="text-sm text-primary-600 hover:text-primary-500"
							>
								Resend verification email
							</button>
						</div>
					{/if}
				</form>
			</div>
		{/if}
	</div>
</div>
