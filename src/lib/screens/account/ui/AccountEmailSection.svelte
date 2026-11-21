<!--
	Email: an Anonymous Account gets the Claim CTA instead of the change form
	(`#242`), never its placeholder address; a real account gets the address,
	`Status: Verified`/`Not Verified` and "Update Email" ("Updating..." while the
	save runs).
-->
<script lang="ts">
	import type { AccountSectionModel } from '../account.contract';
	import type { AccountFormEnhancer } from '../account.state.svelte';

	type AccountEmailModel = Extract<AccountSectionModel, { section: 'email' }>;

	interface Props {
		model: AccountEmailModel;
		enhance: AccountFormEnhancer;
	}

	let { model, enhance }: Props = $props();

	let emailLoading = $state(false);
	// #242: a guest claims, never changes.
	const registered = $derived(!model.isAnonymous && !!model.email);
</script>

<div id="email">
	<h2 class="mb-4 text-lg font-semibold text-slate-900">Email Address</h2>
	{#if !registered}
		<div class="space-y-3 text-sm text-slate-600">
			<p>No email yet — you're using a guest calendar.</p>
			<a
				href="/claim"
				class="inline-block rounded-full bg-primary-600 px-6 py-2.5 font-semibold text-white transition-colors hover:bg-primary-700"
				>Save your calendar with an email</a
			>
		</div>
	{:else}
		<form
			method="POST"
			action="?/updateEmail"
			use:enhance={() => {
				emailLoading = true;
				return async ({ update }) => {
					emailLoading = false;
					await update({ reset: false });
				};
			}}
			class="space-y-4"
		>
			<div class="space-y-2">
				<label for="emailAddress" class="block text-sm font-medium text-slate-700">Email</label>
				<input
					type="email"
					id="emailAddress"
					name="email"
					value={model.email}
					class="w-full rounded-xl border border-slate-300 px-4 py-2.5 transition-colors focus:border-primary-500 focus:outline-none focus:ring-2 focus:ring-primary-500/20"
					required
				/>
			</div>
			<div class="flex items-center gap-2">
				<span class="text-sm {model.emailVerified ? 'text-green-600' : 'text-slate-500'}">
					Status: {model.emailVerified ? 'Verified' : 'Not Verified'}
				</span>
				{#if model.emailVerified}
					<svg class="h-4 w-4 text-green-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
						<path
							stroke-linecap="round"
							stroke-linejoin="round"
							stroke-width="2"
							d="M5 13l4 4L19 7"
						/>
					</svg>
				{/if}
			</div>
			<button
				type="submit"
				disabled={emailLoading}
				class="rounded-full bg-primary-600 px-6 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-primary-700 disabled:opacity-50"
			>
				{emailLoading ? 'Updating...' : 'Update Email'}
			</button>
		</form>
	{/if}
</div>
