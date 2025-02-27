<script lang="ts">
	import { onMount } from 'svelte';
	import type { PageData } from './$types';
	export let data: PageData;

	let emailSent = false;
	let email = '';
	let error = '';

	const onEmailLogin = async () => {
		const res = await fetch('/login/email', {
			method: 'POST',
			headers: {
				'Content-Type': 'application/json'
			},
			body: JSON.stringify({
				email
			})
		});
		const json = await res.json();
		if (json.error) {
			error = json.error;
		} else {
			emailSent = true;
		}
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
		<div class=" text-center">
			{#if data.isLoggedIn}
				<h1 class="text-3xl font-bold">You are already logged in</h1>
			{:else}
				<h1 class="text-3xl font-bold mb-5">login in to your account</h1>
				<p class="text-md font-medium text-gray-500 dark:text-gray-400">
					Don't have an account?
					<a class="underline" href="/signup" rel="ugc"> Sign Up </a>
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
				<form
					on:submit|preventDefault={onEmailLogin}
					on:keydown={(e) => {
						error = '';
					}}
				>
					<div class="mb-2 flex flex-col">
						<input
							class="flex h-10 w-full rounded-md border px-3 py-2 text-sm"
							type="email"
							placeholder="Email"
							required
							bind:value={email}
						/>
					</div>
					<button
						type="submit"
						class="inline-flex h-10 w-full items-center justify-center whitespace-nowrap rounded-md border bg-secondary-300 px-4 py-2 text-sm font-medium"
					>
						Login
					</button>
				</form>
				{#if emailSent}
					<h1>Please check your email for a link to login with your email.</h1>
					<button
						class="inline-flex h-10 w-full items-center justify-center whitespace-nowrap rounded-md border bg-purple-300 px-4 py-2 text-sm font-medium"
						on:click={onEmailLogin}
					>
						Resend Email</button
					>
				{/if}
			</div>
		{/if}
	</div>
</div>
