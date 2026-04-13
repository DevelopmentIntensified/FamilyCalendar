<script lang="ts">
	import { enhance } from '$app/forms';
	import { page } from '$app/stores';

	interface ActionData {
		success?: boolean;
		message?: string;
	}

	export let form: ActionData | null;

	const token = $page.url.searchParams.get('token');
	let loading = false;
	let verificationCode = '';
</script>

<div class="mx-auto max-w-md p-6">
	<h1 class="mb-6 text-2xl font-bold">Verify Email Change</h1>

	{#if form?.success}
		<div class="rounded-md bg-green-100 p-4 text-green-800">
			<p class="font-semibold">{form.message}</p>
			<p class="mt-2 text-sm">Your email has been updated. You can now return to your account page.</p>
			<a href="/account" class="mt-4 inline-block text-green-700 underline">Go to Account</a>
		</div>
	{:else if form && !form.success}
		<div class="mb-4 rounded-md bg-red-100 p-4 text-red-800">
			{form.message}
		</div>
	{/if}

	{#if !form?.success}
		{#if token}
			<div class="rounded-lg bg-blue-50 p-4 text-blue-800">
				<p class="mb-4">Click the button below to verify your email change.</p>
				<form method="POST" action="?/verify" use:enhance={() => {
					loading = true;
					return async ({ update }) => {
						loading = false;
						await update();
					};
				}}>
					<input type="hidden" name="token" value={token} />
					<button
						type="submit"
						disabled={loading}
						class="rounded-md bg-blue-600 px-4 py-2 text-white transition-colors hover:bg-blue-700 disabled:opacity-50"
					>
						{loading ? 'Verifying...' : 'Verify Email'}
					</button>
				</form>
			</div>
		{:else}
			<form method="POST" action="?/verify" use:enhance={() => {
				loading = true;
				return async ({ update }) => {
					loading = false;
					await update();
				};
			}} class="space-y-4">
				<div class="space-y-2">
					<label for="code" class="block font-medium">Verification Code</label>
					<input
						type="text"
						id="code"
						name="code"
						bind:value={verificationCode}
						class="w-full rounded-md border p-2"
						placeholder="Enter the 8-digit code"
						required
					/>
				</div>
				<button
					type="submit"
					disabled={loading}
					class="w-full rounded-md bg-blue-600 px-4 py-2 text-white transition-colors hover:bg-blue-700 disabled:opacity-50"
				>
					{loading ? 'Verifying...' : 'Verify'}
				</button>
			</form>
		{/if}
	{/if}
</div>