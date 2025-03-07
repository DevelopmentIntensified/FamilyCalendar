<script lang="ts">
	import { onMount } from 'svelte';
	import type { PageData } from './$types';

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

	const onEmailRegister = async () => {
		waiting = true;
		const res = await fetch('/family/' + data.familyId + '/members/add/email', {
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
			<h1 class="mb-3 text-3xl font-bold">
				{emailSent ? 'Check Your Email' : 'Add Member'}
			</h1>
			<p class="text-md m-auto max-w-80 font-medium text-gray-500 dark:text-gray-400">
				{#if emailSent}
					We've sent a link to join your family to their email. Please tell them to check for it. If
					they don't see it,have them check the spam folder and mark it as not spam. If they don't
					get it at all, please try filling this form out again.
				{/if}
			</p>
		</div>
		<div class="w-full max-w-sm">
			<div class="h-6 w-full text-center text-red-400">
				{#if error !== ''}
					{error}
				{/if}
			</div>
			<form on:submit|preventDefault={onEmailRegister}>
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
						Add Member
					</button>
				{/if}
			</form>
		</div>
	</div>
</div>
