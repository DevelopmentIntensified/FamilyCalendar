<script lang="ts">
	import { enhance } from '$app/forms';
	import type { ActionData, PageData } from './$types';

	export let data: PageData;
	export let form: ActionData;

	let email = '';
	let loading = false;
</script>

<div class="mx-auto max-w-md p-6">
	<h1 class="mb-2 text-2xl font-bold text-slate-900">Save your calendar</h1>
	<p class="mb-6 text-sm text-slate-600">
		Add an email to sync your calendar across devices. Without it, your data stays on this device
		and is deleted after 90 days of inactivity.
	</p>

	{#if form?.success}
		<div class="rounded-lg border border-green-200 bg-green-50 p-4 text-sm text-green-700">
			Check <strong>{form.email}</strong> for a link to save your calendar. It expires in 15 minutes.
		</div>
	{:else}
		{#if form?.error}
			<div class="mb-4 rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700">
				{form.error}
			</div>
		{/if}

		<form
			method="POST"
			action="?/request"
			use:enhance={() => {
				loading = true;
				return async ({ update }) => {
					loading = false;
					await update();
				};
			}}
			class="space-y-4"
		>
			<div class="space-y-2">
				<label for="email" class="block text-sm font-medium text-slate-700">Email address</label>
				<input
					type="email"
					id="email"
					name="email"
					bind:value={email}
					required
					placeholder="you@example.com"
					class="w-full rounded-lg border border-slate-300 px-4 py-2.5"
				/>
			</div>

			<button
				type="submit"
				disabled={loading}
				class="w-full rounded-lg bg-primary-600 px-4 py-3 font-semibold text-white hover:bg-primary-700 disabled:opacity-50"
			>
				{loading ? 'Sending...' : 'Email me a save link'}
			</button>
		</form>
	{/if}

	<a href="/calendar" class="mt-6 block text-center text-sm text-slate-500 hover:text-slate-700">
		Not now — back to my calendar
	</a>
</div>
