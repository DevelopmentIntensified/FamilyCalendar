<script lang="ts">
	import type { PageData } from './$types';

	export let data: PageData;
	export let form: import('./$types').ActionData;
</script>

<svelte:head>
	<title>Set Password - Family Planz</title>
</svelte:head>

<div class="flex min-h-screen items-center justify-center bg-slate-50 px-4">
	<div class="w-full max-w-md rounded-2xl bg-white p-8 shadow-lg">
		<div class="mb-6 text-center">
			<div class="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-primary-100">
				<svg class="h-8 w-8 text-primary-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
					<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
				</svg>
			</div>
			<h1 class="mb-2 text-2xl font-bold text-slate-900">Create Your Password</h1>
			<p class="text-slate-600">
				Welcome, {data.firstName}! Set a password for <strong>{data.email}</strong> to join your family.
			</p>
		</div>

		{#if form?.error}
			<div class="mb-4 rounded-lg bg-red-50 p-4 text-sm text-red-600">{form.error}</div>
		{/if}

		<form method="POST" action="?/skip" class="mb-4">
			<input type="hidden" name="token" value={data.token} />
			<button
				type="submit"
				class="w-full rounded-lg border border-slate-300 px-4 py-3 text-sm font-semibold text-slate-600 transition-colors hover:bg-slate-50"
			>
				Skip for now &rarr;
			</button>
		</form>

		<form method="POST" class="space-y-4">
			<input type="hidden" name="token" value={data.token} />

			<div>
				<label for="password" class="mb-2 block text-sm font-medium text-slate-700">Password</label>
				<input
					type="password"
					id="password"
					name="password"
					required
					minlength="6"
					class="w-full rounded-lg border border-slate-300 px-4 py-2.5 transition-colors focus:border-primary-500 focus:outline-none focus:ring-2 focus:ring-primary-500/20"
				/>
			</div>

			<div>
				<label for="passwordConfirm" class="mb-2 block text-sm font-medium text-slate-700">Confirm Password</label>
				<input
					type="password"
					id="passwordConfirm"
					name="passwordConfirm"
					required
					minlength="6"
					class="w-full rounded-lg border border-slate-300 px-4 py-2.5 transition-colors focus:border-primary-500 focus:outline-none focus:ring-2 focus:ring-primary-500/20"
				/>
			</div>

			<button
				type="submit"
				class="w-full rounded-lg bg-primary-600 px-4 py-3 text-sm font-semibold text-white transition-colors hover:bg-primary-700"
			>
				Create Account & Join Family
			</button>
		</form>
	</div>
</div>
